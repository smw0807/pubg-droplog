<script setup lang="ts">
import type { EventRole, ReportEvent } from '~~/shared/types'
const props = defineProps<{ events: ReportEvent[] }>()
const display = useDisplay()
const names: Record<ReportEvent['kind'], string> = { knock: '기절', revive: '소생', kill: '처치', damage: '피해' }
const icons: Record<ReportEvent['kind'], string> = { knock: 'i-lucide-circle-arrow-down', revive: 'i-lucide-heart-pulse', kill: 'i-lucide-crosshair', damage: 'i-lucide-zap' }
const roleName = (role: EventRole | null, event: ReportEvent): string => role ? `${role.memberNo ? `${role.memberNo} · ` : ''}${role.name}` : event.cause === 'environment' ? '환경 피해' : '확인 불가'
const items = computed(() => props.events.map(event => ({
  id: event.id,
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
</script>

<template>
  <UTimeline :items="items" color="primary" :ui="{ title: 'text-sm leading-6 wrap-name', description: 'text-xs leading-6 wrap-name', date: 'text-xs font-mono', separator: 'bg-default' }" data-testid="event-timeline" />
</template>
