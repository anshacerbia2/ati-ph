export function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
