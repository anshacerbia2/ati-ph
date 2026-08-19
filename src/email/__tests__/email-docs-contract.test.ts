import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(
    path.join(root, rel),
    "utf8",
  );
}

describe("email documentation and environment contract", () => {
  it("documents the explicit real SMTP test command and safety gates", () => {
    for (const rel of [
      "README.md",
      "src/email/README.md",
      "docs/LOCAL-EMAIL-TESTING.md",
    ]) {
      const content = read(rel);

      expect(content).toContain(
        "npm run email:smtp:test -- --send",
      );
      expect(content).toContain(
        "EMAIL_SMTP_TEST_ENABLED",
      );
      expect(content).toContain(
        "EMAIL_SMTP_TEST_RECIPIENT",
      );
    }
  });

  it("keeps local and production example environments fail-closed by default", () => {
    for (const rel of [
      ".env.example",
      ".env.production.example",
    ]) {
      const content = read(rel);

      expect(content).toContain(
        "EMAIL_DELIVERY_MODE=DISABLED",
      );
      expect(content).toContain(
        "EMAIL_SMTP_TEST_ENABLED=false",
      );
    }
  });

  it("documents that SMTP job execution is still gated", () => {
    for (const rel of [
      "README.md",
      "src/email/README.md",
      "docs/EMAIL-DELIVERY-PLATFORM.md",
      "docs/LOCAL-EMAIL-TESTING.md",
    ]) {
      expect(read(rel)).toMatch(
        /SMTP[\s\S]{0,200}gate|gate[\s\S]{0,200}SMTP/i,
      );
    }
  });
});
