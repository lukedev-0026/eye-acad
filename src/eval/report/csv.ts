// Reads a CSV file with a header row into one record per line. Handles quoted
// cells, doubled quotes inside them, and commas inside quotes.
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: Array<Array<string>> = [];
  let row: Array<string> = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  const [head, ...body] = rows;
  if (!head) return [];
  return body
    .filter((r) => r.length === head.length)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
