import { describe, expect, it } from "vitest";

import {
  CLIENT_LIST_DEFAULT_PAGE_SIZE,
  CLIENT_LIST_MAX_PAGE_SIZE,
  parseClientListQuery,
} from "@/clients/list-query";

describe("client list query", () => {
  it("defaults to page one and the governed page size", () => {
    expect(parseClientListQuery({})).toEqual({
      search: "",
      page: 1,
      pageSize: CLIENT_LIST_DEFAULT_PAGE_SIZE,
    });
  });

  it("normalizes search and parses positive pagination values", () => {
    expect(
      parseClientListQuery({
        search: "  Ticketing AU  ",
        page: "3",
        pageSize: "25",
      }),
    ).toEqual({
      search: "Ticketing AU",
      page: 3,
      pageSize: 25,
    });
  });

  it("fails safe for invalid page values and caps page size", () => {
    expect(
      parseClientListQuery({
        page: "-4",
        pageSize: "999",
      }),
    ).toEqual({
      search: "",
      page: 1,
      pageSize: CLIENT_LIST_MAX_PAGE_SIZE,
    });

    expect(
      parseClientListQuery({
        page: "not-a-number",
        pageSize: "0",
      }),
    ).toEqual({
      search: "",
      page: 1,
      pageSize: CLIENT_LIST_DEFAULT_PAGE_SIZE,
    });
  });
});
