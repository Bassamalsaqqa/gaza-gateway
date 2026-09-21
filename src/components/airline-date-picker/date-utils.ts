/**
 * Pure date parsing, formatting, and ISO string utilities for the AirlineDatePicker family.
 */

export function parseISOLocal(iso: string): Date | undefined {
  if (!iso) return undefined;
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return undefined;
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) return undefined;
  return new Date(year, month - 1, day, 12, 0, 0);
}

export function formatISOLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
