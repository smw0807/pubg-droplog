export interface MapMetadata {
  name: string
  englishName: string
  image: string | null
  detailImage?: string
}

const erangel: MapMetadata = {
  name: '에란겔',
  englishName: 'Erangel',
  image: '/maps/erangel.webp',
  detailImage: '/maps/erangel-high.webp',
}
const maps: Record<string, MapMetadata> = {
  Baltic_Main: erangel,
  Erangel_Main: erangel,
  Desert_Main: {
    name: '미라마',
    englishName: 'Miramar',
    image: '/maps/miramar.webp',
    detailImage: '/maps/miramar-high.webp',
  },
  Tiger_Main: {
    name: '태이고',
    englishName: 'Taego',
    image: '/maps/taego.webp',
    detailImage: '/maps/taego-high.webp',
  },
  Neon_Main: {
    name: '론도',
    englishName: 'Rondo',
    image: '/maps/rondo.webp',
    detailImage: '/maps/rondo-high.webp',
  },
  Savage_Main: {
    name: '사녹',
    englishName: 'Sanhok',
    image: '/maps/sanhok.webp',
    detailImage: '/maps/sanhok-high.webp',
  },
  DihorOtok_Main: {
    name: '비켄디',
    englishName: 'Vikendi',
    image: '/maps/vikendi.webp',
    detailImage: '/maps/vikendi-high.webp',
  },
  Summerland_Main: {
    name: '카라킨',
    englishName: 'Karakin',
    image: '/maps/karakin.webp',
    detailImage: '/maps/karakin-high.webp',
  },
  Kiki_Main: {
    name: '데스턴',
    englishName: 'Deston',
    image: '/maps/deston.webp',
    detailImage: '/maps/deston-high.webp',
  },
  Chimera_Main: {
    name: '파라모',
    englishName: 'Paramo',
    image: '/maps/paramo.webp',
    detailImage: '/maps/paramo-high.webp',
  },
  Heaven_Main: {
    name: '헤이븐',
    englishName: 'Haven',
    image: '/maps/haven.webp',
    detailImage: '/maps/haven-high.webp',
  },
}

export function getMapMetadata(rawName: string): MapMetadata {
  const map = Object.hasOwn(maps, rawName) ? maps[rawName] : undefined
  return map ?? { name: rawName, englishName: rawName, image: null }
}
