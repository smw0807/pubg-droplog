<template>
  <a
    href="#main-content"
    class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-default focus:p-3"
  >
    본문으로 건너뛰기
  </a>
  <header class="app-header">
    <UContainer class="flex h-18 items-center justify-between gap-4">
      <NuxtLink
        to="/"
        class="flex min-h-11 items-center gap-3"
        aria-label="PUBG DropLog 홈"
      >
        <img
          src="/brand/droplog-mark.png"
          alt=""
          width="36"
          height="36"
          class="size-9 shrink-0 rounded-lg"
        />
        <span class="text-sm font-extrabold tracking-[.08em]">PUBG DropLog</span>
      </NuxtLink>
      <div class="flex items-center gap-3">
        <span class="hidden text-xs text-muted sm:inline">AFTER THE DROP.</span>
        <UColorModeButton
          class="size-11"
          aria-label="다크·라이트 테마 변경"
        />
      </div>
    </UContainer>
  </header>
</template>
