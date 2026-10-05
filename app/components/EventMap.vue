<script setup lang="ts">
import type { EventRole, ReportEvent } from '~~/shared/types'
import { getMapExtent, projectMapLocation } from '~~/shared/utils/map-coordinates'
import { getMapMetadata } from '~/utils/maps'

const props = defineProps<{ events: ReportEvent[]; mapName: string; selectedEventId: string | null; total: number; loading?: boolean }>()
const emit = defineEmits<{ select: [id: string]; showTimeline: [id: string] }>()
const display = useDisplay()
const viewport = ref<HTMLElement>()
const maxScale = 16
const scale = ref(1)
const pan = reactive({ x: 0, y: 0 })
const dragging = ref(false)
const pinPage = ref(0)
const listPage = ref(0)
const listOpen = ref(false)
const activeGroupId = ref<string | null>(null)
const maxGroups = 100
const listPageSize = 6
const map = computed(() => getMapMetadata(props.mapName))
const supported = computed(() => getMapExtent(props.mapName) !== null && map.value.image !== null)
const names: Record<ReportEvent['kind'], string> = { knock: '기절', revive: '소생', kill: '처치와 사망', damage: '피해' }
const icons: Record<ReportEvent['kind'], string> = { knock: 'i-lucide-circle-arrow-down', revive: 'i-lucide-heart-pulse', kill: 'i-lucide-crosshair', damage: 'i-lucide-zap' }
interface MapEvent { event: ReportEvent; x: number; y: number }
interface MarkerGroup { id: string; x: number; y: number; first: MapEvent; events: MapEvent[] }
const located = computed<MapEvent[]>(() => supported.value ? props.events.flatMap(event => {
  const point = projectMapLocation(props.mapName, event.target?.location)
  return point ? [{ event, ...point }] : []
}) : [])
const groups = computed<MarkerGroup[]>(() => {
  const collected = new Map<string, MarkerGroup>()
  for (const point of located.value) {
    const id = `${Math.round(point.x / 1.5)}:${Math.round(point.y / 1.5)}`
    const group = collected.get(id)
    if (group) group.events.push(point)
    else collected.set(id, { id, x: point.x, y: point.y, first: point, events: [point] })
  }
  return [...collected.values()]
})
const pageCount = computed(() => Math.max(1, Math.ceil(groups.value.length / maxGroups)))
const visibleGroups = computed(() => groups.value.slice(pinPage.value * maxGroups, (pinPage.value + 1) * maxGroups))
const selected = computed(() => props.events.find(event => event.id === props.selectedEventId) ?? null)
const selectedTarget = computed(() => supported.value ? projectMapLocation(props.mapName, selected.value?.target?.location) : null)
const selectedActor = computed(() => supported.value ? projectMapLocation(props.mapName, selected.value?.actor?.location) : null)
const activeGroup = computed(() => visibleGroups.value.find(group => group.id === activeGroupId.value))
const listEvents = computed(() => (activeGroup.value ? activeGroup.value.events : visibleGroups.value.flatMap(group => group.events)).map(point => point.event))
const listPageCount = computed(() => Math.max(1, Math.ceil(listEvents.value.length / listPageSize)))
const visibleListEvents = computed(() => listEvents.value.slice(listPage.value * listPageSize, (listPage.value + 1) * listPageSize))
const sceneStyle = computed(() => ({ transform: `translate(${pan.x}%, ${pan.y}%) scale(${scale.value})` }))
const selectedRoles = computed(() => selected.value ? [
  { label: selected.value.kind === 'kill' ? '킬 획득자' : selected.value.kind === 'revive' ? '소생한 사람' : '행위자', role: selected.value.actor },
  { label: selected.value.kind === 'revive' ? '소생 대상' : '대상', role: selected.value.target },
  ...(selected.value.kind === 'kill' ? [{ label: '기절 유발자', role: selected.value.knockMaker }, { label: '마무리 공격자', role: selected.value.finisher }] : []),
] : [])
const teamLegend = computed(() => {
  const members = new Map<number, string>()
  for (const event of props.events) {
    for (const role of [event.actor, event.target, event.knockMaker, event.finisher, ...event.assists]) {
      if (role?.memberNo) members.set(role.memberNo, role.name)
    }
  }
  return [...members.entries()].sort(([a], [b]) => a - b).map(([number, name]) => ({ number, name }))
})
const timeLabel = (event: ReportEvent) => event.elapsedMs === null ? `${display.date(event.occurredAt)} KST` : display.duration(event.elapsedMs / 1000)
const roleName = (role: EventRole | null | undefined) => role ? `${role.memberNo ? `${role.memberNo} · ` : ''}${role.name}` : '확인 불가'
const eventLabel = (event: ReportEvent) => `${timeLabel(event)} · ${names[event.kind]} · ${roleName(event.target)}`
const memberStyle = (event: ReportEvent) => ({ '--pin-member': event.target?.memberNo ? `var(--member-${event.target.memberNo})` : event.actor?.memberNo ? `var(--member-${event.actor.memberNo})` : 'var(--map-text)' })
const pointStyle = (point: { x: number; y: number }) => ({ left: `${point.x}%`, top: `${point.y}%` })
const isSelectedGroup = (group: MarkerGroup) => group.events.some(point => point.event.id === props.selectedEventId)
const locationLabel = (role: EventRole | null | undefined) => !role?.location ? '위치 기록 없음' : !supported.value ? '지도 좌표 기준 확인 중' : projectMapLocation(props.mapName, role.location) ? '위치 기록 있음' : '지도 범위를 벗어난 위치'

