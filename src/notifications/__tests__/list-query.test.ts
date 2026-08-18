import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_LIST_DEFAULT_PAGE_SIZE,
  NOTIFICATION_LIST_MAX_PAGE_SIZE,
  parseNotificationListQuery,
} from "@/notifications/list-query";

describe("notification list query", () => {
  it("uses governed defaults", () => {
    expect(parseNotificationListQuery({})).toEqual({
      search: "",
      page: 1,
      pageSize: NOTIFICATION_LIST_DEFAULT_PAGE_SIZE,
    });
  });

  it("normalizes search and positive pagination values", () => {
    expect(
      parseNotificationListQuery({
        search: "  Australia  ",
        page: "3",
        pageSize: "25",
      }),
    ).toEqual({ search: "Australia", page: 3, pageSize: 25 });
  });

  it("fails safe and caps page size", () => {
    expect(
      parseNotificationListQuery({ page: "-1", pageSize: "999" }),
    ).toEqual({
      search: "",
      page: 1,
      pageSize: NOTIFICATION_LIST_MAX_PAGE_SIZE,
    });
  });
});
