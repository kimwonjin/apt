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
