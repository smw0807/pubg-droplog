<script setup lang="ts">
import type { ReportMember } from '~~/shared/types'
const props = defineProps<{
  selected: string
  memberNo: string
  members: ReportMember[]
  disabled?: boolean
}>()
const emit = defineEmits<{ change: [value: { selected?: string; memberNo?: string }]; reset: [] }>()
const items = [
  { label: '주요 이벤트', value: 'major' },
  { label: '전체', value: 'all' },
  { label: '기절', value: 'knock' },
  { label: '소생', value: 'revive' },
  { label: '처치와 사망', value: 'kill' },
  { label: '피해', value: 'damage' },
]
const members = computed(() => [
  { label: '모든 팀원', value: 'all' },
  ...props.members.map((member) => ({
    label: `${member.memberNo} · ${member.name}`,
    value: String(member.memberNo),
  })),
])
</script>

<template>
  <div class="space-y-4">
    <div
      class="flex flex-wrap gap-2"
      role="group"
      aria-label="이벤트 유형"
    >
      <UButton
        v-for="item in items"
        :key="item.value"
        :color="selected === item.value ? 'primary' : 'neutral'"
        :variant="selected === item.value ? 'solid' : 'outline'"
        size="lg"
        :aria-pressed="selected === item.value"
        :disabled="disabled"
        @click="emit('change', { selected: item.value })"
      >
        {{ item.label }}
      </UButton>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <USelect
        :model-value="memberNo"
        :items="members"
        class="w-full max-w-72"
        size="lg"
        aria-label="팀원 필터"
        :disabled="disabled"
        @update:model-value="emit('change', { memberNo: $event })"
      />
      <UButton
        color="neutral"
        variant="link"
        icon="i-lucide-rotate-ccw"
        :disabled="disabled"
        @click="emit('reset')"
      >
        필터 초기화
      </UButton>
    </div>
  </div>
</template>
