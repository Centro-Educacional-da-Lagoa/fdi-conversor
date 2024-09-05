export function parseLine(line) {
  const parts = [];
  let current = '';
  const inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === ' ' || char === '\t') {
      if (!inQuotes && current.trim() !== '') {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    } else {
      current += char;
    }
  }

  if (current.trim() !== '') {
    parts.push(current.trim());
  }

  return parts;
}
