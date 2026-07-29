DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "MemoryItem"
    GROUP BY "memory_id", "translation_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add MemoryItem(memory_id, translation_id) uniqueness: duplicate rows exist. Resolve duplicates before retrying this migration.';
  END IF;
END $$;
