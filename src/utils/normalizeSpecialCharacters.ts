export function normalizeSpecialCharacters(text: string): string {
  return text
    .normalize('NFD') // Decomposes combined characters into their base characters and diacritical marks
    .replace(/[\u0300-\u036f]/g, '') // Removes diacritical marks
    .replace(/�/g, '') // Removes the replacement character
    .replace(/[^a-zA-Z0-9\s]/g, '') // Removes other special characters, keeping only alphanumeric and spaces
    .trim(); // Trim whitespace
}
