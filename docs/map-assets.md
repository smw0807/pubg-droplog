# 맵 이미지 출처

맵 이미지의 출처·변환 기록과 사건 지도 표시 범위를 정리한다. 로컬 파일과 표시 방식은 2026-10-10 저장소 기준이며, 외부 자료 확인 기록은 아래 도입 시점 기준이다.

## 원본과 로컬 파일

2026-10-05 [PUBG 공식 API 에셋 저장소](https://github.com/pubg/api-assets/tree/32b13b51128b8d8909ae5e77f3b833e01230b24d/Assets/Maps)의 지명이 포함된 `*_Main_High_Res.png`를 내려받았다. 10개 원본 모두 **8192×8192**이며, 확대용 이미지는 업스케일·자르기·회전 없이 WebP 품질 90으로 변환했다. 당시 추가한 사녹·비켄디·카라킨·데스턴·파라모·헤이븐은 같은 원본을 1024×1024, WebP 품질 85로 축소한 미리보기도 함께 생성했다.

| 맵     | 공식 원본 다운로드                                                                                                                                                    | 확대용 로컬 파일                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 에란겔 | [Erangel_Main_High_Res.png](https://media.githubusercontent.com/media/pubg/api-assets/32b13b51128b8d8909ae5e77f3b833e01230b24d/Assets/Maps/Erangel_Main_High_Res.png) | `public/maps/erangel-high.webp` |
| 미라마 | [Miramar_Main_High_Res.png](https://media.githubusercontent.com/media/pubg/api-assets/32b13b51128b8d8909ae5e77f3b833e01230b24d/Assets/Maps/Miramar_Main_High_Res.png) | `public/maps/miramar-high.webp` |
| 태이고 | [Taego_Main_High_Res.png](https://media.githubusercontent.com/media/pubg/api-assets/32b13b51128b8d8909ae5e77f3b833e01230b24d/Assets/Maps/Taego_Main_High_Res.png)     | `public/maps/taego-high.webp`   |
| 론도   | [Rondo_Main_High_Res.png](https://media.githubusercontent.com/media/pubg/api-assets/32b13b51128b8d8909ae5e77f3b833e01230b24d/Assets/Maps/Rondo_Main_High_Res.png)     | `public/maps/rondo-high.webp`   |
| 사녹   | [Sanhok_Main_High_Res.png](https://media.githubusercontent.com/media/pubg/api-assets/32b13b51128b8d8909ae5e77f3b833e01230b24d/Assets/Maps/Sanhok_Main_High_Res.png)   | `public/maps/sanhok-high.webp`  |
| 비켄디 | [Vikendi_Main_High_Res.png](https://media.githubusercontent.com/media/pubg/api-assets/32b13b51128b8d8909ae5e77f3b833e01230b24d/Assets/Maps/Vikendi_Main_High_Res.png) | `public/maps/vikendi-high.webp` |
| 카라킨 | [Karakin_Main_High_Res.png](https://media.githubusercontent.com/media/pubg/api-assets/32b13b51128b8d8909ae5e77f3b833e01230b24d/Assets/Maps/Karakin_Main_High_Res.png) | `public/maps/karakin-high.webp` |
| 데스턴 | [Deston_Main_High_Res.png](https://media.githubusercontent.com/media/pubg/api-assets/32b13b51128b8d8909ae5e77f3b833e01230b24d/Assets/Maps/Deston_Main_High_Res.png)   | `public/maps/deston-high.webp`  |
| 파라모 | [Paramo_Main_High_Res.png](https://media.githubusercontent.com/media/pubg/api-assets/32b13b51128b8d8909ae5e77f3b833e01230b24d/Assets/Maps/Paramo_Main_High_Res.png)   | `public/maps/paramo-high.webp`  |
| 헤이븐 | [Haven_Main_High_Res.png](https://media.githubusercontent.com/media/pubg/api-assets/32b13b51128b8d8909ae5e77f3b833e01230b24d/Assets/Maps/Haven_Main_High_Res.png)     | `public/maps/haven-high.webp`   |

출처 커밋: `32b13b51128b8d8909ae5e77f3b833e01230b24d`. Git LFS 원본이므로 `raw.githubusercontent.com`의 포인터 파일 대신 위 `media.githubusercontent.com` 주소를 사용한다. PNG 원본은 임시 작업 폴더에서 처리하며 저장소에는 변환한 WebP만 포함한다. 이용 조건은 원본 저장소에서 안내하는 [PUBG API Terms of Use](https://developer.pubg.com/tos)와 [Player-created Content](https://www.pubg.com/player-created-content/)를 따른다.

## 변환 재현

`cwebp` 1.5.0을 사용했다. 확대용 이미지는 각 맵에 같은 옵션을 적용한다.

```sh
curl -fL 'https://media.githubusercontent.com/media/pubg/api-assets/32b13b51128b8d8909ae5e77f3b833e01230b24d/Assets/Maps/Erangel_Main_High_Res.png' -o /tmp/Erangel_Main_High_Res.png
cwebp -q 90 -m 6 -mt /tmp/Erangel_Main_High_Res.png -o public/maps/erangel-high.webp
```

사녹·비켄디·카라킨·데스턴·파라모·헤이븐의 미리보기에는 아래 옵션을 적용했다. 해당 PNG를 먼저 내려받고, 예시의 맵 이름과 출력 파일명만 바꿔 재현한다. 에란겔·미라마·태이고·론도의 기존 미리보기는 아래 명령의 재생성 대상에 포함하지 않는다.

```sh
cwebp -resize 1024 1024 -q 85 -m 6 -mt /tmp/Sanhok_Main_High_Res.png -o public/maps/sanhok.webp
```

2026-10-05 다운로드한 PNG의 SHA-256을 해당 커밋의 공식 Git LFS 포인터와 대조했다. 아래 값은 PNG 원본의 해시이며, 저장소에 포함된 WebP 파일의 해시가 아니다.

| 원본    | SHA-256                                                            |
| ------- | ------------------------------------------------------------------ |
| Erangel | `5dc33eac3af60b375cb0e29b7648132dbaa164c75c0310368e8ae585bcbecc45` |
| Miramar | `7d8a9878b699c7eb51fecda2bc57b9e75e2120c3117b9c9e95b03dd8ab5a42a9` |
| Taego   | `cd6295ad924cff220bec5680a0f85f2e29483c0d9d1dd409c9f8f4d52d5308d2` |
| Rondo   | `d1a7c9fe2639bc3aeca2add03feddfd4bcd48fedf28f2ca3333ad2a4bad2712e` |
| Sanhok  | `fa28839b56a2180cae7d4339107dd11bafc6e22c9048f650263852a04cc8c2f0` |
| Vikendi | `fb8a4e7fe0daac84aabb54689cb2cf4cca284294ae357fe8dc384a0f0fd7167d` |
| Karakin | `e18b0d4b0d5102038c52ffb7ac9a67e38314bb10edbf30f23ad55799a376dad9` |
| Deston  | `e6d91373539137377580e3d7f6b8d4db834f54c5b27863fcf985c2b0bcf3993a` |
| Paramo  | `a177fa69daec0be022d77698948f421b7fd063fee27fa9d63cb3342b2cb933fd` |
| Haven   | `66a0449dc66d08cede53ad91f86e81b66d9ef4ea21fe020e5f5e579b530cc906` |

## 표시 방식과 범위

- 이미지 경로는 [maps.ts](../app/utils/maps.ts), 좌표 범위는 [map-coordinates.ts](../shared/utils/map-coordinates.ts), 확대·이미지 전환은 [EventMap.vue](../app/components/EventMap.vue)에서 관리한다.
- 경기 목록·리포트 헤더는 에란겔·미라마·태이고의 819×819, 론도의 900×900 이미지와 나머지 6개 맵의 1024×1024 미리보기를 사용한다. [홈 갤러리](../app/components/BattlegroundGallery.vue)에는 에란겔·미라마·론도·태이고를 표시한다.
- 사건 지도는 처음에는 미리보기를 표시하며, 첫 확대 시 해당 맵의 고해상도 이미지 한 장만 요청한다. 디코딩이 끝난 후 전환하고, 실패하면 미리보기를 유지한다. 같은 맵에서 보기만 초기화하면 이미 불러온 고해상도를 계속 사용하며, 맵을 바꾸면 미리보기부터 다시 시작한다.
- 전체 정사각 프레임을 유지하며 이미지가 있는 10개 맵 모두 유효한 좌표의 사건 핀을 표시한다. 좌표가 없거나 범위를 벗어나면 핀을 만들지 않는다. 알 수 없는 맵의 이미지·좌표 폴백도 유지한다.
- 확대 상한은 32배다. 원본 해상도가 8192px이므로 큰 화면·높은 기기 픽셀 비율에서는 확대 시 원본 픽셀 한계가 남는다. 더 깊은 확대와 메모리 절감이 필요하면 원본을 타일로 나누는 방식을 검토한다.
- 공식 저장소의 해당 커밋 이미지이며, 이후 게임 패치에 포함된 지형 변화까지 반영했다는 의미는 아니다. 이미지 프레임과 브라우저 확인 결과는 [검증 기록](validation.md)에 남긴다.

### 론도 좌표 범위의 채택 근거

론도(`Neon_Main`)도 다른 8km 맵과 같은 `0–816,000cm` 범위로 투영한다. 도입 당시 [공식 소개의 8×8 크기](https://pubg.com/en/game-info/maps/rondo), [레벨 파일에서 추출한 1.02km 격자 8×8개](https://pubg.gs/maps/rondo/tables/), [공식 문서 저장소의 범위 추가 제안](https://github.com/pubg/api-documentation-content/issues/133)을 근거로 채택했다. 2026-10-05 확인 기록에서는 공식 API 좌표 문서에 론도가 누락되어 있었고 해당 제안은 미해결 상태였다. 이 기록은 외부 문서·이슈의 현재 상태를 보증하지 않는다.
