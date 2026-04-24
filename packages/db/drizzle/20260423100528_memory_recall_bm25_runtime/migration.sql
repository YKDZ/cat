CREATE EXTENSION IF NOT EXISTS rum;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS zhparser;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_ts_config WHERE cfgname = 'cat_zh_hans'
  ) THEN
    CREATE TEXT SEARCH CONFIGURATION cat_zh_hans (PARSER = zhparser);
    ALTER TEXT SEARCH CONFIGURATION cat_zh_hans
      ADD MAPPING FOR n, v, a, i, e, l WITH simple;
  END IF;
END
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vectorized_string_value_en_bm25_rum"
  ON "VectorizedString"
  USING rum (to_tsvector('english', "value") rum_tsvector_ops)
  WHERE "language_id" = 'en';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vectorized_string_value_zh_hans_bm25_rum"
  ON "VectorizedString"
  USING rum (to_tsvector('cat_zh_hans', "value") rum_tsvector_ops)
  WHERE "language_id" = 'zh-Hans';
