export interface MapMetadata {
  name: string
  englishName: string
  image: string | null
}

const erangel: MapMetadata = { name: '에란겔', englishName: 'Erangel', image: '/maps/erangel.webp' }
const maps: Record<string, MapMetadata> = {
  Baltic_Main: erangel,
  Erangel_Main: erangel,
  Desert_Main: { name: '미라마', englishName: 'Miramar', image: '/maps/miramar.webp' },
  Tiger_Main: { name: '태이고', englishName: 'Taego', image: '/maps/taego.webp' },
  Neon_Main: { name: '론도', englishName: 'Rondo', image: '/maps/rondo.webp' },
  Savage_Main: { name: '사녹', englishName: 'Sanhok', image: null },
  DihorOtok_Main: { name: '비켄디', englishName: 'Vikendi', image: null },
  Summerland_Main: { name: '카라킨', englishName: 'Karakin', image: null },
  Kiki_Main: { name: '데스턴', englishName: 'Deston', image: null },
  Chimera_Main: { name: '파라모', englishName: 'Paramo', image: null },
  Heaven_Main: { name: '헤이븐', englishName: 'Haven', image: null },
}

export function getMapMetadata(rawName: string): MapMetadata {
  const map = Object.hasOwn(maps, rawName) ? maps[rawName] : undefined
  return map ?? { name: rawName, englishName: rawName, image: null }
}
