<script setup lang="ts">
import type { ReportSummary } from '~~/shared/types'
defineProps<{ summary: ReportSummary }>()
const display = useDisplay()
</script>

<template>
  <section
    class="grid grid-cols-2 gap-4 sm:grid-cols-3"
    aria-label="팀 요약"
  >
    <UCard class="col-span-2 sm:col-span-1">
      <div class="flex items-center justify-between">
        <p class="text-sm text-muted">팀 순위</p>
        <UIcon
          name="i-lucide-trophy"
          class="size-5 text-primary"
        />
      </div>
      <p class="stat-value mt-4 text-primary">
        {{ summary.rank == null ? '—' : `#${summary.rank}` }}
      </p>
      <p class="mt-3 text-xs text-muted">공식 로스터 순위</p>
    </UCard>
    <UCard>
      <p class="text-sm text-muted">팀 킬</p>
      <p class="stat-value mt-4">{{ display.number(summary.teamKills) }}</p>
      <p class="mt-3 text-xs text-muted">
        {{ summary.killsComplete ? '공식 개인 킬의 합' : '확인된 합계 · 일부 누락' }}
      </p>
    </UCard>
    <UCard>
      <p class="text-sm text-muted">팀 피해량</p>
      <p class="stat-value mt-4">{{ display.number(summary.teamDamage) }}</p>
      <p class="mt-3 text-xs text-muted">
        {{ summary.damageComplete ? '공식 피해량 합산 후 반올림' : '확인된 합계 · 일부 누락' }}
      </p>
    </UCard>
  </section>
</template>
