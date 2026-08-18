-- New governed imports are created explicitly as VALIDATED after authoritative server parsing.
-- Retain legacy enum values for historical compatibility, but remove the obsolete implicit state.
ALTER TABLE "import_batches"
ALTER COLUMN "status" DROP DEFAULT;
