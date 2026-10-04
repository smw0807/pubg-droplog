<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ReportMember } from '~~/shared/types'
defineProps<{ members: ReportMember[] }>()
const display = useDisplay()
const columns: TableColumn<ReportMember>[] = [
  { accessorKey: 'name', header: '팀원' }, { accessorKey: 'kills', header: '킬' }, { accessorKey: 'damageDealt', header: '피해량' },
  { accessorKey: 'revives', header: '소생' }, { accessorKey: 'timeSurvived', header: '생존 시간' }, { accessorKey: 'damageShare', header: '팀 피해량 비중' },
]
</script>

<template>
  <section aria-labelledby="stats-title">
    <div class="mb-5 flex flex-wrap items-baseline justify-between gap-2"><h2 id="stats-title" class="text-xl font-semibold tracking-tight">함께한 팀원 <span class="ml-1 text-sm font-normal text-muted">{{ members.length }}명</span></h2><span class="text-xs text-muted">공식 경기 통계 기준</span></div>
    <div class="hidden overflow-hidden rounded-xl border border-default md:block"><UTable :data="members" :columns="columns" :ui="{ th: 'bg-elevated px-5 py-4', td: 'px-5 py-5' }" data-testid="team-stats-table">
      <template #name-cell="{ row }"><div class="flex max-w-64 items-center gap-3"><span class="member-mark" :class="`member-${row.original.memberNo}`">{{ row.original.memberNo }}</span><span class="wrap-name whitespace-normal font-semibold">{{ row.original.name }}</span></div></template>
      <template #kills-cell="{ row }"><span class="font-semibold">{{ display.number(row.original.kills) }}</span></template>
      <template #damageDealt-cell="{ row }"><span class="font-semibold">{{ display.number(row.original.damageDealt) }}</span></template>
      <template #revives-cell="{ row }">{{ display.number(row.original.revives) }}</template>
      <template #timeSurvived-cell="{ row }">{{ display.duration(row.original.timeSurvived) }}</template>
      <template #damageShare-cell="{ row }"><div v-if="row.original.damageShare !== null" class="flex min-w-28 items-center gap-3"><div class="h-1.5 w-20 overflow-hidden rounded-full bg-elevated"><div class="h-full rounded-full" :style="{ width: `${row.original.damageShare}%`, backgroundColor: `var(--member-${row.original.memberNo})` }" /></div><span class="text-xs text-muted">{{ Math.round(row.original.damageShare) }}%</span></div><span v-else class="text-muted">—</span></template>
    </UTable></div>
    <div class="grid gap-3 md:hidden"><TeamMemberCard v-for="member in members" :key="member.participantId" :member="member" /></div>
    <p class="mt-3 text-xs leading-6 text-muted">—는 확인할 수 없는 값입니다. 일부 피해량이 누락되면 비중을 표시하지 않아요. 이벤트 피해 합계와 공식 피해량은 다를 수 있습니다.</p>
  </section>
</template>
