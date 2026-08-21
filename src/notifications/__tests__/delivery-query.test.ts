import { describe, expect, it } from "vitest";

import { parseDeliveryListQuery } from "@/notifications/delivery-query";

describe("parseDeliveryListQuery", () => {
  it("keeps only statuses the system actually has", () => {
    /*
     * The list arrives from checkboxes in a URL. A stale bookmark naming a status that
     * no longer exists should show the rest rather than an error page — the request is
     * still answerable, and refusing it teaches people not to share links.
     */
    const query = parseDeliveryListQuery({
      status: "SENT,LEGACY_STATUS,failed",
    });

    /*
     * Canonical order, not the order they arrived in: the result is derived by filtering
     * the known list, so two URLs naming the same statuses produce the same query.
     */
    expect(query.statuses).toEqual(["SENT", "FAILED"]);
  });

  it("treats no status as no status filter, not as none selected", () => {
    const query = parseDeliveryListQuery({});

    expect(query.statuses).toEqual([]);
  });

  it("rejects a date that is not a real calendar day", () => {
    /*
     * `2026-02-31` parses to 3 March in every JavaScript date constructor. A filter that
     * silently shifts the day somebody typed is worse than one that ignores it, so this
     * is validated by round-trip rather than by shape alone.
     */
    expect(parseDeliveryListQuery({ from: "2026-02-31" }).from).toBeNull();
    expect(parseDeliveryListQuery({ from: "2026-02-28" }).from).toBe(
      "2026-02-28",
    );
  });

  it("ignores dates that are not plain calendar keys", () => {
    for (const value of [
      "",
      "2026-8-1",
      "01/08/2026",
      "2026-08-01T00:00:00Z",
      "yesterday",
    ]) {
      expect(parseDeliveryListQuery({ from: value }).from).toBeNull();
    }
  });

  it("caps the page size and falls back on nonsense", () => {
    expect(parseDeliveryListQuery({ pageSize: "5000" }).pageSize).toBe(50);
    expect(parseDeliveryListQuery({ pageSize: "-3" }).pageSize).toBe(20);
    expect(parseDeliveryListQuery({ page: "abc" }).page).toBe(1);
  });

  it("bounds the search text rather than passing an arbitrary string to the database", () => {
    const query = parseDeliveryListQuery({
      search: `  ${"x".repeat(500)}  `,
    });

    expect(query.search).toHaveLength(200);
  });
});
