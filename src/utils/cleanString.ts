export function cleanString(str: string): string {
  if (!str) {
    return '';
  }
  return str.trim().replace(/\s+/g, ' ').toUpperCase();
}
