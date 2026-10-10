export default defineNuxtConfig({
  compatibilityDate: '2026-10-04',
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  typescript: { strict: true },
  colorMode: { preference: 'dark', fallback: 'dark' },
  ui: { fonts: false },
  icon: { serverBundle: { collections: ['lucide'] } },
  runtimeConfig: {
    pubgApiKey: '',
    dbEnabled: false,
    databaseUrl: '',
    dataMode: 'demo',
    public: { siteUrl: '' },
  },
  nitro: {
    preset: 'node-server',
    // Nitro 2 defaults Vercel functions to Node 22; match package.json's Node 24 requirement.
    vercel: { functions: { runtime: 'nodejs24.x' } },
    // pubg-kit uses Zod 3 while app DTOs use Zod 4. Externalizing both as
    // `zod` flattens the majors in Nitro's output; inline each resolved copy.
    externals: { inline: ['zod'] },
  },
  routeRules: {
    '/reports/**': { headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
    '/api/**': { headers: { 'Cache-Control': 'no-store' } },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'ko' },
      title: 'PUBG DropLog · 우리 팀의 한 판을 보다',
      link: [
        { rel: 'icon', type: 'image/x-icon', sizes: '16x16 32x32 48x48', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
    },
  },
})
