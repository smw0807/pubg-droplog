<script setup lang="ts">
import type { ApiResponse, EventsData, Report, ReportEvent } from '~~/shared/types'
definePageMeta({ key: route => route.path })
const route = useRoute()
const display = useDisplay()
const parseError = useApiError()
const endpoint = `/api/reports/${encodeURIComponent(String(route.params.reportId))}`
const { data: initial, error: initialError } = await useFetch<ApiResponse<Report>>(endpoint, { retry: 0 })
const report = ref(initial.value?.data ?? null)
const reportError = ref(initialError.value ? parseError(initialError.value) : null)
const selected = ref('major')
const memberNo = ref('all')
const kinds = computed(() => selected.value === 'major' ? 'knock,revive,kill' : selected.value === 'all' ? 'knock,revive,kill,damage' : selected.value)
const { data: initialEvents, error: initialEventsError } = await useFetch<ApiResponse<EventsData>>(`${endpoint}/events`, { retry: 0, query: { kinds: kinds.value, limit: 50 }, immediate: !!report.value, watch: false })
const events = ref<ReportEvent[]>(initialEvents.value?.data.events ?? [])
const eventsTotal = ref(initialEvents.value?.data.total ?? 0)
const nextCursor = ref<string | null>(initialEvents.value?.data.nextCursor ?? null)
const eventError = ref(initialEventsError.value ? parseError(initialEventsError.value) : null)
const loadingEvents = ref(false)
const retrying = ref(false)
const reloading = ref(false)
const revisionNotice = ref(false)
const retryGate = useRetryGate()
const eventGate = useRetryGate()
let controller: AbortController | undefined
let requestVersion = 0
const sampleOptions = [{ label: '일반 듀오', value: 'demo-normal-duo' }, { label: '일반 스쿼드', value: 'demo-normal-squad' }, { label: '랭크 듀오', value: 'demo-ranked-duo' }, { label: '랭크 스쿼드', value: 'demo-ranked-squad' }]
const sampleId = computed(() => sampleOptions.some(item => item.value === report.value?.id) ? report.value?.id : undefined)
useSeoMeta({ title: () => report.value ? `${display.map(report.value.summary.mapName)} ${display.team(report.value.summary.teamMode)} 리포트 · Squad Review` : '경기 리포트 · Squad Review', robots: 'noindex, nofollow' })
function syncRetryTime() {
  if (report.value?.retry.notBefore) retryGate.block(Math.max(0, (Date.parse(report.value.retry.notBefore) - Date.now()) / 1000))
}
onMounted(() => {
  syncRetryTime()
  if (reportError.value?.retryAfterSeconds) retryGate.block(reportError.value.retryAfterSeconds)
  if (eventError.value?.retryAfterSeconds) eventGate.block(eventError.value.retryAfterSeconds)
})
async function reloadReport() {
  if (reloading.value) return
  reloading.value = true
  reportError.value = null
  try {
    const response = await $fetch<ApiResponse<Report>>(endpoint, { retry: 0 })
    report.value = response.data
    syncRetryTime()
    await loadEvents(true)
  } catch (cause) { reportError.value = parseError(cause); retryGate.block(reportError.value.retryAfterSeconds) }
  finally { reloading.value = false }
}
async function loadEvents(reset: boolean, recovering = false) {
  controller?.abort()
  controller = new AbortController()
  const current = ++requestVersion
  loadingEvents.value = true
  eventError.value = null
  if (reset) { events.value = []; nextCursor.value = null }
  try {
    const response = await $fetch<ApiResponse<EventsData>>(`${endpoint}/events`, { retry: 0, query: { kinds: kinds.value, memberNo: memberNo.value === 'all' ? undefined : memberNo.value, limit: 50, cursor: reset ? undefined : nextCursor.value ?? undefined }, signal: controller.signal })
    if (current !== requestVersion) return
    events.value = reset ? response.data.events : [...events.value, ...response.data.events]
    eventsTotal.value = response.data.total
    nextCursor.value = response.data.nextCursor
  } catch (cause) {
    if (current !== requestVersion || controller.signal.aborted) return
    const failure = parseError(cause)
    if (!recovering && ['REVISION_MISMATCH', 'CURSOR_STALE', 'SNAPSHOT_EXPIRED', 'REPORT_REVISION_CHANGED'].includes(failure.code)) {
      revisionNotice.value = true
      try {
        const refreshed = await $fetch<ApiResponse<Report>>(endpoint, { retry: 0 })
        report.value = refreshed.data
        await loadEvents(true, true)
      } catch (refreshError) { eventError.value = parseError(refreshError) }
    } else { eventError.value = failure; eventGate.block(failure.retryAfterSeconds) }
  } finally { if (current === requestVersion) loadingEvents.value = false }
}
function changeFilters(value: { selected?: string; memberNo?: string }) {
  selected.value = value.selected ?? selected.value
  memberNo.value = value.memberNo ?? memberNo.value
  void loadEvents(true)
}
async function retryReport() {
  if (retrying.value || retryGate.seconds.value || !report.value?.retry.available) return
  retrying.value = true
  reportError.value = null
  try {
    const result = await $fetch<ApiResponse<Report>>(`${endpoint}/retry`, { retry: 0, method: 'POST' })
    report.value = result.data
    syncRetryTime()
    await loadEvents(true)
  } catch (cause) { reportError.value = parseError(cause); retryGate.block(reportError.value.retryAfterSeconds) }
  finally { retrying.value = false }
}
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <UButton to="/" color="neutral" variant="link" icon="i-lucide-arrow-left" class="mb-6 -ml-3">플레이어 검색</UButton>
    <UAlert v-if="reportError" class="mb-6" color="error" variant="soft" :title="reportError.message" :description="[retryGate.seconds.value ? `${retryGate.seconds.value}초 후 다시 시도할 수 있어요.` : '', reportError.requestId ? `요청 ID: ${reportError.requestId}` : ''].filter(Boolean).join(' ')" role="alert"><template #actions><UButton v-if="reportError.retryable" color="error" variant="outline" :loading="reloading" :disabled="!!retryGate.seconds.value" @click="reloadReport">다시 불러오기</UButton></template></UAlert>
    <template v-if="report">
      <section v-if="report.source === 'demo'" class="mb-8 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5" aria-label="샘플 리포트 안내"><div class="flex flex-wrap items-center justify-between gap-4"><div><UBadge variant="subtle" class="mb-2">샘플 리포트</UBadge><p class="text-sm leading-6 text-muted">합성 데이터로 구성한 리포트예요. 실제 경기나 큐 제공 여부를 나타내지 않습니다.</p></div><USelect :model-value="sampleId" :items="sampleOptions" placeholder="다른 샘플 선택" class="w-full sm:w-44" size="lg" aria-label="샘플 경기 조합" @update:model-value="navigateTo(`/reports/${$event}`)" /></div></section>
      <div class="mb-8 flex flex-wrap items-start justify-between gap-6">
        <div class="min-w-0"><p class="eyebrow mb-3 text-primary">TEAM MATCH REPORT</p><div class="flex flex-wrap items-center gap-3"><h1 class="page-heading">{{ display.map(report.summary.mapName) }}</h1><UBadge :color="report.quality === 'ready' ? 'success' : 'warning'" variant="subtle">{{ report.quality === 'ready' ? '기록 준비 완료' : '부분 리포트' }}</UBadge></div><div class="mt-4 flex flex-wrap items-center gap-2"><UBadge color="primary" variant="subtle">{{ display.queue(report.summary.queueType) }}</UBadge><UBadge color="neutral" variant="outline">{{ display.team(report.summary.teamMode) }}</UBadge><UBadge color="neutral" variant="outline">TPP</UBadge><span class="ml-1 text-xs text-muted">{{ display.platform(report.platform) }} · {{ display.date(report.summary.createdAt) }} KST</span></div></div>
        <ShareReportButton />
      </div>
      <div v-if="report.quality === 'partial'" class="mb-6"><DataQualityNotice :report="report" :retrying="retrying" :cooldown="retryGate.seconds.value" @retry="retryReport" /></div>
      <ReportSummary :summary="report.summary" />
      <div class="mt-10"><TeamStatsTable :members="report.members" /></div>
      <section class="mt-12 border-t border-default pt-8" aria-labelledby="timeline-title">
        <div class="mb-6 flex flex-wrap items-baseline justify-between gap-2"><h2 id="timeline-title" class="text-xl font-semibold tracking-tight">한 판의 순간들</h2><span class="text-xs text-muted">텔레메트리 이벤트 기준</span></div>
        <EventFilters :selected="selected" :member-no="memberNo" :members="report.members" @change="changeFilters" @reset="changeFilters({ selected: 'major', memberNo: 'all' })" />
        <p class="mt-4 text-xs leading-6 text-muted">주요 이벤트는 기절·소생·처치와 사망입니다. 팀원 선택은 어시스트를 포함한 모든 역할을 확인합니다. 첫 사망을 최종 탈락으로 해석하지 않습니다.</p>
        <UAlert v-if="revisionNotice" class="mt-5" color="info" variant="soft" title="리포트가 갱신되어 첫 이벤트부터 다시 불러왔어요." />
        <UAlert v-if="eventError" class="mt-5" color="error" variant="soft" :title="eventError.message" :description="eventError.requestId ? `요청 ID: ${eventError.requestId}` : undefined" role="alert"><template #actions><UButton color="error" variant="outline" :disabled="!!eventGate.seconds.value" @click="loadEvents(!events.length)">{{ eventGate.seconds.value ? `${eventGate.seconds.value}초 후 재시도` : '다시 시도' }}</UButton></template></UAlert>
        <div class="mt-6 surface p-5 sm:p-8">
          <p class="mb-6 text-xs text-muted" aria-live="polite">{{ events.length }}/{{ eventsTotal }}개 이벤트 표시</p>
          <div v-if="loadingEvents && !events.length" class="space-y-6" role="status" aria-label="이벤트를 불러오는 중"><USkeleton v-for="i in 3" :key="i" class="h-16 w-full" /></div>
          <TeamTimeline v-else-if="events.length" :events="events" />
          <div v-else-if="!eventError" class="py-8 text-center"><UIcon name="i-lucide-list-filter" class="size-8 text-muted" /><h3 class="mt-4 font-medium">현재 조건에 맞는 기록이 없어요</h3><p class="mt-2 text-sm text-muted">{{ report.quality === 'partial' ? '일부 상세 기록이 누락되었을 수 있어요.' : '이벤트 유형이나 팀원을 바꿔보세요.' }}</p><UButton color="neutral" variant="link" class="mt-3" @click="changeFilters({ selected: 'major', memberNo: 'all' })">필터 초기화</UButton></div>
          <div v-if="nextCursor" class="mt-6 border-t border-default pt-6 text-center"><UButton color="neutral" variant="outline" size="lg" :loading="loadingEvents" :disabled="!!eventGate.seconds.value" @click="loadEvents(false)">이벤트 더 보기</UButton></div>
        </div>
      </section>
      <aside class="mt-8 text-xs leading-7 text-muted" aria-label="데이터 출처"><p>데이터 출처: {{ report.source === 'demo' ? '합성 샘플 데이터' : 'PUBG 공식 Match API · Telemetry' }} · 성적은 공식 경기 통계, 사건은 텔레메트리를 사용합니다.</p><p>분석 {{ report.analysisVersion }} · 분류 {{ report.summary.classificationVersion }} · 리비전 {{ report.revision }} · 생성 {{ display.date(report.generatedAt) }} KST</p><p>확인할 수 없는 값은 —로 표시합니다. 준비 완료 상태도 원본 API의 모든 사건이 완전함을 보장하지 않습니다.</p></aside>
    </template>
  </UContainer>
</template>
