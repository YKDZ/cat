DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM pg_available_extensions
    WHERE name IN ('vector', 'pg_trgm', 'rum', 'zhparser')
  ) <> 4 THEN
    RAISE EXCEPTION 'required search extensions are not available';
  END IF;
END
$$;

SELECT 1;
