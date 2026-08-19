import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const smtp = fs.readFileSync(
  path.join(root, "src/email/transports/smtp.ts"),
  "utf8",
);
const engine = fs.readFileSync(
  path.join(root, "src/email/engine.ts"),
  "utf8",
);

describe("generic email transport contract", () => {
  it("hardens generic SMTP attachment resolution", () => {
    expect(smtp).toContain("nodemailer.createTransport");
    expect(smtp).toContain("disableFileAccess: true");
    expect(smtp).toContain("disableUrlAccess: true");
  });

  it("keeps vendor names out of engine core", () => {
    for (const vendor of ["google", "brevo", "smtp2go"]) {
      expect(engine.toLowerCase()).not.toContain(vendor);
    }
  });
});
