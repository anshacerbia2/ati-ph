BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        "clientId",
        lower(split_part("email", '@', 1) || '@dummy.test') AS safe_email,
        count(*) AS duplicate_count
      FROM "routing"."contacts"
      GROUP BY
        "clientId",
        lower(split_part("email", '@', 1) || '@dummy.test')
      HAVING count(*) > 1
    ) AS conflicts
  ) THEN
    RAISE EXCEPTION
      'Cannot sanitize routing.contacts to @dummy.test because same-client local-part collisions exist';
  END IF;
END
$$;

UPDATE "routing"."contacts"
SET
  "email" = split_part("email", '@', 1) || '@dummy.test',
  "normalizedEmail" = lower(split_part("email", '@', 1) || '@dummy.test'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE lower(split_part("email", '@', 2)) <> 'dummy.test';

COMMIT;
