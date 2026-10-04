export function useRetryGate() {
  const until = ref(0)
  const seconds = ref(0)
  let timer: ReturnType<typeof setInterval> | undefined
  function block(duration = 0) {
    until.value = Date.now() + duration * 1000
    seconds.value = Math.max(0, Math.ceil((until.value - Date.now()) / 1000))
    if (timer) clearInterval(timer)
    if (seconds.value > 0 && import.meta.client) {
      timer = setInterval(() => {
        seconds.value = Math.max(0, Math.ceil((until.value - Date.now()) / 1000))
        if (!seconds.value && timer) clearInterval(timer)
      }, 250)
    }
  }
  onBeforeUnmount(() => { if (timer) clearInterval(timer) })
  return { seconds, block }
}
