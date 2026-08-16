import { describe, expect, it } from "vitest";

import {
  validationFieldLabel,
  validationIssueTitle,
} from "@/imports/issue-display";

describe("validation issue display labels", () => {
  it("renders operational issue titles instead of technical codes", () => {
    expect(
      validationIssueTitle("MULTI_REGION_NORMALIZED"),
    ).toBe("Multiple regions normalized");
    expect(
      validationIssueTitle("DERIVED_COLUMNS_IGNORED"),
    ).toBe("Derived Day and Tag columns ignored");
  });

  it("humanizes unknown codes rather than leaking identifier syntax", () => {
    expect(validationIssueTitle("SOME_NEW_CODE")).toBe(
      "Some new code",
    );
  });

  it("renders field names as human-readable labels", () => {
    expect(validationFieldLabel("regionCode")).toBe("Region");
    expect(validationFieldLabel("customField")).toBe(
      "Custom field",
    );
  });
});
