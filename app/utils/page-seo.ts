export type ShareImage = 'home' | 'player' | 'report'

export function getPageSeoUrls(
  siteUrl: string,
  requestOrigin: string,
  path: string,
  image: ShareImage,
) {
  let origin = requestOrigin
  if (siteUrl.trim()) {
    try {
      const configured = new URL(siteUrl.trim())
      if (
        ['http:', 'https:'].includes(configured.protocol) &&
        !configured.username &&
        !configured.password
      )
        origin = configured.origin
    } catch {
      // A missing or invalid deployment URL falls back to the current request.
    }
  }
  const pageUrl = new URL(origin)
  // Filters and navigation context do not identify a separate shareable page.
  pageUrl.pathname = path.split(/[?#]/, 1)[0] || '/'
  pageUrl.search = ''
  pageUrl.hash = ''
  return {
    pageUrl: pageUrl.href,
    imageUrl: new URL(`/og/${image}.png`, origin).href,
  }
}
