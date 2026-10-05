/** Production smoke only: real bundled SDK, intercepted outbound transport. Never imported by app. */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const run = process.env.SMOKE_RUN_ID
if (!run || !/^[a-z0-9-]+$/.test(run)) throw new Error('SMOKE_RUN_ID required')
const accountId = `account.smoke-${run}`
const name = `Smoke-${run}`
const modes = ['normal-duo', 'normal-squad', 'ranked-duo', 'ranked-squad']
const matchIds = modes.map((mode) => `smoke-${run}-${mode}`)
const player = {
  type: 'player',
  id: accountId,
  attributes: { name, shardId: 'steam' },
  relationships: { matches: { data: matchIds.map((id) => ({ type: 'match', id })) } },
}
function match(id: string) {
  const duo = id.endsWith('-duo')
  const participants = Array.from({ length: duo ? 2 : 4 }, (_, index) => ({
    type: 'participant',
    id: `participant-${index}`,
    attributes: {
      shardId: 'steam',
      actor: '',
      stats: {
        DBNOs: 1,
        assists: 0,
        boosts: 0,
        damageDealt: 125.25,
        deathType: 'byplayer',
        headshotKills: 0,
        heals: 0,
        killPlace: 1,
        killStreaks: 1,
        kills: 1,
        longestKill: 0,
        name: index === 0 ? name : `Synthetic-${index}`,
        playerId: index === 0 ? accountId : `account.synthetic-${index}`,
        revives: 0,
        rideDistance: 0,
        roadKills: 0,
        swimDistance: 0,
        teamKills: 0,
        timeSurvived: 1200,
        vehicleDestroys: 0,
        walkDistance: 0,
        weaponsAcquired: 1,
        winPlace: 1,
      },
    },
  }))
  return {
    data: {
      type: 'match',
      id,
      attributes: {
        gameMode: duo ? 'duo' : 'squad',
        matchType: id.includes('-ranked-') ? 'competitive' : 'official',
        isCustomMatch: false,
        createdAt: '2026-10-04T10:00:00.000Z',
        duration: 1200,
        shardId: 'steam',
        mapName: 'Baltic_Main',
      },
      relationships: {
        rosters: { data: [{ type: 'roster', id: 'smoke-roster' }] },
        assets: { data: [{ type: 'asset', id: 'smoke-asset' }] },
      },
    },
    included: [
      ...participants,
      {
        type: 'roster',
        id: 'smoke-roster',
        attributes: { stats: { rank: 1, teamId: 1 }, won: 'true', shardId: 'steam' },
        relationships: {
          team: { data: null },
          participants: { data: participants.map((p) => ({ type: 'participant', id: p.id })) },
        },
      },
      {
        type: 'asset',
        id: 'smoke-asset',
        attributes: {
          name: 'telemetry',
          description: '',
          createdAt: '2026-10-04T10:00:00.000Z',
          URL: 'https://telemetry-cdn.pubg.com/smoke.json',
        },
      },
    ],
  }
}
// The production Nitro bundle externalizes Axios. Patch that exact copy, not the development copy.
const { default: axios } = await import(
  pathToFileURL(resolve('.output/server/node_modules/axios/index.js')).href
)
axios.defaults.adapter = async (config: { url: string; headers: Record<string, string> }) => {
  if (!config.url.startsWith('/shards/steam/')) throw new Error('Unexpected upstream path')
  if (config.url.includes('/players'))
    return {
      data: { data: config.url.includes('?') ? [player] : player },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  const id = config.url.split('/').at(-1) ?? ''
  if (!matchIds.includes(id)) throw new Error('Unexpected match')
  return { data: match(id), status: 200, statusText: 'OK', headers: {}, config }
}
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.hostname !== 'telemetry-cdn.pubg.com') return originalFetch(input, init)
  if (new Headers(init?.headers).has('authorization'))
    throw new Error('Authorization leaked to telemetry')
  return Response.json([
    { _T: 'LogMatchStart', _D: '2026-10-04T10:00:00.000Z' },
    {
      _T: 'LogPlayerMakeGroggy',
      _D: '2026-10-04T10:03:00.000Z',
      attacker: { accountId, name, teamId: 1 },
      victim: { accountId: 'account.opponent', name: 'Opponent', teamId: 2 },
      damageCauserName: 'WeapM416_C',
      damageTypeCategory: 'Damage_Gun',
    },
  ])
}
