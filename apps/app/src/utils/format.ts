/**
 * 格式化日期为本地字符串
 * @param date - 日期对象或 ISO 字符串
 * @returns 格式化的日期字符串 (YYYY-MM-DD HH:mm:ss)
 */
export function formatDate(date: Date | string | number): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return "—";
  }

  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 格式化日期为相对时间
 * @param date - 日期对象或 ISO 字符串
 * @returns 相对时间字符串（如：刚刚、5 分钟前、1 小时前等）
 */
export function formatRelativeTime(date: Date | string | number): string {
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
