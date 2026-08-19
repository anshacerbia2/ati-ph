import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("notification pure-rule boundaries", () => {
  it("keeps plan readiness rules outside server-only orchestration", () => {
    const rules = fs.readFileSync(
      path.join(root, "src/notifications/plan-rules.ts"),
      "utf8",
    );
    const engine = fs.readFileSync(
      path.join(root, "src/notifications/plan-engine.ts"),
      "utf8",
    );

    expect(rules).not.toContain('import "server-only"');
    expect(engine).toContain('import "server-only"');
    expect(engine).toContain(
      'from "@/notifications/plan-rules"',
    );
  });

  it("keeps initial job status rules outside server-only job persistence", () => {
    const rules = fs.readFileSync(
      path.join(root, "src/notifications/job-rules.ts"),
      "utf8",
    );
    const jobs = fs.readFileSync(
      path.join(root, "src/notifications/jobs.ts"),
      "utf8",
    );

    expect(rules).not.toContain('import "server-only"');
    expect(jobs).toContain('import "server-only"');
    expect(jobs).toContain(
      'from "@/notifications/job-rules"',
    );
  });
});
