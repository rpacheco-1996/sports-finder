export type When = {
  dayKey: string;
  dayLabel: string;
  timeLabel: string;
};

export function formatWhen(iso: string | null, timeZone: string): When {
  if (!iso) return { dayKey: "tbd", dayLabel: "Time TBD", timeLabel: "TBD" };
  const date = new Date(iso);
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const dayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  return { dayKey, dayLabel, timeLabel };
}

export function formatDayHeading(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, date, 12)));
}

export function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + delta, 12));
  return next.toISOString().slice(0, 10);
}

export function todayKey(timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
