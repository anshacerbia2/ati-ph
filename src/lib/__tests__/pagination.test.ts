import { describe, expect, it } from "vitest";

import {
  buildPageHref,
  createPagination,
  parsePageParam,
} from "@/lib/pagination";

describe("pagination", () => {
  it("parses only positive integer page values", () => {
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam(["4", "5"])).toBe(4);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-2")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam(undefined)).toBe(1);
  });

  it("creates a stable offset window and clamps oversized pages", () => {
    expect(
      createPagination({
        total: 25,
        requestedPage: 2,
        pathname: "/imports",
        pageParam: "importsPage",
        searchParams: {},
      }),
    ).toMatchObject({
      page: 2,
      pageSize: 10,
      pageCount: 3,
      total: 25,
      offset: 10,
      from: 11,
      to: 20,
      previousHref: "/imports",
      nextHref: "/imports?importsPage=3",
    });

    expect(
      createPagination({
        total: 25,
        requestedPage: 999,
        pathname: "/imports",
        pageParam: "importsPage",
        searchParams: {},
      }),
    ).toMatchObject({
      page: 3,
      offset: 20,
      from: 21,
      to: 25,
      nextHref: null,
    });
  });

  it("preserves independent pagination parameters", () => {
    const href = buildPageHref(
      "/imports/batch-1",
      {
        rowsPage: "2",
        issuesPage: "4",
        publishedPage: "3",
        filter: ["one", "two"],
      },
      "rowsPage",
      5,
    );

    expect(href).toBe(
      "/imports/batch-1?issuesPage=4&publishedPage=3&filter=one&filter=two&rowsPage=5",
    );
  });

  it("removes the current page parameter for page one", () => {
    expect(
      buildPageHref(
        "/imports/batch-1",
        {
          rowsPage: "7",
          issuesPage: "2",
        },
        "rowsPage",
        1,
      ),
    ).toBe("/imports/batch-1?issuesPage=2");
  });

  it("represents an empty dataset without fake row ranges", () => {
    expect(
      createPagination({
        total: 0,
        requestedPage: 1,
        pathname: "/imports",
        pageParam: "importsPage",
        searchParams: {},
      }),
    ).toMatchObject({
      page: 1,
      pageCount: 1,
      offset: 0,
      from: 0,
      to: 0,
      previousHref: null,
      nextHref: null,
    });
  });
});
