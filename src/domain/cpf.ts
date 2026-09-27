export function normalizeCpf(value: string): string { return value.replace(/\D/g, ''); }
export function validCpf(value: string): boolean {
  if (!/^[\d.\-\s]+$/.test(value)) return false;
  const digits = normalizeCpf(value);
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i);
    if ((sum * 10) % 11 % 10 !== Number(digits[length])) return false;
  }
  return true;
}
export function formatCpf(value: string): string {
  return normalizeCpf(value).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
