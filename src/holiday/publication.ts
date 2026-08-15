export type ExpandedHolidayDate = {
  date: string;
  dayOfWeek:
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY";
  dayType: "WEEKDAY" | "WEEKEND";
};

const DAY_NAMES: ExpandedHolidayDate["dayOfWeek"][] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export function expandHolidayDateRange(
  startDate: string,
  endDate: string,
): ExpandedHolidayDate[] {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);

  if (end.getTime() < start.getTime()) {
    throw new Error("Holiday end date cannot precede start date.");
  }

  const dates: ExpandedHolidayDate[] = [];

  for (
    let cursor = start;
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    const day = cursor.getUTCDay();
    dates.push({
      date: cursor.toISOString().slice(0, 10),
      dayOfWeek: DAY_NAMES[day],
      dayType:
        day === 0 || day === 6 ? "WEEKEND" : "WEEKDAY",
    });
  }

  return dates;
}

export function toDatabaseDate(value: string): Date {
  return parseIsoDate(value);
}

function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ISO holiday date: ${value}`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Invalid ISO holiday date: ${value}`);
  }

  return parsed;
}
