import { z } from 'zod'
import type { DataSource, Platform } from '../../shared/types'
import { sourceSchema, platformSchema } from '../../shared/schemas/report'
import type { MatchSnapshot } from '../domain/match'
import type { StoredReport } from '../domain/report'

export const playerSnapshotSchema = z.object({
  id: z.string().uuid(), source: sourceSchema, platform: platformSchema, accountId: z.string(),
  requestedName: z.string().nullable(), displayName: z.string(), matchIds: z.array(z.string()),
  fetchedAt: z.string(), expiresAt: z.string(),
})
export type PlayerSnapshot = z.infer<typeof playerSnapshotSchema>
export interface ReportKey { source: DataSource; platform: Platform; matchId: string; rosterId: string; analysisVersion: string }
export interface Repository {
  findPlayer(source: DataSource, platform: Platform, lookup: { accountId?: string; name?: string }, now: string): Promise<PlayerSnapshot | null>
  getPlayerSnapshot(id: string): Promise<PlayerSnapshot | null>
  savePlayer(snapshot: PlayerSnapshot): Promise<void>
  getMatch(source: DataSource, platform: Platform, matchId: string): Promise<MatchSnapshot | null>
  getMatches(source: DataSource, platform: Platform, matchIds: string[]): Promise<MatchSnapshot[]>
  saveMatch(match: MatchSnapshot): Promise<void>
  findReport(key: ReportKey): Promise<StoredReport | null>
  getReport(id: string): Promise<StoredReport | null>
  saveReport(report: StoredReport): Promise<StoredReport>
  claimRetry(id: string, now: string): Promise<boolean>
  improveReport(report: StoredReport, expectedRevision: number): Promise<StoredReport>
}
