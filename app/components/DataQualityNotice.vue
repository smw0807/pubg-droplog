<script setup lang="ts">
import type { Report } from '~~/shared/types'
const props = defineProps<{ report: Report; retrying: boolean; cooldown: number }>()
defineEmits<{ retry: [] }>()
const reasons: Record<string, string> = { DEMO_REPORT: '샘플 리포트는 실제 기록을 재분석할 수 없어요.', ANALYSIS_VERSION: '이전 분석 버전으로 생성된 리포트는 재분석할 수 없어요.', READY: '이미 상세 기록을 확인한 리포트예요.', COOLDOWN: '잠시 후 상세 기록을 다시 요청할 수 있어요.' }
const reason = computed(() => reasons[props.report.retry.reason ?? ''] ?? props.report.retry.reason)
</script>

<template>
  <UAlert v-if="report.quality === 'partial'" color="warning" variant="subtle" title="일부 기록을 확인하지 못한 부분 리포트예요" icon="i-lucide-info">
    <template #description><p class="mt-1 leading-6">확인된 성적표와 사건만 표시합니다. 기록 누락은 해당 사건이 없었다는 의미가 아니에요.</p><ul class="mt-2 space-y-1"><li v-for="warning in report.warnings" :key="warning.code">{{ warning.message }}<span v-if="warning.count > 1"> ({{ warning.count }}건)</span></li></ul><p v-if="reason && !report.retry.available" class="mt-2 text-xs">{{ reason }}</p></template>
    <template #actions><UButton v-if="report.retry.available" color="warning" variant="outline" :loading="retrying" :disabled="cooldown > 0" @click="$emit('retry')">{{ cooldown > 0 ? `${cooldown}초 후 재시도` : '상세 기록 다시 시도' }}</UButton></template>
  </UAlert>
</template>
