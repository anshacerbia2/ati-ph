import { describe, expect, it } from "vitest";

import { mountedPath, safeReturnTo, stripBasePath } from "@/config/app";

describe("app path helpers", () => {
  it("mounts paths below the ATI One route", () => {
    expect(mountedPath("/api/health")).toBe("/apps/ph-notification/app/api/health");
  });

  it("strips the configured base path", () => {
    expect(stripBasePath("/apps/ph-notification/app/login")).toBe("/login");
  });

  it("rejects external and protocol-relative return URLs", () => {
    expect(safeReturnTo("https://evil.example/path")).toBe("/");
    expect(safeReturnTo("//evil.example/path")).toBe("/");
  });

  it("keeps an internal return URL", () => {
    expect(safeReturnTo("/calendar?year=2027")).toBe("/calendar?year=2027");
  });
});
