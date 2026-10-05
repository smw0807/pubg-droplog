<script setup lang="ts">
import type { Report } from '~~/shared/types'
import { getMapMetadata } from '~/utils/maps'

const props = defineProps<{ report: Pick<Report, 'summary' | 'quality' | 'platform'> }>()
const display = useDisplay()
const map = computed(() => getMapMetadata(props.report.summary.mapName))
</script>

<template>
  <section
    class="report-map surface mb-8 overflow-hidden"
    aria-labelledby="report-map-title"
  >
    <div class="report-map-scene relative isolate overflow-hidden">
      <img
        v-if="map.image"
        :key="map.image"
        :src="map.image"
        alt=""
        width="900"
        height="900"
        fetchpriority="high"
        class="report-map-image absolute inset-y-0 right-0 h-full object-cover"
      />
      <div
        v-else
        class="report-map-placeholder absolute inset-0"
        aria-hidden="true"
      >
        <UIcon
          name="i-lucide-map"
          class="absolute top-1/2 right-[15%] size-28 -translate-y-1/2 opacity-20"
        />
      </div>
      <div
        class="report-map-shade pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <div
        class="relative flex min-h-72 flex-col justify-between gap-10 p-6 sm:min-h-80 sm:p-9 lg:p-10"
      >
        <div
          class="flex w-fit items-center gap-3 rounded-md bg-black/60 px-3 py-2 sm:bg-transparent sm:p-0"
        >
          <span class="report-map-accent h-px w-7 bg-current" />
          <p class="report-map-accent eyebrow">TEAM MATCH REPORT</p>
        </div>
        <div>
          <p class="mb-2 text-xs font-medium tracking-[.24em] text-white/75 uppercase">
            {{ map.englishName }}
          </p>
          <h1
            id="report-map-title"
            class="wrap-name text-4xl leading-tight font-bold tracking-tight sm:text-5xl"
          >
            {{ map.name }}
          </h1>
          <div class="mt-5 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span class="report-map-mode rounded-md border px-2.5 py-1.5">
              {{ display.queue(report.summary.queueType) }}
            </span>
            <span class="rounded-md border border-white/25 bg-black/30 px-2.5 py-1.5">
              {{ display.team(report.summary.teamMode) }}
            </span>
            <span class="rounded-md border border-white/25 bg-black/30 px-2.5 py-1.5">TPP</span>
          </div>
        </div>
      </div>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-5 px-6 py-5 sm:px-9 lg:px-10">
      <div>
        <UBadge
          :color="report.quality === 'ready' ? 'success' : 'warning'"
          variant="subtle"
          :icon="report.quality === 'ready' ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'"
        >
          {{ report.quality === 'ready' ? '기록 준비 완료' : '부분 리포트' }}
        </UBadge>
        <p class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span class="font-semibold">{{ display.platform(report.platform) }}</span>
          <span
            class="hidden h-3 border-l border-default sm:block"
            aria-hidden="true"
          />
          <time :datetime="report.summary.createdAt">
            {{ display.date(report.summary.createdAt) }} KST
          </time>
        </p>
      </div>
      <ShareReportButton />
    </div>
  </section>
</template>

<style scoped>
.report-map-scene {
  color: var(--map-text);
  background: var(--map-ink);
}
.report-map-image {
  width: 74%;
  object-position: center 43%;
}
.report-map-shade {
  background: linear-gradient(
    90deg,
    var(--map-ink) 4%,
    rgb(9 9 11 / 94%) 24%,
    rgb(9 9 11 / 48%) 53%,
    rgb(9 9 11 / 8%) 100%
  );
}
.report-map-placeholder {
  background-image:
    linear-gradient(rgb(255 255 255 / 5%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 5%) 1px, transparent 1px);
  background-size: 40px 40px;
}
.report-map-accent {
  color: var(--map-accent);
}
.report-map-mode {
  color: var(--map-accent);
  border-color: rgb(251 191 36 / 40%);
  background: rgb(251 191 36 / 10%);
}
@media (max-width: 639px) {
  .report-map-image {
    width: 100%;
    object-position: center;
  }
  .report-map-shade {
    background: linear-gradient(
      0deg,
      rgb(9 9 11 / 96%) 0%,
      rgb(9 9 11 / 65%) 48%,
      rgb(9 9 11 / 25%) 100%
    );
  }
}
</style>
