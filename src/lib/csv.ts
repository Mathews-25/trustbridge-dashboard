export function escapeCsvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows]
    .map((line) => line.map(escapeCsvCell).join(","))
    .join("\n");
}

export function buildCsvFilename(prefix: string, date = new Date()): string {
  return `${prefix}-${date.toISOString().slice(0, 10)}.csv`;
}

export function buildJson(headers: string[], rows: unknown[][]): string {
  const objects = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
  return JSON.stringify(objects, null, 2);
}

export function buildJsonFilename(prefix: string, date = new Date()): string {
  return `${prefix}-${date.toISOString().slice(0, 10)}.json`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
