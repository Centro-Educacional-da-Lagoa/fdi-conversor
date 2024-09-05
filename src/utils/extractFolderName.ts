export function extractFolderName(filePath: string): string | null {
  const regex = /cache\\(.*?\\\d+)/;
  const match = filePath.match(regex);

  if (match && match[1]) {
    // Remove the trailing number and backslash from the match
    return match[1].replace(/\\\d+$/, '');
  } else {
    return null; // Handle the case where no match is found
  }
}
