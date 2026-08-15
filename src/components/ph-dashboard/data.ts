export type HolidayStatus = "Scheduled" | "Sent";

export type HolidayRow = {
  holiday: string;
  date: string;
  reminder: string;
  status: HolidayStatus;
  recipients: string;
};

export const holidayRows: readonly HolidayRow[] = [
  {
    holiday: "Independence Day",
    date: "17 Aug 2026",
    reminder: "18 Jul 2026",
    status: "Sent",
    recipients: "48 clients",
  },
  {
    holiday: "Maulid Nabi Muhammad",
    date: "25 Aug 2026",
    reminder: "26 Jul 2026",
    status: "Sent",
    recipients: "48 clients",
  },
  {
    holiday: "Cuti Bersama — Christmas",
    date: "24 Dec 2026",
    reminder: "24 Nov 2026",
    status: "Scheduled",
    recipients: "48 clients",
  },
  {
    holiday: "Christmas Day",
    date: "25 Dec 2026",
    reminder: "25 Nov 2026",
    status: "Scheduled",
    recipients: "48 clients",
  },
  {
    holiday: "New Year’s Day",
    date: "1 Jan 2027",
    reminder: "2 Dec 2026",
    status: "Scheduled",
    recipients: "48 clients",
  },
];

export type DashboardStat = {
  label: string;
  value: string;
  delta: string;
  tone?: "positive" | "negative";
};

export const dashboardStats: readonly DashboardStat[] = [
  { label: "Holidays ahead", value: "6", delta: "Remaining in 2026" },
  { label: "Reminders scheduled", value: "3", delta: "Next send 25 Nov" },
  { label: "Clients subscribed", value: "48", delta: "+4 this quarter", tone: "positive" },
  { label: "Delivery rate", value: "99.1%", delta: "2 bounced last run", tone: "negative" },
];
