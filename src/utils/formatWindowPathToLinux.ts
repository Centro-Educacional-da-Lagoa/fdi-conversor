export function formatWindowsPathToLinux(windowsPath: string): string {
  // Replace the initial part of the Windows path with the Linux equivalent
  let linuxPath = windowsPath.replace(
    /^\\\\192\.168\.2\.8\\fdi\\/,
    '../../../mnt/share/',
  );

  // Replace all backslashes with forward slashes
  linuxPath = linuxPath.replace(/\\/g, '/');
  console.log('🚀 ~ formatWindowsPathToLinux ~ linuxPath:', linuxPath);

  // Return the formatted path enclosed in single quotes
  return `'${linuxPath}'`;
}
