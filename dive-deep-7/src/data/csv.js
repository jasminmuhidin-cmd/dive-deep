// ---------------------------------------------------------------------------
// csv.js — a small, dependency-free CSV parser (RFC 4180 style).
// Handles: UTF-8 BOM, CRLF / LF / CR line endings, quoted fields containing
// commas or line breaks, "" as an escaped quote, and a missing final newline.
// Returns rows of strings; blank lines are skipped.
// ---------------------------------------------------------------------------
export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);      // BOM

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0].trim() === '')) rows.push(row); // skip blank lines
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }            // escaped quote
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else if (ch === '\n') {
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) endRow();                    // no trailing newline
  return rows;
}
