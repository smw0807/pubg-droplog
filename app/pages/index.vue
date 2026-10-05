<script setup lang="ts">
useSeoMeta({
  title: 'PUBG DropLog · 우리 팀의 한 판',
  description: 'PUBG 3인칭 일반·랭크 듀오와 스쿼드의 팀 성적과 사건을 함께 돌아보세요.',
})
const { data: status } = await useFetch<{ data: { mode: string } }>('/api/status')
</script>

<template>
  <UContainer class="relative py-12 sm:py-20 lg:py-24">
    <div
      aria-hidden="true"
      class="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[560px]"
    />
    <div class="relative grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
      <section>
        <div class="mb-7 flex items-center gap-3">
          <span class="h-px w-8 bg-primary" />
          <span class="eyebrow text-primary">EVERY MATCH HAS A STORY</span>
        </div>
        <h1
          class="text-[2.65rem] leading-[1.18] font-bold tracking-[-.065em] sm:text-6xl lg:text-[4.2rem]"
        >
          우리 팀의 한 판을
          <br />
          <span class="text-primary">함께 돌아보세요.</span>
        </h1>
        <p class="mt-6 max-w-md text-base leading-8 text-muted">
          마지막 순위 너머의 기록.
          <br />
          팀원들의 성적과 결정적인 순간을 한곳에 모아,
          <br class="hidden sm:block" />
          같은 한 판을 함께 이야기하세요.
        </p>
        <div class="mt-8 flex flex-wrap gap-2">
          <UBadge
            color="neutral"
            variant="outline"
            size="lg"
          >
            3인칭 TPP
          </UBadge>
          <UBadge
            color="neutral"
            variant="outline"
            size="lg"
          >
            일반 · 랭크
          </UBadge>
          <UBadge
            color="neutral"
            variant="outline"
            size="lg"
          >
            듀오 · 스쿼드
          </UBadge>
        </div>
        <BattlegroundGallery />
      </section>
      <UCard
        class="relative shadow-xl shadow-black/5"
        :ui="{ body: 'p-6 sm:p-8' }"
      >
        <div class="mb-7 flex items-start justify-between gap-3">
          <div>
            <p class="eyebrow text-muted">FIND YOUR MATCH</p>
            <h2 class="mt-2 text-xl font-semibold">어떤 한 판을 돌아볼까요?</h2>
          </div>
          <UIcon
            name="i-lucide-crosshair"
            class="mt-1 size-6 shrink-0 text-primary"
          />
        </div>
        <UAlert
          v-if="status?.data.mode === 'demo'"
          class="mb-6"
          color="primary"
          variant="soft"
          title="샘플 데이터로 둘러보는 중"
          description="닉네임을 검색하면 합성 경기 기록을 보여드려요. 실제 플레이 기록이 아닙니다."
        />
        <PlayerSearchForm />
        <div class="my-6 flex items-center gap-4">
          <span class="h-px flex-1 bg-default" />
          <span class="text-xs text-muted">먼저 둘러보고 싶다면</span>
          <span class="h-px flex-1 bg-default" />
        </div>
        <UButton
          to="/reports/demo-normal-squad"
          color="neutral"
          variant="outline"
          size="xl"
          block
          trailing-icon="i-lucide-arrow-up-right"
        >
          샘플 리포트 보기
        </UButton>
      </UCard>
    </div>
    <div class="relative mt-16 grid gap-6 border-t border-default pt-8 sm:grid-cols-3 lg:mt-24">
      <div class="flex gap-4">
        <span class="eyebrow pt-1 text-primary">01</span>
        <div>
          <h3 class="font-semibold">우리 팀의 성적표</h3>
          <p class="mt-2 text-sm leading-6 text-muted">
            공식 경기 통계로 확인하는 킬, 피해량,
            <br />
            소생과 생존 시간.
          </p>
        </div>
      </div>
      <div class="flex gap-4">
        <span class="eyebrow pt-1 text-primary">02</span>
        <div>
          <h3 class="font-semibold">순서대로 보는 순간들</h3>
          <p class="mt-2 text-sm leading-6 text-muted">
            기절부터 소생까지. 팀과 관련된 사건을
            <br />
            시간순으로 확인하세요.
          </p>
        </div>
      </div>
      <div class="flex gap-4">
        <span class="eyebrow pt-1 text-primary">03</span>
        <div>
          <h3 class="font-semibold">링크 하나로 함께</h3>
          <p class="mt-2 text-sm leading-6 text-muted">
            같은 기록을 팀원과 바로 공유하세요.
            <br />
            로그인 없이 열어볼 수 있어요.
          </p>
        </div>
      </div>
    </div>
  </UContainer>
</template>
