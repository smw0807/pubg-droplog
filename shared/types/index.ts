import type { z } from 'zod'
import type * as schemas from '../schemas/report'

export type Platform = z.infer<typeof schemas.platformSchema>
export type DataSource = z.infer<typeof schemas.sourceSchema>
export type QueueType = z.infer<typeof schemas.queueTypeSchema>
export type TeamMode = z.infer<typeof schemas.teamModeSchema>
export type Quality = z.infer<typeof schemas.qualitySchema>
export type EventKind = z.infer<typeof schemas.eventKindSchema>
export type MatchFilters = z.infer<typeof schemas.matchFiltersSchema>
export type Report = z.infer<typeof schemas.reportSchema>
export type ReportMember = z.infer<typeof schemas.reportMemberSchema>
export type ReportEvent = z.infer<typeof schemas.reportEventSchema>
export type MapLocation = z.infer<typeof schemas.mapLocationSchema>
export type EventRole = z.infer<typeof schemas.eventRoleSchema>
export type ReportSummary = z.infer<typeof schemas.reportSummarySchema>
export type ReportWarning = z.infer<typeof schemas.warningSchema>
export type Player = z.infer<typeof schemas.playerSchema>
export type MatchListItem = z.infer<typeof schemas.matchListItemSchema>
export type MatchesData = z.infer<typeof schemas.matchesDataSchema>
export type MatchesMeta = z.infer<typeof schemas.matchesMetaSchema>
export type EventsData = z.infer<typeof schemas.eventsDataSchema>
export type CreateReportData = z.infer<typeof schemas.createReportDataSchema>
export interface ApiMeta {
  source: DataSource
  fetchedAt?: string
  quality?: Quality
  revision?: number
}
export interface ApiResponse<T, M = ApiMeta> {
  data: T
  meta: M
}
export interface ApiFailure {
  error: { code: string; message: string; retryable: boolean; retryAfterSeconds?: number }
  requestId: string
}
