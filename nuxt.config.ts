export default defineNuxtConfig({
  compatibilityDate: '2026-10-04',
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  typescript: { strict: true },
  colorMode: { preference: 'dark', fallback: 'dark' },
  ui: { fonts: false },
  icon: { serverBundle: { collections: ['lucide'] } },
  runtimeConfig: { pubgApiKey: '', databaseUrl: '', dataMode: 'demo' },
  nitro: {
    preset: 'node-server',
    // pubg-kit uses Zod 3 while app DTOs use Zod 4. Externalizing both as
    // `zod` flattens the majors in Nitro's output; inline each resolved copy.
    externals: { inline: ['zod'] },
  },
  routeRules: {
    '/reports/**': { headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
    '/api/**': { headers: { 'Cache-Control': 'no-store' } },
  },
  app: { head: { htmlAttrs: { lang: 'ko' }, title: 'DropLog · 우리 팀의 한 판' } },
})
