export function useDisplay() {
  const number = (value: number | null | undefined): string => value == null ? '—' : Math.round(value).toLocaleString('ko-KR')
  const date = (value: string): string => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
  const duration = (seconds: number | null): string => seconds == null ? '—' : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  const queue = (value: string): string => value === 'ranked' ? '랭크' : '일반'
  const team = (value: string): string => value === 'duo' ? '듀오' : '스쿼드'
  const platform = (value: string): string => value === 'kakao' ? 'Kakao' : 'Steam'
  const mapNames: Record<string, string> = { Baltic_Main: '에란겔', Erangel_Main: '에란겔', Desert_Main: '미라마', Savage_Main: '사녹', DihorOtok_Main: '비켄디', Summerland_Main: '카라킨', Tiger_Main: '태이고', Kiki_Main: '데스턴', Neon_Main: '론도', Chimera_Main: '파라모', Heaven_Main: '헤이븐' }
  const map = (value: string): string => mapNames[value] ?? value
  return { number, date, duration, queue, team, platform, map }
}
