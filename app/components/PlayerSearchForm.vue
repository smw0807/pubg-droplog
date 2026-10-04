<script setup lang="ts">
import type { FormError } from '@nuxt/ui'

const state = reactive({ platform: 'steam', name: '' })
const ready = ref(false)
onMounted(() => { ready.value = true })
const pending = ref(false)
const error = ref<ReturnType<ReturnType<typeof useApiError>> | null>(null)
const parseError = useApiError()
const retryGate = useRetryGate()
const validate = (values: typeof state): FormError[] => {
  const name = values.name.trim()
  if (!name) return [{ name: 'name', message: '닉네임을 입력해 주세요.' }]
  if (name.length > 32 || /[,;\s]/u.test(name) || [...name].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return [{ name: 'name', message: '공백이나 쉼표 없이 한 명의 닉네임을 32자 이내로 입력해 주세요.' }]
  return []
}
async function search() {
  if (pending.value || retryGate.seconds.value) return
  pending.value = true
  error.value = null
  try {
    const result = await $fetch<{ data: { accountId: string; platform: string } }>('/api/players/search', { retry: 0, query: { platform: state.platform, name: state.name.trim() } })
    await navigateTo(`/players/${result.data.platform}/${encodeURIComponent(result.data.accountId)}`)
  } catch (cause) { error.value = parseError(cause); retryGate.block(error.value.retryAfterSeconds) }
  finally { pending.value = false }
}
</script>

<template>
  <UForm :state="state" :validate="validate" class="space-y-5" @submit="search">
    <div class="grid gap-4 sm:grid-cols-[125px_1fr]">
      <UFormField label="플랫폼" name="platform">
        <USelect v-model="state.platform" :disabled="!ready" :items="[{ label: 'Steam', value: 'steam' }, { label: 'Kakao', value: 'kakao' }]" class="w-full" size="xl" aria-label="플랫폼" />
      </UFormField>
      <UFormField label="플레이어 닉네임" name="name">
        <UInput v-model="state.name" :disabled="!ready" name="nickname" placeholder="정확한 닉네임을 입력하세요" autocomplete="off" :maxlength="33" size="xl" class="w-full" aria-label="플레이어 닉네임" />
      </UFormField>
    </div>
    <UAlert v-if="error" color="error" variant="soft" :title="error.message" :description="error.requestId ? `요청 ID: ${error.requestId}` : undefined" role="alert" />
    <UButton type="submit" size="xl" block :loading="pending" :disabled="!ready || !!retryGate.seconds.value" icon="i-lucide-search">{{ pending ? '플레이어를 찾고 있어요' : retryGate.seconds.value ? `${retryGate.seconds.value}초 후 검색 가능` : '최근 경기 검색' }}</UButton>
    <p class="text-xs leading-relaxed text-muted">최근 14일 범위의 3인칭 경기를 확인합니다. 방금 끝난 경기는 반영까지 시간이 걸릴 수 있어요.</p>
  </UForm>
</template>