let drag: { pointerId: number; x: number; y: number; panX: number; panY: number; size: number } | undefined
function clampPan() {
  const limit = (scale.value - 1) * 50
  pan.x = Math.min(limit, Math.max(-limit, pan.x))
  pan.y = Math.min(limit, Math.max(-limit, pan.y))
}
function zoom(step: number) { scale.value = Math.min(maxScale, Math.max(1, Math.round((scale.value + step) * 2) / 2)); clampPan() }
function wheelZoom(event: WheelEvent) {
  // Keep browser zoom shortcuts and horizontal scrolling available.
  if (event.ctrlKey || event.metaKey || !Number.isFinite(event.deltaY) || event.deltaY === 0) return
  const bounds = viewport.value?.getBoundingClientRect()
  if (!bounds?.width || !bounds.height) return
  event.preventDefault()
  if (dragging.value) return
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1
  const delta = Math.min(100, Math.max(-100, event.deltaY * unit))
  const nextScale = Math.min(maxScale, Math.max(1, scale.value * Math.exp(-delta * 0.002)))
  const ratio = nextScale / scale.value
  const anchorX = (event.clientX - bounds.left) / bounds.width * 100 - 50
  const anchorY = (event.clientY - bounds.top) / bounds.height * 100 - 50
  // Preserve the image coordinate under the cursor while changing scale.
  pan.x = anchorX - (anchorX - pan.x) * ratio
  pan.y = anchorY - (anchorY - pan.y) * ratio
  scale.value = nextScale
  clampPan()
}
function resetView() { scale.value = 1; pan.x = 0; pan.y = 0 }
function startDrag(event: PointerEvent) {
  if (event.button !== 0 || scale.value === 1 || (event.target instanceof Element && event.target.closest('button'))) return
  const size = viewport.value?.getBoundingClientRect().width
  if (!size) return
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, size }
  viewport.value?.setPointerCapture(event.pointerId)
  dragging.value = true
  event.preventDefault()
}
function moveDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return
  pan.x = drag.panX + (event.clientX - drag.x) / drag.size * 100
  pan.y = drag.panY + (event.clientY - drag.y) / drag.size * 100
  clampPan()
}
function stopDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return
  if (viewport.value?.hasPointerCapture(event.pointerId)) viewport.value.releasePointerCapture(event.pointerId)
  drag = undefined
  dragging.value = false
}
function keyPan(event: KeyboardEvent) {
  if (event.target !== event.currentTarget) return
  const directions: Record<string, [number, number]> = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, 8], ArrowDown: [0, -8] }
  if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(0.5); return }
  if (event.key === '-') { event.preventDefault(); zoom(-0.5); return }
  if (event.key === 'Home') { event.preventDefault(); resetView(); return }
  const direction = directions[event.key]
  if (!direction || scale.value === 1) return
  event.preventDefault()
  pan.x += direction[0]
  pan.y += direction[1]
  clampPan()
}
function chooseGroup(group: MarkerGroup) {
  const first = group.events[0]
  if (!first) return
  activeGroupId.value = group.id
  listPage.value = 0
  listOpen.value = group.events.length > 1
  emit('select', first.event.id)
}
function changePinPage(step: number) { pinPage.value = Math.min(pageCount.value - 1, Math.max(0, pinPage.value + step)); activeGroupId.value = null; listPage.value = 0 }
function showAllEvents() { activeGroupId.value = null; listPage.value = 0; listOpen.value = true }
function listToggle(event: Event) { if (event.target instanceof HTMLDetailsElement) listOpen.value = event.target.open }
function revealSelected() {
  const point = selectedTarget.value
  if (!point) return
  const width = viewport.value?.getBoundingClientRect().width ?? 320
  const margin = Math.min(12, 24 / width * 100)
  const screenX = 50 + (point.x - 50) * scale.value + pan.x
  const screenY = 50 + (point.y - 50) * scale.value + pan.y
  if (screenX < margin) pan.x += margin - screenX
  else if (screenX > 100 - margin) pan.x -= screenX - (100 - margin)
  if (screenY < margin) pan.y += margin - screenY
  else if (screenY > 100 - margin) pan.y -= screenY - (100 - margin)
  clampPan()
}
defineExpose({ revealSelected })
watch(() => props.selectedEventId, async id => {
  const index = groups.value.findIndex(group => group.events.some(point => point.event.id === id))
  const group = groups.value[index]
  if (group) {
    pinPage.value = Math.floor(index / maxGroups)
    activeGroupId.value = group.id
    listPage.value = Math.floor(group.events.findIndex(point => point.event.id === id) / listPageSize)
  } else { activeGroupId.value = null; listPage.value = 0 }
  await nextTick()
  revealSelected()
})
watch(groups, () => {
  pinPage.value = Math.min(pinPage.value, pageCount.value - 1)
  listPage.value = Math.min(listPage.value, listPageCount.value - 1)
})
watch(() => props.mapName, () => { resetView(); pinPage.value = 0; listPage.value = 0; activeGroupId.value = null })
</script>

