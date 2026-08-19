import { createHash } from "node:crypto";

import { z } from "zod";

export const GOVERNED_PH_EMAIL_TEMPLATE = {
  code: "FCTG_MASTER_DEFAULT",
  version: 1,
  source: {
    workbook:
      "ModifByRF-FCTG-Master Data Template - PH Notifications",
    sheet: "Email Template",
    row: 2,
    client: "All",
    type: "Default",
    status: "Active",
  },
  subjectTemplate:
    "ATI - [Client Name] Public Holiday Reminder - [PH Name] - [Date Period]",
  htmlTemplate: `<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Public Holiday Notification</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <p>Hi [Client Name] Leaders,</p>
    <p>I hope that you are always in good health.</p>
    <p>This email is being sent to you as a reminder that there will be an upcoming public holiday as presented below:</p>
    <ul style="list-style-type: none; padding-left: 0;">
        <li style="margin-bottom: 5px;"><strong>Date:</strong> [Date Period]</li>
        <li style="margin-bottom: 5px;"><strong>Public Holiday:</strong> [PH Name]</li>
    </ul>
    <p>Kindly please ensure that any required confirmation being advised to your respective client to maintain smooth operation at the time of public holiday dates.</p>
    <p>Have a wonderful day ahead,</p>
    <p>Regards,<br>
    ATI Public Holiday Notification</p>
</body>
</html>`,
} as const;

const sourceSchema = z.object({
  workbook: z.string().min(1),
  sheet: z.string().min(1),
  row: z.number().int().positive(),
  client: z.string().min(1),
  type: z.string().min(1),
  status: z.literal("Active"),
});

export const notificationEmailContentSnapshotSchema =
  z.object({
    schemaVersion: z.literal(1),
    templateCode: z.string().min(1),
    templateVersion:
      z.number().int().positive(),
    source: sourceSchema,
    subject: z.string().min(1).max(998),
    html: z.string().min(1),
    attachments: z.array(z.never()).length(0),
  });

export type NotificationEmailContentSnapshot =
  z.infer<
    typeof notificationEmailContentSnapshotSchema
  >;

export function renderGovernedNotificationContent(
  input: {
    clientName: string;
    holidayName: string;
    targetHolidayDate: string;
  },
): NotificationEmailContentSnapshot {
  const clientName =
    sanitizeHeaderValue(input.clientName);
  const holidayName =
    sanitizeHeaderValue(input.holidayName);
  const datePeriod =
    formatWorkbookDatePeriod(
      input.targetHolidayDate,
    );

  if (!clientName || !holidayName) {
    throw new Error(
      "Governed notification content requires client and holiday names.",
    );
  }

  const subject = replaceTokens(
    GOVERNED_PH_EMAIL_TEMPLATE.subjectTemplate,
    {
      "[Client Name]": clientName,
      "[PH Name]": holidayName,
      "[Date Period]": datePeriod,
    },
  );

  const html = replaceTokens(
    GOVERNED_PH_EMAIL_TEMPLATE.htmlTemplate,
    {
      "[Client Name]":
        escapeHtml(clientName),
      "[PH Name]": escapeHtml(holidayName),
      "[Date Period]":
        escapeHtml(datePeriod),
    },
  );

  return {
    schemaVersion: 1,
    templateCode:
      GOVERNED_PH_EMAIL_TEMPLATE.code,
    templateVersion:
      GOVERNED_PH_EMAIL_TEMPLATE.version,
    source: {
      ...GOVERNED_PH_EMAIL_TEMPLATE.source,
    },
    subject,
    html,
    attachments: [],
  };
}

export function parseNotificationContentSnapshot(
  value: unknown,
): NotificationEmailContentSnapshot {
  return notificationEmailContentSnapshotSchema.parse(
    value,
  );
}

export function computeNotificationContentSha256(
  snapshot: NotificationEmailContentSnapshot,
): string {
  return createHash("sha256")
    .update(stableStringify(snapshot))
    .digest("hex");
}

export function formatWorkbookDatePeriod(
  value: string,
): string {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      value,
    );

  if (!match) {
    throw new Error(
      "Holiday date must use ISO YYYY-MM-DD.",
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(
      "Holiday date must be a valid calendar date.",
    );
  }

  const monthName =
    MONTH_NAMES[month - 1];

  if (!monthName) {
    throw new Error(
      "Holiday date contains an invalid month.",
    );
  }

  return `${day} ${monthName} ${year}`;
}

function replaceTokens(
  template: string,
  values: Record<string, string>,
): string {
  let rendered = template;

  for (const [token, value] of Object.entries(
    values,
  )) {
    rendered = rendered.replaceAll(
      token,
      value,
    );
  }

  for (const token of Object.keys(values)) {
    if (rendered.includes(token)) {
      throw new Error(
        `Email template token ${token} was not fully rendered.`,
      );
    }
  }

  return rendered;
}

function sanitizeHeaderValue(
  value: string,
): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stableStringify(
  value: unknown,
): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(stableStringify)
      .join(",")}]`;
  }

  if (typeof value === "object") {
    const object =
      value as Record<string, unknown>;

    return `{${Object.keys(object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(
            key,
          )}:${stableStringify(
            object[key],
          )}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(null);
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
