import { describe, expect, it } from "vitest";

import {
  buildActiveRegionAliasMap,
  createCalendarRegionSchema,
  initialRegionAliases,
  isCanonicalRegionAlias,
  normalizeRegionAlias,
  updateCalendarRegionSchema,
} from "@/holiday/region-rules";

describe("calendar-region governance rules", () => {
  it("normalizes source aliases deterministically", () => {
    expect(normalizeRegionAlias("  United   Kingdom  ")).toBe("united kingdom");
  });

  it("normalizes and validates canonical region codes", () => {
    expect(
      createCalendarRegionSchema.parse({
        code: "gb",
        displayName: "United Kingdom",
      }).code,
    ).toBe("GB");

    expect(() =>
      createCalendarRegionSchema.parse({
        code: "g b",
        displayName: "Invalid",
      }),
    ).toThrow();
  });

  it("builds deduplicated initial aliases from code, name, and explicit aliases", () => {
    expect(
      initialRegionAliases({
        code: "GB",
        displayName: "United Kingdom",
        aliases: ["UK", " united  kingdom ", "gb"],
      }),
    ).toEqual([
      { alias: "GB", normalizedAlias: "gb" },
      { alias: "United Kingdom", normalizedAlias: "united kingdom" },
      { alias: "UK", normalizedAlias: "uk" },
    ]);
  });

  it("excludes inactive aliases and aliases owned by inactive regions", () => {
    const map = buildActiveRegionAliasMap([
      {
        normalizedAlias: "australia",
        isActive: true,
        region: { code: "AU", isActive: true },
      },
      {
        normalizedAlias: "au-old",
        isActive: false,
        region: { code: "AU", isActive: true },
      },
      {
        normalizedAlias: "legacy-gb",
        isActive: true,
        region: { code: "GB", isActive: false },
      },
    ]);

    expect([...map]).toEqual([["australia", "AU"]]);
  });

  it("fails closed if one normalized alias maps to different active regions", () => {
    expect(() =>
      buildActiveRegionAliasMap([
        {
          normalizedAlias: "shared",
          isActive: true,
          region: { code: "AU", isActive: true },
        },
        {
          normalizedAlias: "shared",
          isActive: true,
          region: { code: "ID", isActive: true },
        },
      ]),
    ).toThrow(/invariant violated/i);
  });

  it("requires an actual field for region updates", () => {
    expect(() => updateCalendarRegionSchema.parse({})).toThrow();
    expect(updateCalendarRegionSchema.parse({ isActive: false })).toEqual({
      isActive: false,
    });
  });

  it("recognizes the protected canonical code alias", () => {
    expect(isCanonicalRegionAlias("GB", "gb")).toBe(true);
    expect(isCanonicalRegionAlias("GB", "uk")).toBe(false);
  });
});
