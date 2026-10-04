<script setup lang="ts">
const copied = ref(false)
const fallback = ref(false)
const url = ref('')
const input = ref<HTMLInputElement>()
async function share() {
  url.value = window.location.href
  copied.value = false
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(url.value)
    copied.value = true
    fallback.value = false
  } catch {
    fallback.value = true
    await nextTick()
    input.value?.focus()
    input.value?.select()
  }
}
</script>

<template>
  <div class="max-w-full sm:max-w-90">
    <UButton size="lg" icon="i-lucide-share-2" @click="share">{{ copied ? '링크 복사 완료' : '리포트 공유' }}</UButton>
    <p class="mt-2 text-xs leading-5 text-muted">링크를 아는 사람은 리포트를 볼 수 있어요.</p>
    <p v-if="copied" role="status" class="mt-2 text-xs text-primary">리포트 링크를 복사했어요.</p>
    <div v-if="fallback" class="mt-3" role="status"><label for="share-url" class="mb-2 block text-xs text-muted">자동 복사가 허용되지 않았어요. 아래 링크를 직접 복사해 주세요.</label><input id="share-url" ref="input" :value="url" readonly class="w-full min-w-0 rounded-lg border border-default bg-default p-3 text-sm" aria-label="공유 리포트 URL"></div>
  </div>
</template>