<template>
  <section class="event-map surface overflow-hidden" data-testid="event-map" aria-label="사건 위치 지도">
    <div class="p-4 sm:p-5">
      <div class="flex flex-wrap items-center justify-between gap-3"><div><p class="eyebrow text-primary">EVENT POSITIONS</p><h3 class="mt-1 font-semibold">{{ map.name }} · 사건 지도</h3></div><UBadge color="neutral" variant="outline">대상 위치 기준</UBadge></div>
      <p class="mt-3 text-xs leading-6 text-muted" aria-live="polite">{{ loading ? '사건을 불러오는 중 · ' : '' }}현재 {{ events.length }}/{{ total }}개 조회 · 지도에 표시할 대상 좌표 {{ located.length }}개</p>
    </div>
    <div v-if="map.image" ref="viewport" class="map-viewport" :class="{ 'map-viewport--zoomed': scale > 1, 'map-viewport--dragging': dragging }" tabindex="0" role="region" aria-label="경기 이벤트 지도" aria-describedby="event-map-instructions" data-testid="map-viewport" :data-scale="scale" :data-pan-x="pan.x" :data-pan-y="pan.y" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="stopDrag" @pointercancel="stopDrag" @lostpointercapture="stopDrag" @keydown="keyPan" @wheel="wheelZoom">
      <div class="map-scene" :style="sceneStyle">
        <img :src="map.image" :alt="`${map.name} 전체 지도`" class="map-image" width="900" height="900" draggable="false" data-testid="event-map-image">
        <button v-for="group in visibleGroups" :key="group.id" type="button" class="event-marker" :class="{ 'event-marker--selected': isSelectedGroup(group) }" :style="{ ...pointStyle(group), ...memberStyle(group.first.event), '--marker-scale': 1 / scale }" :aria-label="`${eventLabel(group.first.event)}${group.events.length > 1 ? ` 외 ${group.events.length - 1}개, 겹친 사건 목록 열기` : ', 사건 선택'}`" :aria-pressed="isSelectedGroup(group)" :data-event-id="group.first.event.id" data-testid="event-marker" @click.stop="chooseGroup(group)">
          <span class="event-marker__body"><UIcon :name="icons[group.first.event.kind]" class="size-4" /><span v-if="group.events.length > 1" class="event-marker__count">{{ group.events.length }}</span><span v-else-if="group.first.event.target?.memberNo" class="event-marker__member">{{ group.first.event.target.memberNo }}</span></span>
        </button>
        <div v-if="selectedActor" class="selected-location selected-location--actor" :style="{ ...pointStyle(selectedActor), '--marker-scale': 1 / scale }" data-testid="selected-actor-marker"><span>{{ selected?.kind === 'kill' ? '킬 획득자' : selected?.kind === 'revive' ? '소생한 사람' : '행위자' }}</span></div>
        <div v-if="selectedTarget" class="selected-location selected-location--target" :style="{ ...pointStyle(selectedTarget), '--marker-scale': 1 / scale }" data-testid="selected-target-marker"><span>대상</span></div>
      </div>
      <span class="map-scale" aria-hidden="true">{{ scale.toFixed(1) }}×</span>
    </div>
    <div v-else class="map-unavailable"><UIcon name="i-lucide-map" class="size-10" /><p>{{ map.name }} 지도 이미지를 제공하지 않아요.</p></div>
    <div class="space-y-4 p-4 sm:p-5">
      <div v-if="map.image" class="flex flex-wrap items-center justify-between gap-2"><div class="flex items-center gap-2"><UButton color="neutral" variant="outline" icon="i-lucide-minus" aria-label="지도 축소" class="map-control" :disabled="scale === 1" @click="zoom(-0.5)" /><span class="min-w-10 text-center text-xs tabular-nums" aria-live="polite">{{ scale.toFixed(1) }}×</span><UButton color="neutral" variant="outline" icon="i-lucide-plus" aria-label="지도 확대" class="map-control" :disabled="scale === maxScale" @click="zoom(0.5)" /></div><UButton color="neutral" variant="ghost" icon="i-lucide-scan" aria-label="지도 초기화" class="map-control" @click="resetView">초기화</UButton></div>
      <p id="event-map-instructions" class="text-xs leading-6 text-muted">지도 위에서 마우스 휠로 커서 위치를 확대·축소할 수 있어요. 확대 후 드래그하거나 지도에 초점을 두고 방향키로 이동하세요. + / −로 확대·축소, Home으로 초기화할 수 있어요. 핀은 피해자·소생 대상의 사건 당시 위치입니다.</p>
      <UAlert v-if="!supported" color="neutral" variant="soft" title="이 맵은 사건 좌표를 표시할 수 없어요" :description="map.image ? '지도 이미지는 제공하지만 좌표 기준은 아직 확인 중이에요. 모든 기록은 타임라인에서 계속 확인할 수 있어요.' : '지도 이미지와 좌표 범위가 확인된 맵만 표시합니다. 모든 기록은 타임라인에서 계속 확인할 수 있어요.'" data-testid="map-unsupported" />
      <UAlert v-else-if="events.length && !located.length" color="neutral" variant="soft" title="표시할 대상 좌표가 없어요" description="이 사건들의 대상 위치가 제공되지 않았거나 유효한 지도 범위가 아닙니다. 행위자 위치로 대신 표시하지 않아요." data-testid="map-no-locations" />
      <p v-else-if="supported && events.length > located.length" class="text-xs leading-6 text-muted">대상 좌표를 표시할 수 없는 {{ events.length - located.length }}개 사건은 타임라인에 남아 있어요.</p>
      <div class="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted" aria-label="지도 이벤트 범례"><span v-for="(name, kind) in names" :key="kind" class="inline-flex items-center gap-1.5"><UIcon :name="icons[kind]" class="size-4" />{{ name }}</span></div>
      <div v-if="teamLegend.length" class="flex flex-wrap gap-3 text-xs" aria-label="조회된 사건의 팀원 범례"><span v-for="member in teamLegend" :key="member.number" class="inline-flex min-w-0 items-center gap-2"><span class="member-mark" :class="`member-${member.number}`">{{ member.number }}</span><span class="wrap-name">{{ member.name }}</span></span></div>
      <div v-if="located.length" class="text-xs leading-6 text-muted">팀원 번호와 색상을 함께 표시합니다. 숫자가 붙은 겹친 핀은 여러 사건을 묶은 것이며, 정확한 좌표는 선택한 사건의 대상 표시로 확인하세요.</div>
      <div v-if="pageCount > 1" class="flex flex-wrap items-center justify-between gap-2"><UButton color="neutral" variant="outline" :disabled="pinPage === 0" class="map-control" @click="changePinPage(-1)">이전 지도 사건</UButton><span class="text-xs text-muted">{{ pinPage + 1 }}/{{ pageCount }} · 최대 {{ maxGroups }}개 핀</span><UButton color="neutral" variant="outline" :disabled="pinPage >= pageCount - 1" class="map-control" @click="changePinPage(1)">다음 지도 사건</UButton></div>
      <details v-if="located.length" :open="listOpen" class="map-event-list" @toggle="listToggle">
        <summary class="map-list-summary">지도 사건 목록 · {{ listEvents.length }}개 <span class="text-xs font-normal text-muted">겹친 핀은 목록에서 선택하세요</span></summary>
        <div class="space-y-2 pt-3"><UButton v-if="activeGroup" color="neutral" variant="link" class="map-control" @click="showAllEvents">현재 지도 전체 사건 보기</UButton><button v-for="event in visibleListEvents" :key="event.id" type="button" class="map-event-option" :class="{ 'map-event-option--selected': event.id === selectedEventId }" :aria-pressed="event.id === selectedEventId" :data-event-id="event.id" data-testid="map-event-option" @click="emit('select', event.id)"><UIcon :name="icons[event.kind]" class="size-4 shrink-0" /><span class="wrap-name">{{ eventLabel(event) }}</span></button><div v-if="listPageCount > 1" class="flex items-center justify-between gap-2 pt-2"><UButton color="neutral" variant="ghost" class="map-control" :disabled="listPage === 0" @click="listPage--">이전 목록</UButton><span class="text-xs text-muted">{{ listPage + 1 }}/{{ listPageCount }}</span><UButton color="neutral" variant="ghost" class="map-control" :disabled="listPage >= listPageCount - 1" @click="listPage++">다음 목록</UButton></div></div>
      </details>
      <div v-if="selected" class="map-selection" data-testid="map-selection"><p class="text-xs font-semibold text-primary">선택한 사건 · {{ timeLabel(selected) }}</p><h4 class="mt-2 font-semibold">{{ names[selected.kind] }}</h4><p v-if="!selectedTarget" class="mt-2 text-xs leading-6 text-muted">대상 위치를 지도에 표시할 수 없어요. 행위자 위치가 있더라도 사건 위치로 대체하지 않습니다.</p><dl class="mt-3 space-y-3"><div v-for="entry in selectedRoles" :key="entry.label"><dt class="text-xs text-muted">{{ entry.label }}</dt><dd class="mt-1 text-sm wrap-name"><span v-if="entry.role?.memberNo" class="mr-1" :class="`member-${entry.role.memberNo}`">●</span>{{ roleName(entry.role) }}</dd><dd class="mt-1 text-xs text-muted">{{ locationLabel(entry.role) }}</dd></div></dl><p class="mt-3 text-xs leading-6 text-muted">사건 당시의 위치만 보여주며 이동 경로나 사격 방향을 추정하지 않아요.</p><UButton color="neutral" variant="outline" icon="i-lucide-list" class="map-control mt-4" @click="emit('showTimeline', selected.id)">타임라인에서 보기</UButton></div>
      <p v-else-if="located.length" class="text-xs leading-6 text-muted">지도 핀이나 타임라인의 사건을 선택하면 행위자와 대상의 위치를 따로 확인할 수 있어요.</p>
    </div>
  </section>
