<script setup lang="ts">
import type { ReportMember } from '~~/shared/types'
defineProps<{ member: ReportMember }>()
const display = useDisplay()
</script>

<template>
  <UCard data-testid="team-member-card">
    <div class="flex items-center gap-3"><span class="member-mark" :class="`member-${member.memberNo}`">{{ member.memberNo }}</span><h3 class="wrap-name min-w-0 font-semibold">{{ member.name }}</h3></div>
    <dl class="mt-5 grid grid-cols-4 gap-2 text-sm"><div><dt class="text-xs text-muted">킬</dt><dd class="mt-1 font-semibold">{{ display.number(member.kills) }}</dd></div><div><dt class="text-xs text-muted">피해량</dt><dd class="mt-1 font-semibold">{{ display.number(member.damageDealt) }}</dd></div><div><dt class="text-xs text-muted">소생</dt><dd class="mt-1 font-semibold">{{ display.number(member.revives) }}</dd></div><div><dt class="text-xs text-muted">생존</dt><dd class="mt-1 font-semibold">{{ display.duration(member.timeSurvived) }}</dd></div></dl>
    <div v-if="member.damageShare !== null" class="mt-4"><div class="mb-2 flex justify-between text-xs text-muted"><span>팀 피해량 비중</span><span>{{ Math.round(member.damageShare) }}%</span></div><div class="h-1.5 overflow-hidden rounded-full bg-elevated"><div class="h-full rounded-full" :style="{ width: `${member.damageShare}%`, backgroundColor: `var(--member-${member.memberNo})` }" /></div></div>
  </UCard>
</template>
