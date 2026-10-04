<script setup lang="ts">
import type { ApiResponse, CreateReportData, MatchListItem, MatchesData, MatchesMeta } from '~~/shared/types'
type Response = ApiResponse<MatchesData, MatchesMeta>
interface FailedBatch { cursor: string | undefined; checked: number; ids: string[] }
definePageMeta({ key: route => route.path })
const route = useRoute()
const router = useRouter()
const display = useDisplay()
const parseError = useApiError()
const queueType = computed(() => String(route.query.queueType || 'all'))
const teamMode = computed(() => String(route.query.teamMode || 'all'))
const endpoint = `/api/players/${encodeURIComponent(String(route.params.platform))}/${encodeURIComponent(String(route.params.accountId))}/matches`
const { data: initial, error: initialError } = await useFetch<Response>(endpoint, { retry: 0, query: { queueType: queueType.value, teamMode: teamMode.value }, watch: false })
const response = shallowRef<Response | null>(initial.value ?? null)
const matches = ref<MatchListItem[]>(initial.value?.data.matches ?? [])
const error = ref(initialError.value ? parseError(initialError.value) : null)
const loading = ref(false)
const creating = ref<string | null>(null)
const lastCursor = ref<string | undefined>()
const highestCursor = ref<string | undefined>()
const failedBatches = ref<FailedBatch[]>(initial.value?.meta.failedMatchIds.length ? [{ cursor: undefined, checked: initial.value.meta.checked, ids: initial.value.meta.failedMatchIds }] : [])
const retryGate = useRetryGate()
onMounted(() => { if (error.value?.retryAfterSeconds) retryGate.block(error.value.retryAfterSeconds) })
let requestVersion = 0
let controller: AbortController | undefined
useSeoMeta({ title: () => `${response.value?.data.player.displayName ?? '플레이어'}의 경기 · Squad Review` })
function reconcileFailures(result: Response, cursor: string | undefined) {
  const failedIds = new Set(result.meta.failedMatchIds)
  failedBatches.value = failedBatches.value.map(batch => batch.checked <= result.meta.checked ? { ...batch, ids: batch.ids.filter(id => failedIds.has(id)) } : batch).filter(batch => batch.ids.length)
  const known = new Set(failedBatches.value.flatMap(batch => batch.ids))
  const newIds = result.meta.failedMatchIds.filter(id => !known.has(id))
  if (newIds.length) failedBatches.value.push({ cursor, checked: result.meta.checked, ids: newIds })
  failedBatches.value.sort((a, b) => a.checked - b.checked)
}
async function load(reset: boolean, retry = false, refresh = false, retryBatch?: FailedBatch) {
  controller?.abort()
  controller = new AbortController()
  const current = ++requestVersion
  const cursor = reset ? undefined : retryBatch ? retryBatch.cursor : retry ? lastCursor.value : response.value?.data.nextCursor ?? undefined
  lastCursor.value = cursor
  loading.value = true
  error.value = null
  if (reset) { matches.value = []; failedBatches.value = []; highestCursor.value = undefined }
  try {
    let result = await $fetch<Response>(endpoint, { retry: 0, query: { queueType: queueType.value, teamMode: teamMode.value, cursor, refresh: refresh ? 'true' : undefined }, signal: controller.signal })
    if (current !== requestVersion) return
    reconcileFailures(result, cursor)
    if (!reset && response.value && result.meta.checked < response.value.meta.checked) {
      // An earlier failed batch returns metadata only through its own prefix.
      // Re-read the furthest loaded (cached) batch to preserve accurate totals and continuation.
      result = await $fetch<Response>(endpoint, { retry: 0, query: { queueType: queueType.value, teamMode: teamMode.value, cursor: highestCursor.value }, signal: controller.signal })
      if (current !== requestVersion) return
      reconcileFailures(result, highestCursor.value)
    } else highestCursor.value = cursor
    const anchor = !reset ? [...document.querySelectorAll<HTMLElement>('[data-match-id]')].find(element => element.getBoundingClientRect().bottom > 0) : undefined
    const anchorId = anchor?.dataset.matchId
    const anchorTop = anchor?.getBoundingClientRect().top
    response.value = result
    const collected = new Map((reset ? [] : matches.value).map(match => [match.matchId, match]))
    for (const match of result.data.matches) collected.set(match.matchId, match)
    matches.value = [...collected.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.matchId.localeCompare(b.matchId))
    if (anchorId && anchorTop !== undefined) {
      await nextTick()
      const moved = [...document.querySelectorAll<HTMLElement>('[data-match-id]')].find(element => element.dataset.matchId === anchorId)
      if (moved) window.scrollBy({ top: moved.getBoundingClientRect().top - anchorTop, behavior: 'instant' })
    }
  } catch (cause) {
    if (current !== requestVersion || controller.signal.aborted) return
    error.value = parseError(cause)
    retryGate.block(error.value.retryAfterSeconds)
  } finally { if (current === requestVersion) loading.value = false }
}
async function changeFilters(value: { queueType?: string; teamMode?: string }) {
  await router.replace({ query: { ...route.query, queueType: value.queueType ?? queueType.value, teamMode: value.teamMode ?? teamMode.value } })
}
watch([queueType, teamMode], () => { void load(true) })
onBeforeUnmount(() => controller?.abort())
async function createReport(matchId: string) {
  if (creating.value || retryGate.seconds.value) return
  creating.value = matchId
  error.value = null
  try {
    const result = await $fetch<ApiResponse<CreateReportData>>('/api/reports', { retry: 0, method: 'POST', body: { platform: route.params.platform, playerId: route.params.accountId, matchId } })
    await navigateTo(`/reports/${result.data.reportId}`)
  } catch (cause) { error.value = parseError(cause); retryGate.block(error.value.retryAfterSeconds) }
  finally { creating.value = null }
}
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <UButton to="/" color="neutral" variant="link" icon="i-lucide-arrow-left" class="mb-6 -ml-3">다른 플레이어 검색</UButton>
    <div class="flex flex-wrap items-end justify-between gap-5">
      <div class="min-w-0"><p class="eyebrow mb-2 text-primary">MATCH HISTORY</p><h1 class="page-heading wrap-name">{{ response?.data.player.displayName ?? '플레이어 경기' }}</h1><div class="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted"><span>{{ display.platform(String(route.params.platform)) }}</span><span>최근 14일 · 3인칭</span><UBadge v-if="response?.meta.source === 'demo'" variant="subtle">샘플 데이터</UBadge></div></div>
      <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" size="lg" :loading="loading" :disabled="!!retryGate.seconds.value" @click="load(true, false, true)">새로고침</UButton>
    </div>
    <div class="my-8 border-y border-default py-6"><MatchModeFilters :queue-type="queueType" :team-mode="teamMode" @change="changeFilters" /><p class="mt-4 text-xs text-muted">전체는 일반·랭크의 듀오·스쿼드 TPP 경기만 포함합니다.</p></div>
    <UAlert v-if="error" class="mb-6" color="error" variant="soft" :title="error.message" :description="[retryGate.seconds.value ? `${retryGate.seconds.value}초 후 다시 시도할 수 있어요.` : '', error.requestId ? `요청 ID: ${error.requestId}` : ''].filter(Boolean).join(' ')" role="alert">
      <template #actions><UButton v-if="error.retryable || error.code === 'SNAPSHOT_EXPIRED'" color="error" variant="outline" :disabled="!!retryGate.seconds.value" @click="load(error.code === 'SNAPSHOT_EXPIRED', true)">다시 시도</UButton></template>
    </UAlert>
    <div v-if="response" class="mb-4 flex flex-wrap justify-between gap-2 text-xs leading-6 text-muted" aria-live="polite"><span>원본 {{ response.meta.checked }}/{{ response.meta.total }}개 확인 · 현재 조건 {{ matches.length }}개 · {{ response.meta.complete ? '조회 범위 최근순' : '확인한 경기 중 최근순' }}</span><span>{{ display.date(response.meta.fetchedAt) }} KST 조회</span></div>
    <div v-if="loading && !matches.length" class="space-y-4" role="status" aria-label="경기 목록을 불러오는 중"><USkeleton v-for="i in 3" :key="i" class="h-36 w-full rounded-xl" /></div>
    <div v-else-if="!matches.length && !error" class="surface py-14 text-center"><UIcon name="i-lucide-search-x" class="size-9 text-muted" /><h2 class="mt-4 font-semibold">{{ response?.meta.complete && !response.meta.failed && !response.meta.unclassified ? '조회 범위에 해당 기록이 없어요' : '아직 확인한 경기 중에는 해당 기록이 없어요' }}</h2><p class="mx-auto mt-2 max-w-sm px-4 text-sm leading-6 text-muted">{{ response?.data.nextCursor ? '다음 묶음을 확인하거나 필터를 바꿔보세요.' : '다른 조건을 선택하거나 기록이 반영된 뒤 다시 확인해 주세요.' }}</p></div>
    <div class="space-y-4"><MatchListItem v-for="match in matches" :key="match.matchId" :match="match" :loading="creating === match.matchId" :disabled="!!creating || !!retryGate.seconds.value" @select="createReport(match.matchId)" /></div>
    <div v-if="response && (response.meta.excluded || response.meta.unclassified || response.meta.failed)" class="mt-5 flex flex-wrap items-center gap-3 text-xs text-muted"><span>미지원 제외 {{ response.meta.excluded }}개 · 분류 확인 불가 {{ response.meta.unclassified }}개 · 조회 실패 {{ response.meta.failed }}개</span><UButton v-if="response.meta.failed" color="neutral" variant="link" :loading="loading" :disabled="!!retryGate.seconds.value" @click="load(false, true, false, failedBatches[0])">실패 묶음 다시 시도</UButton></div>
    <div v-if="response?.data.nextCursor" class="mt-8 text-center"><UButton color="neutral" variant="outline" size="xl" :loading="loading" :disabled="!!retryGate.seconds.value" @click="load(false)">다음 경기 더 보기</UButton><p class="mt-3 text-xs text-muted">다음 묶음을 합친 뒤 경기 시각순으로 정렬합니다.</p></div>
  </UContainer>
</template>
