import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const helperDir = path.join(scriptDir, ".ati-ph-payload");
const manifestPath = path.join(helperDir, "manifest.json");

if (!fs.existsSync(manifestPath)) {
  throw new Error(
    "Missing .ati-ph-payload/manifest.json. Extract the ZIP completely before running this script.",
  );
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function decode(value) {
  return Buffer.from(value, "base64").toString("utf8");
}

function capture(command, args = []) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
}

function run(command, args = []) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
}

function read(rel) {
  return fs
    .readFileSync(path.join(root, rel), "utf8")
    .replace(/\r\n/g, "\n");
}

function write(rel, content) {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content.replace(/\r\n/g, "\n"), "utf8");
  console.log(`wrote ${rel}`);
}

function replaceVersion(rel, before, after) {
  const current = read(rel);
  if (current.includes(after)) {
    return current;
  }
  if (!current.includes(before)) {
    throw new Error(
      `${rel}: expected version marker ${before} was not found.`,
    );
  }
  return current.replace(before, after);
}

function insertBeforeHeading(text, heading, block) {
  if (text.includes(block.trim())) {
    return text;
  }

  const index = text.indexOf(heading);
  if (index >= 0) {
    return (
      text.slice(0, index) +
      block.trimEnd() +
      "\n\n" +
      text.slice(index)
    );
  }

  return text.trimEnd() + "\n\n" + block.trimEnd() + "\n";
}

const branch = capture("git", ["branch", "--show-current"]).trim();

if (branch !== "gpt/phase1-region-registry") {
  throw new Error(
    `Expected gpt/phase1-region-registry, found ${branch}`,
  );
}

// Correct baseline: canonical publication already succeeded.
for (const [rel, marker] of [
  ["package.json", "\"verify:fast\""],
  ["package.json", "\"exceljs\""],
  ["plan.md", "| Version | 0.3.14 |"],
  ["architecture.md", "| Version | 0.3.14 |"],
  ["docs/GOVERNED-IMPORT-CONTRACT.md", "| Version | 1.5-draft |"],
  ["prisma/schema.prisma", "model HolidayDefinition"],
  ["prisma/schema.prisma", "model ApprovalRequest"],
  [
    "prisma/migrations/20260816010500_add_canonical_holiday_publication/migration.sql",
    "holiday_occurrences",
  ],
]) {
  if (
    !fs.existsSync(path.join(root, rel)) ||
    !read(rel).includes(marker)
  ) {
    throw new Error(
      `${rel} is missing expected canonical baseline marker ${marker}.`,
    );
  }
}

if (
  read("prisma/schema.prisma").includes("clientPreviewSha256") ||
  fs.existsSync(
    path.join(
      root,
      "prisma/migrations/20260816020000_add_import_preview_verification",
    ),
  )
) {
  throw new Error(
    "SheetJS preview verification already appears to be applied. Stop and inspect instead of applying it twice.",
  );
}

// Resolve every CODE replacement before mutating dependencies/files.
const finalFiles = new Map();

for (const [rel, before64, after64] of manifest.ops) {
  const before = decode(before64);
  const after = decode(after64);
  const current = finalFiles.has(rel)
    ? finalFiles.get(rel)
    : read(rel);

  if (!current.includes(before)) {
    throw new Error(
      `${rel}: expected code replacement marker was not found during preflight.`,
    );
  }

  finalFiles.set(rel, current.replace(before, after));
}

// Prepare docs semantically instead of relying on brittle full-sentence markers.
let plan = replaceVersion(
  "plan.md",
  "| Version | 0.3.14 |",
  "| Version | 0.3.15 |",
);

const completedBullet =
  "- Browser-side SheetJS preprocessing and preview before upload, followed by asynchronous authoritative raw-workbook verification in the worker using a deterministic SHA-256 preview fingerprint";

if (!plan.includes(completedBullet)) {
  const anchor =
    "- Idempotent canonical holiday publication from approved staging with holiday definition/occurrence/region/date persistence, inclusive multi-day expansion, derived weekday/weekend classification, immutable source-row lineage, and publication audit/outbox event";

  if (plan.includes(anchor)) {
    plan = plan.replace(anchor, `${anchor}\n${completedBullet}`);
  } else {
    const pendingHeading =
      "Still pending before the Phase 1 exit gate is complete:";

    if (plan.includes(pendingHeading)) {
      plan = plan.replace(
        pendingHeading,
        `${completedBullet}\n\n${pendingHeading}`,
      );
    } else {
      plan = `${plan.trimEnd()}\n\n${completedBullet}\n`;
    }
  }
}

if (!plan.includes("- End-to-end smoke with the worker running")) {
  const pendingHeading =
    "Still pending before the Phase 1 exit gate is complete:";

  if (plan.includes(pendingHeading)) {
    plan = plan.replace(
      pendingHeading,
      `${pendingHeading}\n\n- End-to-end smoke with the worker running`,
    );
  } else {
    plan +=
      "\n\n## Remaining Phase 1 acceptance\n\n- End-to-end smoke with the worker running\n";
  }
}

if (!plan.includes("clientPreviewSha256")) {
  const persistenceAnchor =
    "The Phase 1 persistence baseline now includes reusable approval state plus canonical holiday definition, occurrence, region-relation, and expanded occurrence-date lineage";

  if (plan.includes(persistenceAnchor)) {
    plan = plan.replace(
      persistenceAnchor,
      `${persistenceAnchor}. \`import_batches\` also carries \`clientPreviewSha256\`, \`verificationStartedAt\`, and \`verifiedAt\` so browser preprocessing remains advisory until independently verified`,
    );
  } else {
    plan +=
      "\n\n### Client preview verification persistence\n\n`import_batches` carries `clientPreviewSha256`, `verificationStartedAt`, and `verifiedAt` so browser preprocessing remains advisory until independently verified\n";
  }
}

