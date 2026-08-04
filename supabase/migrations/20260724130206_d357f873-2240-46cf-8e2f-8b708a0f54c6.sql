-- Historical compatibility marker.
--
-- This generated migration duplicated four tables that had already been
-- created by the immediately preceding, feature-specific migrations:
--
--   20260723190000_important_numbers.sql
--   20260723200000_checklists.sql
--   20260723210000_deposit_log.sql
--
-- Replaying the repository from an empty database therefore failed on the
-- first CREATE TABLE. The earlier migrations are the canonical definitions;
-- they include the richer checklist columns and the intended role policies.
-- Keep this timestamp in the history so applied ledgers remain stable, but do
-- not attempt to recreate the same objects a second time.

DO $$
BEGIN
  RAISE NOTICE 'Skipping superseded duplicate checklist/deposit/directory migration';
END;
$$;
