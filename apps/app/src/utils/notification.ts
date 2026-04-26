import type { useI18n } from "vue-i18n";

/**
 * @zh 获取消息分类的本地化标签。
 * @en Get the localized label for a notification category.
 */
export const getCategoryLabel = (
  t: ReturnType<typeof useI18n>["t"],
  category: string,
): string => {
  const map: Record<string, string> = {
    SYSTEM: t("系统"),
    COMMENT_REPLY: t("评论"),
    TRANSLATION: t("翻译"),
    PROJECT: t("项目"),
    QA: t("质检"),
  };
  return map[category] ?? category;
};
