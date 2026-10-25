import { Share } from 'react-native';

// Builds a CSV (comma separated text) from a header row + data rows.
// Quotes are escaped the way the CSV standard requires, so commas or
// quotes inside a student name cannot break the file.
export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const escapeCell = (value: string | number): string => {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','));
  return lines.join('\n');
}

// Opens the phone's share window with the CSV text, so the user can
// send it to a spreadsheet app, email it, or copy it. (No extra file
// library needed - react-native's Share is built in.)
export async function shareCsv(
  csv: string,
  title: string
): Promise<string | null> {
  try {
    await Share.share({ message: csv, title });
    return null;
  } catch {
    return 'Could not open the share window.';
  }
}
