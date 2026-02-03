/**
 * Format a number as KRW with comma separators.
 * e.g., 9900 -> "9,900원"
 */
export function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/**
 * Format a number with comma separators.
 * e.g., 1200 -> "1,200"
 */
export function formatNumber(num: number): string {
  return num.toLocaleString("ko-KR");
}

/**
 * Format a date string to KST display.
 * e.g., "2025-01-15T10:30:00Z" -> "2025.01.15 19:30"
 */
export function formatDateKST(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(/\. /g, ".").replace(/\.$/, "");
}

/**
 * Format a relative time string in Korean.
 * e.g., "방금 전", "5분 전", "3시간 전", "2일 전"
 */
export function formatRelativeTimeKo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffSeconds = Math.floor((now - date) / 1000);

  if (diffSeconds < 60) return "방금 전";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}일 전`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}개월 전`;
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears}년 전`;
}
