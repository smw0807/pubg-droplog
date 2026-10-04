<script setup lang="ts">
import type { EventRole, ReportEvent } from '~~/shared/types'
const props = defineProps<{ events: ReportEvent[]; selectedEventId?: string | null }>()
const emit = defineEmits<{ select: [id: string]; showMap: [id: string] }>()
const timeline = ref<HTMLElement>()
const display = useDisplay()
const names: Record<ReportEvent['kind'], string> = { knock: '기절', revive: '소생', kill: '처치', damage: '피해' }
const icons: Record<ReportEvent['kind'], string> = { knock: 'i-lucide-circle-arrow-down', revive: 'i-lucide-heart-pulse', kill: 'i-lucide-crosshair', damage: 'i-lucide-zap' }
const roleName = (role: EventRole | null, event: ReportEvent): string => role ? `${role.memberNo ? `${role.memberNo} · ` : ''}${role.name}` : event.cause === 'environment' ? '환경 피해' : '확인 불가'
const items = computed(() => props.events.map(event => ({
  id: event.id,
  memberNo: event.target?.memberNo ?? event.actor?.memberNo ?? event.knockMaker?.memberNo ?? event.finisher?.memberNo,
  icon: icons[event.kind],
  date: event.elapsedMs === null ? `${display.date(event.occurredAt)} KST · 경과 시간 확인 불가` : display.duration(event.elapsedMs / 1000),
  title: `${names[event.kind]}${event.kind === 'kill' && event.target?.memberNo ? ' · 우리 팀 사망' : ''}  ${roleName(event.actor, event)} → ${roleName(event.target, event)}`,
  description: [
    event.damage !== null ? `피해 ${display.number(event.damage)}` : null,
    event.weaponCode,
    event.cause === 'friendly_fire' ? '아군 공격' : event.cause === 'self' ? '자해' : event.cause === 'environment' ? '환경 피해' : null,
    event.kind === 'kill' ? `기절 유발: ${event.knockMaker ? roleName(event.knockMaker, event) : '확인 불가'} · 마무리: ${event.finisher ? roleName(event.finisher, event) : '확인 불가'}` : null,
    event.assists.length ? `어시스트: ${event.assists.map(role => roleName(role, event)).join(', ')}` : null,
    ...event.warnings,
  ].filter(Boolean).join(' · '),
})))
watch(() => props.selectedEventId, async id => {
  if (!id || !import.meta.client || window.innerWidth < 1024) return
  await nextTick()
  const row = [...(timeline.value?.querySelectorAll<HTMLButtonElement>('[data-event-id]') ?? [])].find(element => element.dataset.eventId === id)
  if (!row) return
  const bounds = row.getBoundingClientRect()
  if (bounds.top < 0 || bounds.bottom > window.innerHeight) row.scrollIntoView({ block: 'nearest', behavior: 'auto' })
})
</script>

<template>
  <div ref="timeline" data-testid="event-timeline">
    <UTimeline :items="items" color="primary" :ui="{ separator: 'bg-default', wrapper: 'min-w-0 pb-4' }">
      <template #wrapper="{ item }">
        <button type="button" class="timeline-event" :class="{ 'timeline-event--selected': item.id === selectedEventId }" :style="{ '--event-member': item.memberNo ? `var(--member-${item.memberNo})` : 'var(--ui-primary)' }" :aria-pressed="item.id === selectedEventId" :data-event-id="item.id" data-testid="timeline-event" @click="emit('select', item.id)">
          <span class="block text-xs font-mono text-muted">{{ item.date }}</span>
          <span class="mt-1 block text-sm leading-6 font-semibold wrap-name">{{ item.title }}</span>
          <span v-if="item.description" class="mt-1 block text-xs leading-6 text-muted wrap-name">{{ item.description }}</span>
          <span v-if="item.id === selectedEventId" class="mt-2 block text-xs font-semibold text-primary">선택한 사건</span>
        </button>
        <UButton v-if="item.id === selectedEventId" color="neutral" variant="link" icon="i-lucide-map-pin" class="mt-1 min-h-11" @click.stop="emit('showMap', item.id)">지도에서 보기</UButton>
      </template>
    </UTimeline>
  </div>
</template>

<style scoped>
.timeline-event { display: block; width: 100%; min-height: 44px; padding: 10px 12px; margin-top: -10px; border: 1px solid transparent; border-left: 3px solid transparent; border-radius: 10px; text-align: left; cursor: pointer; }
.timeline-event:hover { background: var(--ui-bg-elevated); }
.timeline-event--selected { border-color: var(--ui-border); border-left-color: var(--event-member); background: color-mix(in srgb, var(--ui-primary) 6%, var(--ui-bg)); }
</style>
