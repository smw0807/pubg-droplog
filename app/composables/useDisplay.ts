import { getMapMetadata } from '~/utils/maps'

export function useDisplay() {
  const number = (value: number | null | undefined): string =>
    value == null ? '—' : Math.round(value).toLocaleString('ko-KR')
  const date = (value: string): string =>
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value))
  const duration = (seconds: number | null): string =>
    seconds == null
      ? '—'
      : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  const queue = (value: string): string => (value === 'ranked' ? '랭크' : '일반')
  const team = (value: string): string => (value === 'duo' ? '듀오' : '스쿼드')
  const platform = (value: string): string => (value === 'kakao' ? 'Kakao' : 'Steam')
  const map = (value: string): string => getMapMetadata(value).name
  return { number, date, duration, queue, team, platform, map }
}
