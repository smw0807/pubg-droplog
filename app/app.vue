<script setup lang="ts">
const ready = ref(false)
onMounted(() => { ready.value = true })
</script>

<template>
  <UApp>
    <AppHeader />
    <main id="main-content" :data-app-ready="ready">
      <NuxtPage />
    </main>
    <footer class="app-footer">
      <UContainer class="flex flex-wrap items-center justify-between gap-3 py-7">
        <span class="font-semibold tracking-tight">PUBG DropLog <span class="font-normal text-muted">· 한 판의 기록, 우리 팀의 이야기</span></span>
        <span class="text-xs text-muted">PUBG와 제휴하지 않은 독립 서비스입니다.</span>
      </UContainer>
    </footer>
  </UApp>
</template>
