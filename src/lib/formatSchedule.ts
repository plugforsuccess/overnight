export function formatSchedule(days: string[], start: string, end: string): string {
  const dayRange =
    days.length > 1
      ? `${days[0]}–${days[days.length - 1]}`
      : (days[0] ?? '');

  if (!dayRange) return `${start} – ${end}`;

  return `${dayRange} • ${start} – ${end}`;
}