</template>

<style scoped>
.event-map { min-width: 0; }
.map-viewport { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; background: var(--map-ink); touch-action: pan-y; }
.map-viewport--zoomed { cursor: grab; touch-action: none; }
.map-viewport--dragging { cursor: grabbing; }
.map-scene { position: absolute; inset: 0; transform-origin: center; }
.map-image { display: block; width: 100%; height: 100%; object-fit: contain; user-select: none; }
.event-marker { position: absolute; z-index: 2; display: grid; place-items: center; width: 44px; height: 44px; min-width: 44px; min-height: 44px; transform: translate(-50%, -50%) scale(var(--marker-scale)); border-radius: 50%; cursor: pointer; }
.event-marker__body { position: relative; display: grid; place-items: center; width: 30px; height: 30px; color: var(--map-text); border: 2px solid var(--pin-member); border-radius: 50%; background: var(--map-ink); box-shadow: 0 2px 8px rgb(0 0 0 / 55%); }
.event-marker--selected { z-index: 4; }
.event-marker--selected .event-marker__body { outline: 2px solid var(--map-accent); outline-offset: 3px; }
.event-marker__count, .event-marker__member { position: absolute; top: -9px; right: -9px; min-width: 18px; padding: 0 3px; border-radius: 8px; font-size: 10px; line-height: 18px; font-weight: 800; color: var(--map-ink); background: var(--map-text); }
.event-marker__count { color: var(--map-ink); background: var(--map-accent); }
.selected-location { position: absolute; z-index: 5; width: 16px; height: 16px; border: 3px solid var(--map-text); box-shadow: 0 0 0 2px var(--map-ink); transform: translate(-50%, -50%) scale(var(--marker-scale)); pointer-events: none; }
.selected-location--target { border-radius: 50%; background: var(--map-accent); }
.selected-location--actor { border-radius: 2px; background: var(--map-ink); }
.selected-location span { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); padding: 3px 6px; border: 1px solid var(--map-text); border-radius: 4px; background: var(--map-ink); color: var(--map-text); font-size: 10px; line-height: 14px; white-space: nowrap; }
.selected-location--actor span { top: auto; bottom: 17px; }
.map-scale { position: absolute; right: 10px; bottom: 10px; border-radius: 5px; padding: 4px 7px; background: var(--map-ink); color: var(--map-text); font-size: 11px; pointer-events: none; }
.map-unavailable { aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px; background: var(--ui-bg); color: var(--ui-text-muted); font-size: 13px; }
.map-control { min-width: 44px; min-height: 44px; }
.map-list-summary { min-height: 44px; padding: 10px 0; font-size: 13px; font-weight: 600; cursor: pointer; }
.map-list-summary span { display: block; padding-top: 4px; }
.map-event-option { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--ui-border); border-radius: 8px; text-align: left; font-size: 12px; line-height: 20px; cursor: pointer; }
.map-event-option--selected { border-color: var(--ui-primary); background: color-mix(in srgb, var(--ui-primary) 7%, var(--ui-bg)); }
.map-selection { border-top: 1px solid var(--ui-border); padding-top: 16px; }
</style>
