CREATE TABLE "TranslatableElementComment" (
	"id" serial PRIMARY KEY NOT NULL,
	"translatable_element_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"parent_comment_id" integer,
	"root_comment_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "TranslatableElementComment" ADD CONSTRAINT "TranslatableElementComment_translatable_element_id_TranslatableElement_id_fk" FOREIGN KEY ("translatable_element_id") REFERENCES "public"."TranslatableElement"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableElementComment" ADD CONSTRAINT "TranslatableElementComment_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableElementComment" ADD CONSTRAINT "TranslatableElementComment_parent_comment_id_TranslatableElementComment_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."TranslatableElementComment"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableElementComment" ADD CONSTRAINT "TranslatableElementComment_root_comment_id_TranslatableElementComment_id_fk" FOREIGN KEY ("root_comment_id") REFERENCES "public"."TranslatableElementComment"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "TranslatableElementComment_translatable_element_id_index" ON "TranslatableElementComment" USING btree ("translatable_element_id");--> statement-breakpoint
CREATE INDEX "TranslatableElementComment_user_id_index" ON "TranslatableElementComment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "TranslatableElementComment_parent_comment_id_index" ON "TranslatableElementComment" USING btree ("parent_comment_id");--> statement-breakpoint
CREATE INDEX "TranslatableElementComment_root_comment_id_index" ON "TranslatableElementComment" USING btree ("root_comment_id");

-- 1) BEFORE INSERT OR UPDATE 函数：维护 root_comment_id 与 updated_at
CREATE OR REPLACE FUNCTION public.fn_translatable_comment_before()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  p_root integer;
  p_user integer;
BEGIN
  -- 如果有 parent
  IF NEW.parent_comment_id IS NOT NULL THEN
    -- 取父评论的 root（若父的 root_comment_id 为 NULL，则以父 id 作为 root）
    SELECT COALESCE(parent.root_comment_id, parent.id)
      INTO p_root
    FROM "TranslatableElementComment" parent
    WHERE parent.id = NEW.parent_comment_id;

    IF p_root IS NULL THEN
      -- 父记录不存在或未能查询到，退回使用 parent_comment_id 作为 root（至少有个值）
      p_root := NEW.parent_comment_id;
    END IF;

    NEW.root_comment_id := p_root;

  ELSE
    -- parent 为 NULL，设 root 为自身 id（若 NEW.id 在 BEFORE 阶段可用）
    -- 若 NEW.id 为 NULL（极少数情形），AFTER INSERT 的触发器会补上
    IF NEW.id IS NOT NULL THEN
      NEW.root_comment_id := NEW.id;
    END IF;
  END IF;

  -- 始终更新时间戳
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;


-- 2) CREATE TRIGGER BEFORE
DROP TRIGGER IF EXISTS trg_translatable_comment_before ON "TranslatableElementComment";
CREATE TRIGGER trg_translatable_comment_before
  BEFORE INSERT OR UPDATE ON "TranslatableElementComment"
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_translatable_comment_before();


-- 3) AFTER INSERT 函数：保底把 root_comment_id 设为自身 id（当 BEFORE 无法设置时）
CREATE OR REPLACE FUNCTION public.fn_translatable_comment_after()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- 仅在 parent_comment_id IS NULL 且 root_comment_id IS NULL 时把 root 设为自身 id
  IF NEW.parent_comment_id IS NULL AND (NEW.root_comment_id IS NULL) THEN
    UPDATE "TranslatableElementComment"
    SET root_comment_id = NEW.id
    WHERE id = NEW.id;
  END IF;

  RETURN NULL; -- AFTER ROW 触发器可以 return NULL
END;
$$;

-- 4) CREATE TRIGGER AFTER
DROP TRIGGER IF EXISTS trg_translatable_comment_after ON "TranslatableElementComment";
CREATE TRIGGER trg_translatable_comment_after
  AFTER INSERT ON "TranslatableElementComment"
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_translatable_comment_after();
