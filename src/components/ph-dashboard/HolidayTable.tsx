"use client";

import { useMemo, useState } from "react";

import { holidayRows, type HolidayStatus } from "@/components/ph-dashboard/data";

type Filter = "All" | HolidayStatus;
const filters: readonly Filter[] = ["All", "Scheduled", "Sent"];

export function HolidayTable() {
  const [filter, setFilter] = useState<Filter>("All");
  const rows = useMemo(
    () => filter === "All" ? holidayRows : holidayRows.filter((row) => row.status === filter),
    [filter],
  );

  return (
    <section className="table-panel" aria-labelledby="holiday-table-title">
      <header className="panel-header">
        <h2 id="holiday-table-title">Indonesian public holiday calendar 2026</h2>
        <div
          className="filter-list"
          role="group"
          aria-label="Filter holidays"
          suppressHydrationWarning
        >
          {filters.map((item) => (
            <button
              className={`ati-tag${filter === item ? " ati-tag--selected" : ""}`}
              key={item}
              onClick={() => setFilter(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </header>

      <div className="table-scroll" suppressHydrationWarning>
        <table>
          <thead>
            <tr>
              <th>Public holiday</th>
              <th>Holiday date</th>
              <th>Reminder sent 30 days prior</th>
              <th>Status</th>
              <th className="align-right">Recipients</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.holiday}>
                <td className="holiday-name">{row.holiday}</td>
                <td>{row.date}</td>
                <td>{row.reminder}</td>
                <td>
                  <span className={`ati-badge ${row.status === "Sent" ? "ati-badge--success" : "ati-badge--brand"}`}>
                    {row.status}
                  </span>
                </td>
                <td className="align-right recipients">{row.recipients}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-footer">
        Showing {rows.length} of 17 gazetted holidays · reminders auto-send 30 days before each date
      </p>
    </section>
  );
}
