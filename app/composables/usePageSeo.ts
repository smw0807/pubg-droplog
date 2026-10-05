import type { MaybeRefOrGetter } from 'vue'
import { getPageSeoUrls, type ShareImage } from '~/utils/page-seo'

export function usePageSeo(options: {
  title: MaybeRefOrGetter<string>
  description: MaybeRefOrGetter<string>
  image: ShareImage
  imageAlt: string
  robots?: string
}) {
  const route = useRoute()
  const config = useRuntimeConfig()
  const requestOrigin = useRequestURL().origin
  const urls = computed(() =>
    getPageSeoUrls(config.public.siteUrl, requestOrigin, route.path, options.image),
  )

  useSeoMeta({
    title: () => toValue(options.title),
    description: () => toValue(options.description),
    robots: options.robots,
    ogType: 'website',
    ogSiteName: 'PUBG DropLog',
    ogLocale: 'ko_KR',
    ogTitle: () => toValue(options.title),
    ogDescription: () => toValue(options.description),
    ogUrl: () => urls.value.pageUrl,
    ogImage: () => urls.value.imageUrl,
    ogImageType: 'image/png',
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogImageAlt: options.imageAlt,
    twitterCard: 'summary_large_image',
    twitterTitle: () => toValue(options.title),
    twitterDescription: () => toValue(options.description),
    twitterImage: () => urls.value.imageUrl,
    twitterImageAlt: options.imageAlt,
  })
  useHead(() => ({ link: [{ rel: 'canonical', href: urls.value.pageUrl }] }))
}