let architecture = replaceVersion(
  "architecture.md",
  "| Version | 0.3.14 |",
  "| Version | 0.3.15 |",
);

const architectureBlock = `## Client preprocessing and authoritative verification

Workbook preprocessing is split across the trust boundary. The browser dynamically loads SheetJS only after file selection, parses \`Holiday_Master\`, applies the governed mapping and normalization rules, and renders a local preview before any upload. On confirmation it submits the untouched XLSX together with the preview JSON.

The request path stores the XLSX immutably and the JSON as provisional staging, records \`clientPreviewSha256\`, and returns \`UPLOADED\` without synchronously parsing the workbook. The worker claims the batch as \`VERIFYING\`, performs package and macro safety checks, reparses the stored XLSX independently with SheetJS, recomputes the same deterministic preview fingerprint, and fails closed on mismatch.

Only a matching server parse can transition the batch to \`VALIDATED\` or \`INVALID\`. Correction, warning acknowledgement, approval, and publication remain locked before that transition. Canonical publication additionally requires \`verifiedAt\` and remains downstream of maker-checker approval.`;

architecture = insertBeforeHeading(
  architecture,
  "## Runtime topology",
  architectureBlock,
);

let contract = replaceVersion(
  "docs/GOVERNED-IMPORT-CONTRACT.md",
  "| Version | 1.5-draft |",
  "| Version | 1.6-draft |",
);

const contractBlock = `## Client preprocessing and authoritative verification

- File selection does not upload immediately
- The browser dynamically loads SheetJS and parses \`Holiday_Master\` locally using the governed mapping and normalization rules
- The user sees normalized rows, canonical region resolution, dates, row status, warnings, and errors before submission
- Browser preprocessing is advisory and cannot authorize approval or publication
- On confirmation the browser submits the untouched XLSX plus the complete preview JSON
- The API stores raw XLSX evidence immutably, stores preview rows and issues as provisional staging, records \`clientPreviewSha256\`, and returns \`UPLOADED\` without synchronous workbook parsing
- \`UPLOADED\` and \`VERIFYING\` batches cannot be corrected, acknowledged, submitted for approval, approved, or published
- The worker claims pending batches as \`VERIFYING\`; stale verification claims are retryable
- The worker verifies ZIP integrity and rejects macro-enabled packages before parsing
- The worker independently reparses the stored XLSX with SheetJS and recomputes the deterministic preview fingerprint
- Fingerprint mismatch fails the batch closed as \`FAILED\`
- A matching server parse replaces provisional row and issue values with the authoritative result and transitions the batch to \`VALIDATED\` or \`INVALID\`
- Only server-verified staging participates in maker-checker approval and canonical publication`;

contract = insertBeforeHeading(
  contract,
  "## Maker-checker approval",
  contractBlock,
);

if (!contract.includes("- End-to-end worker verification smoke")) {
  const mountedLinePattern =
    /^- .*Mounted ATI One smoke verification.*$/m;

  if (mountedLinePattern.test(contract)) {
    contract = contract.replace(
      mountedLinePattern,
      (line) => `- End-to-end worker verification smoke\n${line}`,
    );
  } else {
    contract +=
      "\n\n## Remaining Phase 1 acceptance\n\n- End-to-end worker verification smoke\n- Mounted ATI One smoke verification and business-owner acceptance of the canonical publication result\n";
  }
}

console.log(
  "\nInstalling SheetJS first, then removing ExcelJS...",
);

run(npm, [
  "install",
  "--save",
  "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
]);
run(npm, ["rm", "exceljs"]);

console.log(
  "\nApplying browser preview + asynchronous authoritative verification...",
);

for (const [rel, content] of finalFiles) {
  write(rel, content);
}

for (const [rel, content64] of Object.entries(manifest.files)) {
  const target = path.join(root, rel);

  if (
    fs.existsSync(target) &&
    rel ===
      "prisma/migrations/20260816020000_add_import_preview_verification/migration.sql"
  ) {
    throw new Error(
      `${rel} unexpectedly exists. Refusing to overwrite migration history.`,
    );
  }

  write(rel, decode(content64));
}

write("plan.md", plan);
write("architecture.md", architecture);
write("docs/GOVERNED-IMPORT-CONTRACT.md", contract);

console.log("\nApplying verification migration and regenerating Prisma Client...");
run(npx, ["prisma", "migrate", "deploy"]);
run(npx, ["prisma", "generate"]);

console.log("\nRunning fast verification...");
run(npm, ["run", "verify:fast"]);

console.log("\n== SHEETJS CLIENT PREVIEW + WORKER VERIFICATION PASSED ==");
console.log("Canonical publication baseline -> preserved");
console.log("FE -> SheetJS parse + normalize + local preview before upload");
console.log("Submit -> untouched XLSX + confirmed preview JSON");
console.log("API -> immutable artifact + provisional staging, no sync XLSX parse");
console.log("Worker -> ZIP safety + independent SheetJS reparse + SHA-256 preview verification");
console.log("UPLOADED / VERIFYING -> correction + approval + publication locked");
console.log("VALIDATED / INVALID -> authoritative server result");
console.log("Publication -> additionally requires verifiedAt");
console.log("Docs -> plan 0.3.15 / architecture 0.3.15 / import contract 1.6-draft");
console.log("\nFor smoke, run in separate terminals:");
console.log("  npm run dev");
console.log("  npm run worker");
console.log("Then select XLSX -> local preview -> submit -> wait for worker result.");
console.log("Final full gate after smoke: npm run verify");

fs.rmSync(helperDir, { recursive: true, force: true });
