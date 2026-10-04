<script setup lang="ts">
import type { MatchListItem } from '~~/shared/types'
defineProps<{ match: MatchListItem; loading?: boolean; disabled?: boolean }>()
defineEmits<{ select: [] }>()
const display = useDisplay()
</script>

<template>
  <article class="surface grid gap-5 p-5 transition-colors sm:grid-cols-[1fr_auto] lg:grid-cols-[1fr_auto_auto] lg:items-center lg:gap-10" data-testid="match-card" :data-match-id="match.matchId">
    <div class="min-w-0">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <UBadge :color="match.queueType === 'ranked' ? 'primary' : 'neutral'" variant="subtle">{{ display.queue(match.queueType) }}</UBadge>
        <UBadge color="neutral" variant="outline">{{ display.team(match.teamMode) }} · {{ match.memberCount }}명</UBadge>
        <span class="text-xs text-muted">TPP</span>
      </div>
      <h3 class="text-lg font-semibold">{{ display.map(match.mapName) }}</h3>
      <p class="mt-1 text-xs text-muted"><time :datetime="match.createdAt">{{ display.date(match.createdAt) }}</time> KST</p>
    </div>
    <dl class="grid grid-cols-3 gap-5 sm:min-w-55 lg:min-w-65">
      <div><dt class="text-xs text-muted">순위</dt><dd class="mt-1 text-2xl font-bold tracking-tight">{{ match.rank == null ? '—' : `#${match.rank}` }}</dd></div>
      <div><dt class="text-xs text-muted">킬</dt><dd class="mt-1 text-2xl font-bold tracking-tight">{{ display.number(match.kills) }}</dd></div>
      <div><dt class="text-xs text-muted">피해량</dt><dd class="mt-1 text-2xl font-bold tracking-tight">{{ display.number(match.damageDealt) }}</dd></div>
    </dl>
    <UButton color="neutral" variant="outline" size="lg" class="justify-center sm:col-span-2 lg:col-auto" trailing-icon="i-lucide-arrow-right" :loading="loading" :disabled="disabled" @click="$emit('select')">{{ loading ? '경기 기록을 정리하는 중' : '리포트 보기' }}</UButton>
  </article>
</template>
