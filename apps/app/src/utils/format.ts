const DEFAULT_DATE_LOCALE = "zh-CN";

type DateInput = Date | string | number;

const canonicalizeLocale = (locale: string): string => {
  try {
    return (
      Intl.getCanonicalLocales(locale.replaceAll("_", "-"))[0] ??
      DEFAULT_DATE_LOCALE
    );
  } catch {
    return DEFAULT_DATE_LOCALE;
  }
};

const formatUtc = (
  date: DateInput,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string => {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(canonicalizeLocale(locale), {
    ...options,
    timeZone: "UTC",
  }).format(d);
};

const formatUtcDateTime = (
  date: DateInput,
  locale: string,
  includeSeconds: boolean,
): string =>
  formatUtc(date, locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
    timeZoneName: "short",
  });

export const formatDate = (
  date: DateInput,
  locale = DEFAULT_DATE_LOCALE,
): string => formatUtcDateTime(date, locale, false);

export const formatTimestamp = (
  date: DateInput,
  locale = DEFAULT_DATE_LOCALE,
): string => formatUtcDateTime(date, locale, true);

export const formatCalendarDate = (
  date: DateInput,
  locale = DEFAULT_DATE_LOCALE,
): string => formatUtc(date, locale, { dateStyle: "short" });

export const formatTime = (
  date: DateInput,
  locale = DEFAULT_DATE_LOCALE,
): string => formatUtc(date, locale, { timeStyle: "medium" });

export const formatShortDateTime = (
  date: DateInput,
  locale = DEFAULT_DATE_LOCALE,
): string =>
  formatUtc(date, locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function formatRelativeTime(date: DateInput): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  if (isNaN(diff)) {
    return "—";
  }

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const months = Math.floor(days / 30);
  const years = Math.floor(months / 12);

  if (minutes < 1) {
    return "刚刚";
  } else if (minutes < 60) {
    return `${minutes}分钟前`;
  } else if (hours < 24) {
    return `${hours}小时前`;
  } else if (days < 30) {
    return `${days}天前`;
  } else if (months < 12) {
    return `${months}个月前`;
  } else {
    return `${years}年前`;
  }
}
