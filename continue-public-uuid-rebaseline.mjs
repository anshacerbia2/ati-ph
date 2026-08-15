import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const migrationName = "20260815210000_initial_foundation";

function run(command, args = [], options = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  return execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
}

function runWithInput(command, args, input) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  return execFileSync(command, args, {
    cwd: root,
    input,
    stdio: ["pipe", "inherit", "inherit"],
    shell: process.platform === "win32",
  });
}

function capture(command, args = []) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

function readDatabaseUrl() {
  const envPath = path.join(root, ".env");
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((value) => value.startsWith("DATABASE_URL="));

  if (!line) {
    throw new Error("DATABASE_URL not found in .env.");
  }

  return line
    .slice("DATABASE_URL=".length)
    .trim()
    .replace(/^["']|["']$/g, "");
}

const parsed = new URL(readDatabaseUrl());
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
  throw new Error(
    `Refusing destructive reset against non-local DB host: ${parsed.hostname}`,
  );
}

const migrationDir = path.join(
  root,
  "prisma",
  "migrations",
  migrationName,
);
if (!fs.existsSync(path.join(migrationDir, "migration.sql"))) {
  throw new Error(
    `Expected generated baseline migration ${migrationName}/migration.sql was not found.`,
  );
}

const dirs = fs
  .readdirSync(path.join(root, "prisma", "migrations"), {
    withFileTypes: true,
  })
  .filter((entry) => entry.isDirectory());

if (dirs.length !== 1 || dirs[0].name !== migrationName) {
  throw new Error(
    `Expected exactly one migration directory (${migrationName}); found ${dirs
      .map((entry) => entry.name)
      .join(", ")}`,
  );
}

console.log(`Local DB safety gate passed: ${parsed.hostname}`);
console.log(`Migration gate passed: exactly one baseline (${migrationName})`);

const cleanupSql = `
DROP SCHEMA IF EXISTS "artifact" CASCADE;
DROP SCHEMA IF EXISTS "audit" CASCADE;
DROP SCHEMA IF EXISTS "authorization" CASCADE;
DROP SCHEMA IF EXISTS "execution" CASCADE;
DROP SCHEMA IF EXISTS "holiday" CASCADE;
DROP SCHEMA IF EXISTS "identity" CASCADE;
DROP SCHEMA IF EXISTS "ingestion" CASCADE;
DROP SCHEMA IF EXISTS "public" CASCADE;
CREATE SCHEMA "public";
`;

runWithInput(
  "npx",
  [
    "prisma",
    "db",
    "execute",
    "--stdin",
    "--schema",
    "prisma/schema.prisma",
  ],
  cleanupSql,
);

run("npx", ["prisma", "migrate", "deploy"]);
run("npm", ["run", "db:seed"]);

const drift = capture("npx", [
  "prisma",
  "migrate",
  "diff",
  "--from-schema-datasource",
  "prisma/schema.prisma",
  "--to-schema-datamodel",
  "prisma/schema.prisma",
  "--script",
]);

console.log("\n> prisma migrate diff (database -> datamodel)");
console.log(drift.trim());

if (!drift.includes("This is an empty migration")) {
  throw new Error("Schema drift detected after baseline deployment.");
}

run("npx", ["prisma", "migrate", "status"]);
run("npm", ["run", "typecheck"]);
run("npm", ["test"]);
run("npm", ["run", "lint"]);
run("git", ["diff", "--check"]);

console.log("\n== PUBLIC + UUID REBASELINE CONTINUATION PASSED ==");
console.log("Database reset completed");
console.log("Single baseline migration deployed");
console.log("Schema drift: empty");
console.log("All quality gates passed");
