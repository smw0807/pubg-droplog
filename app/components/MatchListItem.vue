<script setup lang="ts">
import type { MatchListItem } from '~~/shared/types'
import { getMapMetadata } from '~/utils/maps'
const props = defineProps<{ match: MatchListItem; loading?: boolean; disabled?: boolean }>()
defineEmits<{ select: [] }>()
const display = useDisplay()
const map = computed(() => getMapMetadata(props.match.mapName))
</script>

<template>
  <article class="match-card surface" data-testid="match-card" :data-match-id="match.matchId">
    <div class="match-card__map">
      <img v-if="map.image" :src="map.image" :alt="`${map.name} 맵 미리보기`" width="900" height="900" loading="lazy" class="match-card__image">
      <div v-else class="match-card__fallback"><UIcon name="i-lucide-map" class="size-8" /><span>맵 미리보기 없음</span></div>
      <div v-if="map.image" class="match-card__map-shade" aria-hidden="true" />
      <span class="match-card__map-label" aria-hidden="true">{{ map.englishName }}</span>
    </div>
    <div class="match-card__content">
      <div class="min-w-0">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <UBadge :color="match.queueType === 'ranked' ? 'primary' : 'neutral'" variant="subtle">{{ display.queue(match.queueType) }}</UBadge>
          <UBadge color="neutral" variant="outline">{{ display.team(match.teamMode) }} · {{ match.memberCount }}명</UBadge>
          <span class="text-xs text-muted">TPP</span>
        </div>
        <h3 class="text-lg font-semibold">{{ map.name }}</h3>
        <p class="mt-1 text-xs text-muted"><time :datetime="match.createdAt">{{ display.date(match.createdAt) }}</time> KST</p>
      </div>
      <dl class="grid grid-cols-3 gap-5 sm:min-w-48 lg:min-w-60">
        <div><dt class="text-xs text-muted">순위</dt><dd class="mt-1 text-2xl font-bold tracking-tight">{{ match.rank == null ? '—' : `#${match.rank}` }}</dd></div>
        <div><dt class="text-xs text-muted">킬</dt><dd class="mt-1 text-2xl font-bold tracking-tight">{{ display.number(match.kills) }}</dd></div>
        <div><dt class="text-xs text-muted">피해량</dt><dd class="mt-1 text-2xl font-bold tracking-tight">{{ display.number(match.damageDealt) }}</dd></div>
      </dl>
      <UButton color="neutral" variant="outline" size="lg" class="match-card__action justify-center" trailing-icon="i-lucide-arrow-right" :loading="loading" :disabled="disabled" @click="$emit('select')">{{ loading ? '경기 기록을 정리하는 중' : '리포트 보기' }}</UButton>
    </div>
  </article>
</template>

<style scoped>
.match-card { display: grid; overflow: hidden; }
.match-card__map { position: relative; min-width: 0; height: 148px; overflow: hidden; background: var(--map-ink); }
.match-card__image { width: 100%; height: 100%; object-fit: cover; object-position: center 42%; }
.match-card__map-shade { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 25%, color-mix(in srgb, var(--map-ink) 78%, transparent)); }
.match-card__map-label { position: absolute; left: 20px; right: 12px; bottom: 16px; color: var(--map-text); font-size: 13px; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; overflow-wrap: anywhere; }
.match-card__fallback { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding-bottom: 24px; color: var(--map-text); font-size: 12px; }
.match-card__content { min-width: 0; display: grid; align-items: center; gap: 20px; padding: 20px; }
.match-card__action { min-height: 44px; }
@media (min-width: 640px) {
  .match-card { grid-template-columns: 176px minmax(0, 1fr); }
  .match-card__map { height: 100%; min-height: 190px; }
  .match-card__content { grid-template-columns: minmax(0, 1fr) auto; }
  .match-card__action { grid-column: 1 / -1; }
}
@media (min-width: 1024px) {
  .match-card { grid-template-columns: 190px minmax(0, 1fr); }
  .match-card__map { min-height: 172px; }
  .match-card__content { grid-template-columns: minmax(0, 1fr) auto auto; gap: 28px; padding: 24px; }
  .match-card__action { grid-column: auto; }
}
</style>
