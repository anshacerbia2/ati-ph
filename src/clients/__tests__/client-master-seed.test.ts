import { describe, expect, it } from "vitest";

import { CLIENT_MASTER_ROUTING_SEED } from "../../../prisma/seed-data/client-master-routing";

const ALLOWED_REGIONS = new Set([
  "Australia",
  "Indonesia",
  "North America",
  "South Africa",
  "United Kingdom",
]);

describe("Client_Master routing bootstrap fixture", () => {
  it("contains all 50 production clients and excludes sample rows", () => {
    expect(CLIENT_MASTER_ROUTING_SEED.records).toHaveLength(50);
    expect(CLIENT_MASTER_ROUTING_SEED.excludedSampleRows).toBe(6);

    const names = CLIENT_MASTER_ROUTING_SEED.records.map((row) =>
      row.clientName.trim().toLowerCase(),
    );

    expect(new Set(names).size).toBe(50);
    expect(names.some((name) => name.includes("sample"))).toBe(false);
  });

  it("preserves the source region, status, and day-filter domains", () => {
    for (const row of CLIENT_MASTER_ROUTING_SEED.records) {
      expect(ALLOWED_REGIONS.has(row.region)).toBe(true);
      expect(["Weekdays", "Weekend"]).toContain(row.dayFilter);
      expect(["Active", "Inactive"]).toContain(row.status);
    }
  });

  it("contains 140 client-owned contacts/recipient assignments", () => {
    const pairs = new Set<string>();
    let assignments = 0;

    for (const row of CLIENT_MASTER_ROUTING_SEED.records) {
      const to = new Set(row.to.map((email) => email.trim().toLowerCase()));
      const cc = new Set(row.cc.map((email) => email.trim().toLowerCase()));

      expect(row.to.length).toBeGreaterThan(0);

      for (const email of [...to, ...cc]) {
        expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
        expect(email.endsWith("@dummy.test")).toBe(true);
        pairs.add(`${row.clientName.trim().toLowerCase()}::${email}`);
        assignments += 1;
      }

      expect([...to].some((email) => cc.has(email))).toBe(false);
    }

    expect(pairs.size).toBe(140);
    expect(assignments).toBe(140);
  });

  it("includes representative production clients from the workbook", () => {
    const names = new Set(
      CLIENT_MASTER_ROUTING_SEED.records.map((row) => row.clientName),
    );

    expect(names.has("Ticketing AU")).toBe(true);
    expect(names.has("Refund Global")).toBe(true);
    expect(names.has("Operation Support")).toBe(true);
    expect(names.has("Envoyage CA - Consultant Support")).toBe(true);
  });
});
