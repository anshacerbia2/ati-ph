import { isValidTimeZone } from "@/notifications/policy-rules";

export class NotificationTimeError extends Error {
  constructor(
    public readonly code:
      | "INVALID_LOCAL_DATE"
      | "INVALID_LOCAL_TIME"
      | "INVALID_TIMEZONE"
      | "NONEXISTENT_LOCAL_TIME"
      | "AMBIGUOUS_LOCAL_TIME",
    message: string,
  ) {
    super(message);
    this.name = "NotificationTimeError";
  }
}

export function zonedLocalDateTimeToUtc(input: {
  localDate: string;
  localTime: string;
  timezone: string;
}): Date {
  const date = parseDate(input.localDate);
  const time = parseTime(input.localTime);

  if (!date) {
    throw new NotificationTimeError(
      "INVALID_LOCAL_DATE",
      `Invalid local date ${input.localDate}.`,
    );
  }

  if (!time) {
    throw new NotificationTimeError(
      "INVALID_LOCAL_TIME",
      `Invalid local time ${input.localTime}.`,
    );
  }

  if (!isValidTimeZone(input.timezone)) {
    throw new NotificationTimeError(
      "INVALID_TIMEZONE",
      `Invalid IANA timezone ${input.timezone}.`,
    );
  }

  const desiredUtcShape = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    time.hour,
    time.minute,
    0,
    0,
  );

  let candidate = desiredUtcShape;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const actual = localParts(
      new Date(candidate),
      input.timezone,
    );

    const actualUtcShape = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      0,
      0,
    );

    const delta = desiredUtcShape - actualUtcShape;
    candidate += delta;

    if (delta === 0) break;
  }

  const resolved = new Date(candidate);

  if (
    !matchesLocal(
      resolved,
      input.timezone,
      date,
      time,
    )
  ) {
    throw new NotificationTimeError(
      "NONEXISTENT_LOCAL_TIME",
      `${input.localDate} ${input.localTime} does not exist in ${input.timezone}, likely because of a timezone transition.`,
    );
  }

  const alternateOffsets = [
    -7_200_000,
    -5_400_000,
    -3_600_000,
    -1_800_000,
    1_800_000,
    3_600_000,
    5_400_000,
    7_200_000,
  ];

  if (
    alternateOffsets.some((offset) =>
      matchesLocal(
        new Date(candidate + offset),
        input.timezone,
        date,
        time,
      ),
    )
  ) {
    throw new NotificationTimeError(
      "AMBIGUOUS_LOCAL_TIME",
      `${input.localDate} ${input.localTime} is ambiguous in ${input.timezone} because of a timezone transition.`,
    );
  }

  return resolved;
}

function matchesLocal(
  instant: Date,
  timezone: string,
  date: { year: number; month: number; day: number },
  time: { hour: number; minute: number },
): boolean {
  const parts = localParts(instant, timezone);

  return (
    parts.year === date.year &&
    parts.month === date.month &&
    parts.day === date.day &&
    parts.hour === time.hour &&
    parts.minute === time.minute
  );
}

function localParts(instant: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const values = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function parseDate(
  value: string,
): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
  };
}

function parseTime(
  value: string,
): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return { hour, minute };
}
