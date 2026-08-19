import { describe, expect, it } from "vitest";

import {
  computeNotificationContentSha256,
  formatWorkbookDatePeriod,
  GOVERNED_PH_EMAIL_TEMPLATE,
  renderGovernedNotificationContent,
} from "@/notifications/email-template";

describe("governed PH email template", () => {
  it("uses the active default source row from the supplied workbook", () => {
    expect(
      GOVERNED_PH_EMAIL_TEMPLATE.source,
    ).toEqual({
      workbook:
        "ModifByRF-FCTG-Master Data Template - PH Notifications",
      sheet: "Email Template",
      row: 2,
      client: "All",
      type: "Default",
      status: "Active",
    });

    expect(
      GOVERNED_PH_EMAIL_TEMPLATE
        .subjectTemplate,
    ).toBe(
      "ATI - [Client Name] Public Holiday Reminder - [PH Name] - [Date Period]",
    );
  });

  it("matches the workbook's successful single-date output shape", () => {
    const rendered =
      renderGovernedNotificationContent({
        clientName: "FCTG (SAMPLE)",
        holidayName:
          "Easter Sunday (SAMPLE)",
        targetHolidayDate:
          "2026-08-27",
      });

    expect(rendered.subject).toBe(
      "ATI - FCTG (SAMPLE) Public Holiday Reminder - Easter Sunday (SAMPLE) - 27 August 2026",
    );
    expect(rendered.html).toContain(
      "Hi FCTG (SAMPLE) Leaders,",
    );
    expect(rendered.html).toContain(
      "<strong>Date:</strong> 27 August 2026",
    );
    expect(rendered.html).toContain(
      "<strong>Public Holiday:</strong> Easter Sunday (SAMPLE)",
    );
    expect(rendered.attachments).toEqual(
      [],
    );
  });

  it("formats Date Period deterministically", () => {
    expect(
      formatWorkbookDatePeriod(
        "2027-01-04",
      ),
    ).toBe("4 January 2027");

    expect(() =>
      formatWorkbookDatePeriod(
        "2027-02-30",
      ),
    ).toThrow(
      "valid calendar date",
    );
  });

  it("escapes workbook tokens for HTML and strips header newlines", () => {
    const rendered =
      renderGovernedNotificationContent({
        clientName:
          "Client <A>\nLeaders",
        holidayName:
          "R&D > Holiday",
        targetHolidayDate:
          "2027-01-04",
      });

    expect(rendered.subject).toContain(
      "Client <A> Leaders",
    );
    expect(rendered.subject).not.toContain(
      "\n",
    );
    expect(rendered.html).toContain(
      "Client &lt;A&gt; Leaders",
    );
    expect(rendered.html).toContain(
      "R&amp;D &gt; Holiday",
    );
  });

  it("produces a deterministic frozen content checksum", () => {
    const rendered =
      renderGovernedNotificationContent({
        clientName: "Client A",
        holidayName:
          "Example Holiday",
        targetHolidayDate:
          "2027-01-04",
      });

    const first =
      computeNotificationContentSha256(
        rendered,
      );
    const second =
      computeNotificationContentSha256(
        rendered,
      );

    expect(first).toBe(second);
    expect(first).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });
});
