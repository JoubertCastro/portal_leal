// Business matching rule, not a probability or proof of identity.
export function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).sort().join(' ');
}
export function nameSimilarity(left: string, right: string): number {
  if (left.length > 250 || right.length > 250) return 0;
  const a = normalizeName(left); const b = normalizeName(right);
  if (!a || !b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return (Math.max(a.length, b.length) - previous[b.length]) / Math.max(a.length, b.length);
}
export function compatibleNames(names: string[]): boolean {
  const unique = [...new Set(names.map(normalizeName))];
  if (!unique.length || unique.length > 32 || unique.some(name => !name || name.length > 250)) return false;
  // Every pair must pass: a chain of partial matches cannot bridge different people.
  return unique.every((name, index) => unique.slice(index + 1).every(other => nameSimilarity(name, other) >= 0.6));
}
