-- Migration 6: Make legacy `name` columns nullable
-- The initial schema created `name VARCHAR(255) NOT NULL` on parents and children.
-- Migration 5 added first_name/last_name but never dropped or nullified the old `name` column.
-- All application code now uses first_name/last_name, so `name` must be nullable to prevent
-- "null value in column name violates not-null constraint" errors on insert.

DO $$
BEGIN
  -- Parents: make name nullable if it exists and is NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parents'
      AND column_name = 'name'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.parents ALTER COLUMN name DROP NOT NULL;
  END IF;

  -- Children: make name nullable if it exists and is NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'children'
      AND column_name = 'name'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.children ALTER COLUMN name DROP NOT NULL;
  END IF;
END $$;
