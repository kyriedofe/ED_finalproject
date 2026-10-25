// Small display helpers so every screen formats dates the same way.

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// '2026-10-21' -> 'Oct 21, 2026'
export function formatDate(yyyyMmDd: string | null | undefined): string {
  if (!yyyyMmDd) return 'No date';
  const [year, month, day] = yyyyMmDd.split('-').map(Number);
  if (!year || !month || !day) return yyyyMmDd;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

// '08:30' -> '8:30 AM'
export function formatTime(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const [hour, minute] = hhmm.split(':').map(Number);
  if (Number.isNaN(hour)) return hhmm;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

// Full timestamp from the database -> local string on this device.
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
