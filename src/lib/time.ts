export function isoDateOnly(d = new Date()) {
  return d.toISOString().split("T")[0];
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isWithinNextDays(dateStr: string, days: number, now = new Date()) {
  // dateStr is "YYYY-MM-DD"
  const target = new Date(`${dateStr}T00:00:00`);
  const max = addDays(now, days);
  return target >= new Date(now.toDateString()) && target <= max;
}

export function isBeforeToday(dateStr: string, now = new Date()) {
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date(now.toDateString());
  return target < today;
}

