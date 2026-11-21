// A fast drop-in for csv-reader 1.0.0: run(input) returns exactly csv-reader's
// {columns, rows, errors} for an input {text, header}, but reads the text with
// native indexOf/split jumps instead of one character at a time.
//
// How it stays identical:
//  - the text is read once, left to right; a record ends at LF or CRLF, a line
//    left with no characters is no record, a CR outside quotes not followed by
//    LF is dropped (stray_cr);
//  - a field that opens with a quote runs to the next quote that is not doubled,
//    "" inside it is one quote and each CRLF or lone CR inside it reads as LF;
//    what follows its closing quote, up to the next comma or line break, is
//    appended as it stands (quote_junk, when the field ends); a quote that never
//    closes is a literal character and the text after it is read again as
//    unquoted (unterminated_quote); a quote inside an unquoted field is literal;
//  - columns is the first record when header is true, else null; rows holds the
//    records after it, each padded with "" (short_row, with fields: its count)
//    or cut (long_row, with extra: the cut fields) to the first record's width;
//  - each error is {code, line, row} in the order met, a record's short_row or
//    long_row when it ends: line the 1-based line its record starts on, row its
//    record's index in rows, null for the header.
//
// Speed: a record whose line holds no quote and no stray CR is split natively
// (one slice, one split(',')); only a record with quotes or a stray CR takes
// the field-by-field path, which itself jumps between special characters with
// indexOf instead of stepping character by character, and every scan it makes
// is bounded by the field or record it is reading.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // Appends a quoted field's chunk to its value, reading each CRLF or lone CR
  // inside it as one LF and counting every line break.
  function appendQuotedChunk(value, chunk) {
    if (chunk.indexOf('\r') === -1 && chunk.indexOf('\n') === -1) return value + chunk;
    let out = value;
    let i = 0;
    const m = chunk.length;
    while (i < m) {
      const cr = chunk.indexOf('\r', i);
      const lf = chunk.indexOf('\n', i);
      let next = -1;
      let isCr = false;
      if (cr !== -1) { next = cr; isCr = true; }
      if (lf !== -1 && (next === -1 || lf < next)) { next = lf; isCr = false; }
      if (next === -1) return out + chunk.slice(i, m);
      out += chunk.slice(i, next);
      out += '\n';
      line += 1;
      i = isCr && chunk.charCodeAt(next + 1) === 10 ? next + 2 : next + 1;
    }
    return out;
  }

  // Reads unquoted characters onto `value` up to the next comma or line break:
  // a CR not followed by LF is dropped (stray_cr). Returns the field and how it
  // ended; `added` counts the characters kept.
  function readUnquoted(value) {
    let added = 0;
    while (pos < n) {
      const comma = text.indexOf(',', pos);
      const lf = text.indexOf('\n', pos);
      let next = n;
      let kind = END;
      if (comma !== -1) { next = comma; kind = COMMA; }
      if (lf !== -1 && lf < next) { next = lf; kind = LINE_BREAK; }
      const seg = text.slice(pos, next);
      const r = seg.indexOf('\r');
      if (r === -1) {
        value += seg;
        added += seg.length;
        pos = next;
        if (kind === COMMA) { pos += 1; return { value, ended: COMMA, added }; }
        if (kind === LINE_BREAK) { pos += 1; line += 1; return { value, ended: LINE_BREAK, added }; }
        return { value, ended: END, added };
      }
      if (kind === LINE_BREAK && r === seg.length - 1) {
        // The CR is the CRLF's: the field ends at the line break.
        value += seg.slice(0, r);
        added += r;
        pos = next + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A stray CR: drop it (error) and keep reading the same field.
      value += seg.slice(0, r);
      added += r;
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos += r + 1;
    }
    return { value, ended: END, added };
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let closed = false;
    while (pos < n) {
      const q = text.indexOf('"', pos);
      if (q === -1) break;
      value = appendQuotedChunk(value, text.slice(pos, q));
      pos = q;
      if (text.charCodeAt(q + 1) === 34) {
        value += '"';
        pos = q + 2;
        continue;
      }
      pos = q + 1;
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it
      // is read again as an unquoted field.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    if (pos >= n) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) { pos += 1; return { value, ended: COMMA }; }
    if (c === 10) { pos += 1; line += 1; return { value, ended: LINE_BREAK }; }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; return { value, ended: LINE_BREAK }; }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  // Reads one record field by field (the slow path: the record holds a quote or
  // a stray CR). Returns its fields, or null for a line left with no characters.
  function readRecordSlow() {
    const fields = [];
    let quoted = false;
    let field;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);
    if (fields.length === 1 && fields[0] === '' && !quoted) return null;
    return fields;
  }

  // Files one record's fields: the header, or a row padded or cut to the width.
  function fileRecord(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? n : nl;
    const seg = text.slice(pos, lineEnd);
    if (seg.indexOf('"') === -1) {
      const r = seg.indexOf('\r');
      if (r === -1 || (nl !== -1 && r === seg.length - 1)) {
        // A clean record: no quotes, and no CR but a CRLF ending. Split it natively.
        const fields = (r === -1 ? seg : seg.slice(0, seg.length - 1)).split(',');
        pos = nl === -1 ? n : nl + 1;
        line += 1;
        fileRecord(fields);
        continue;
      }
    }
    const fields = readRecordSlow();
    if (fields !== null) fileRecord(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
