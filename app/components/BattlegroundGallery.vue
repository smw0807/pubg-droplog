<script setup lang="ts">
import { getMapMetadata } from '~/utils/maps'

const maps = ['Baltic_Main', 'Desert_Main', 'Neon_Main', 'Tiger_Main'].map(getMapMetadata)
</script>

<template>
  <div class="mt-8 grid grid-cols-4 gap-2.5 sm:gap-3" aria-label="에란겔, 미라마, 론도, 태이고 맵 이미지">
    <figure v-for="map in maps" :key="map.name" class="battleground relative isolate overflow-hidden rounded-lg border border-white/10">
      <img v-if="map.image" :src="map.image" alt="" width="900" height="900" loading="lazy" class="absolute inset-0 h-full w-full object-cover">
      <div class="battleground-shade absolute inset-0" aria-hidden="true" />
      <figcaption class="absolute inset-x-0 bottom-0 px-2.5 py-3 sm:px-3">
        <span class="block text-xs font-semibold">{{ map.name }}</span>
        <span class="mt-1 hidden text-[9px] tracking-widest text-white/70 uppercase sm:block">{{ map.englishName }}</span>
      </figcaption>
    </figure>
  </div>
</template>

<style scoped>
.battleground { height: 112px; color: var(--map-text); background: var(--map-ink); }
.battleground-shade { background: linear-gradient(180deg, transparent 10%, rgb(9 9 11 / 12%) 35%, rgb(9 9 11 / 92%) 100%); }
@media (min-width: 640px) { .battleground { height: 124px; } }
</style>
