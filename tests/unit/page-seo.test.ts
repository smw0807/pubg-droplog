import { describe, expect, it } from 'vitest'
import { getPageSeoUrls } from '../../app/utils/page-seo'

describe('social preview URLs', () => {
  it('uses the configured public origin and removes transient page context', () => {
    expect(
      getPageSeoUrls(
        'https://droplog.example/',
        'http://localhost:3000',
        '/reports/demo-normal-squad?playerId=account.demo-1#timeline',
        'report',
      ),
    ).toEqual({
      pageUrl: 'https://droplog.example/reports/demo-normal-squad',
      imageUrl: 'https://droplog.example/og/report.png',
    })
  })

  it.each(['home', 'player', 'report'] as const)(
    'uses the request origin for %s locally',
    (image) => {
      expect(getPageSeoUrls('', 'http://localhost:3000', '/', image)).toEqual({
        pageUrl: 'http://localhost:3000/',
        imageUrl: `http://localhost:3000/og/${image}.png`,
      })
    },
  )

  it.each(['invalid', 'javascript:alert(1)', 'https://user:secret@droplog.example'])(
    'falls back without exposing an invalid or credential-bearing URL: %s',
    (configured) => {
      expect(
        getPageSeoUrls(
          configured,
          'https://droplog.example',
          '/players/steam/account.demo-1',
          'player',
        ),
      ).toEqual({
        pageUrl: 'https://droplog.example/players/steam/account.demo-1',
        imageUrl: 'https://droplog.example/og/player.png',
      })
    },
  )

  it('keeps a protocol-relative route path on the configured origin', () => {
    const { pageUrl } = getPageSeoUrls(
      'https://droplog.example',
      'http://localhost:3000',
      '//other.example/path',
      'home',
    )
    expect(new URL(pageUrl).origin).toBe('https://droplog.example')
  })
})
