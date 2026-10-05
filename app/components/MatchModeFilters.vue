<script setup lang="ts">
defineProps<{ queueType: string; teamMode: string }>()
const emit = defineEmits<{ change: [value: { queueType?: string; teamMode?: string }] }>()
</script>

<template>
  <div
    class="flex flex-wrap gap-5"
    aria-label="경기 필터"
  >
    <UFormField label="경기 종류">
      <USelect
        :model-value="queueType"
        :items="[
          { label: '전체 경기', value: 'all' },
          { label: '일반', value: 'normal' },
          { label: '랭크', value: 'ranked' },
        ]"
        size="lg"
        class="min-w-36"
        aria-label="경기 종류"
        @update:model-value="emit('change', { queueType: $event })"
      />
    </UFormField>
    <UFormField label="팀 모드">
      <USelect
        :model-value="teamMode"
        :items="[
          { label: '전체 팀 모드', value: 'all' },
          { label: '듀오', value: 'duo' },
          { label: '스쿼드', value: 'squad' },
        ]"
        size="lg"
        class="min-w-36"
        aria-label="팀 모드"
        @update:model-value="emit('change', { teamMode: $event })"
      />
    </UFormField>
  </div>
</template>
