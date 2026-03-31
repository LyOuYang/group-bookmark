export function normalizeTerm(value: string): string {
  return value.trim().toLowerCase();
}

export function extractNormalizedTerm(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? normalizeTerm(trimmed) : undefined;
}
