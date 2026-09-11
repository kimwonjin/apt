export function formatPrice(value: number | null | undefined): string {
  if (!value) return '0원';
  return `${value.toLocaleString('ko-KR')}원`;
}

export function formatDday(deadline: string): string {
  const diffMs = new Date(deadline).getTime() - Date.now();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return '마감';
  if (days === 0) return 'D-day';
  return `D-${days}`;
}

/** 주어진 날짜가 속한 주의 월요일 00:00을 반환(정산 주 단위 묶기용). */
export function weekStart(iso: string): Date {
  const d = new Date(iso);
  const day = d.getDay(); // 0=일 .. 6=토
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
  return monday;
}

/** "9/1 ~ 9/7" 형태의 주간 라벨. */
export function weekLabel(monday: Date): string {
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(monday)} ~ ${fmt(sunday)}`;
}

export function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}
