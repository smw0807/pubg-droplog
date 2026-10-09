<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { PlayerSearchHistoryEntry } from '~/composables/usePlayerSearchHistory'

const state = reactive<PlayerSearchHistoryEntry>({ platform: 'steam', name: '' })
const history = usePlayerSearchHistory()
const display = useDisplay()
const historyOpen = ref(false)
const historyId = useId()
const historyContainer = useTemplateRef('historyContainer')
const historyPanel = useTemplateRef('historyPanel')
const nicknameInput = useTemplateRef('nicknameInput')
const searchForm = useTemplateRef('searchForm')
const historyVisible = computed(() => historyOpen.value && history.entries.value.length > 0)

function closeHistory() {
  nicknameInput.value?.inputRef?.focus()
  historyOpen.value = false
}

function selectHistory(entry: PlayerSearchHistoryEntry) {
  state.name = entry.name
  state.platform = entry.platform
  error.value = null
  searchForm.value?.clear('name')
  closeHistory()
}

function removeHistory(entry: PlayerSearchHistoryEntry) {
  history.remove(entry)
  nicknameInput.value?.inputRef?.focus()
}

function clearHistory() {
  history.clear()
  closeHistory()
}

function onHistoryFocusOut(event: FocusEvent) {
  // Safari can blur the input without focusing a clicked history button.
  // Pointer dismissal is handled separately so its click can still select the entry.
  if (event.relatedTarget && !historyContainer.value?.contains(event.relatedTarget as Node)) {
    historyOpen.value = false
  }
}

function onPointerDown(event: PointerEvent) {
  if (!historyContainer.value?.contains(event.target as Node)) historyOpen.value = false
}

async function focusHistory(event: KeyboardEvent) {
  if (!history.entries.value.length) return
  event.preventDefault()
  historyOpen.value = true
  await nextTick()
  historyPanel.value?.querySelector<HTMLButtonElement>('[data-history-select]')?.focus()
}

const ready = ref(false)
onMounted(() => {
  ready.value = true
  document.addEventListener('pointerdown', onPointerDown)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))
const pending = ref(false)
const error = ref<ReturnType<ReturnType<typeof useApiError>> | null>(null)
const parseError = useApiError()
const retryGate = useRetryGate()
const validate = (values: typeof state): FormError[] => {
  const name = values.name.trim()
  if (!name) return [{ name: 'name', message: '닉네임을 입력해 주세요.' }]
  if (
    name.length > 32 ||
    /[,;\s]/u.test(name) ||
    [...name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return [
      { name: 'name', message: '공백이나 쉼표 없이 한 명의 닉네임을 32자 이내로 입력해 주세요.' },
    ]
  return []
}
async function search() {
  if (pending.value || retryGate.seconds.value) return
  pending.value = true
  error.value = null
  historyOpen.value = false
  const query = { platform: state.platform, name: state.name.trim() }
  try {
    const result = await $fetch<{ data: { accountId: string; platform: string } }>(
      '/api/players/search',
      { retry: 0, query },
    )
    history.remember(query)
    await navigateTo(
      `/players/${result.data.platform}/${encodeURIComponent(result.data.accountId)}`,
    )
  } catch (cause) {
    error.value = parseError(cause)
    retryGate.block(error.value.retryAfterSeconds)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UForm
    ref="searchForm"
    :state="state"
    :validate="validate"
    class="space-y-5"
    @submit="search"
  >
    <div class="grid gap-4 sm:grid-cols-[125px_1fr]">
      <UFormField
        label="플랫폼"
        name="platform"
      >
        <USelect
          v-model="state.platform"
          :disabled="!ready"
          :items="[
            { label: 'Steam', value: 'steam' },
            { label: 'Kakao', value: 'kakao' },
          ]"
          class="w-full"
          size="xl"
          aria-label="플랫폼"
        />
      </UFormField>
      <UFormField
        label="플레이어 닉네임"
        name="name"
      >
        <div
          ref="historyContainer"
          class="relative"
          @focusout="onHistoryFocusOut"
          @keydown.esc.prevent.stop="closeHistory"
        >
          <UInput
            ref="nicknameInput"
            v-model="state.name"
            :disabled="!ready"
            name="nickname"
            placeholder="정확한 닉네임을 입력하세요"
            autocomplete="off"
            :maxlength="33"
            size="xl"
            class="w-full"
            aria-label="플레이어 닉네임"
            :aria-controls="historyVisible ? historyId : undefined"
            @update:model-value="historyOpen = false"
            @focus="historyOpen = true"
            @click="historyOpen = true"
            @keydown.down="focusHistory"
          />
          <section
            v-if="historyVisible"
            :id="historyId"
            ref="historyPanel"
            aria-label="최근 검색 기록"
            class="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-default bg-default shadow-lg"
            @pointerdown.prevent
          >
            <div class="flex items-center justify-between gap-2 border-b border-default px-3 py-2">
              <h3 class="text-xs font-semibold text-muted">최근 검색 기록</h3>
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="clearHistory"
              >
                전체 삭제
              </UButton>
            </div>
            <ul class="max-h-64 overflow-y-auto p-1">
              <li
                v-for="entry in history.entries.value"
                :key="`${entry.platform}:${entry.name}`"
                class="flex items-center gap-1"
              >
                <button
                  type="button"
                  data-history-select
                  data-testid="search-history-entry"
                  :aria-label="`${entry.name} · ${display.platform(entry.platform)}`"
                  class="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
                  @click="selectHistory(entry)"
                >
                  <UIcon
                    name="i-lucide-history"
                    class="size-4 shrink-0 text-muted"
                  />
                  <span class="min-w-0 flex-1 truncate">{{ entry.name }}</span>
                  <span class="shrink-0 text-xs text-muted">
                    {{ display.platform(entry.platform) }}
                  </span>
                </button>
                <UButton
                  type="button"
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  class="min-h-11 min-w-11 justify-center"
                  :aria-label="`${entry.name} · ${display.platform(entry.platform)} 검색 기록 삭제`"
                  @click="removeHistory(entry)"
                />
              </li>
            </ul>
          </section>
        </div>
      </UFormField>
    </div>
    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      :title="error.message"
      :description="error.requestId ? `요청 ID: ${error.requestId}` : undefined"
      role="alert"
    />
    <UButton
      type="submit"
      size="xl"
      block
      :loading="pending"
      :disabled="!ready || !!retryGate.seconds.value"
      icon="i-lucide-search"
    >
      {{
        pending
          ? '플레이어를 찾고 있어요'
          : retryGate.seconds.value
            ? `${retryGate.seconds.value}초 후 검색 가능`
            : '최근 경기 검색'
      }}
    </UButton>
    <p class="text-xs leading-relaxed text-muted">
      최근 14일 범위의 3인칭 경기를 확인합니다. 방금 끝난 경기는 반영까지 시간이 걸릴 수 있어요.
    </p>
  </UForm>
</template>
