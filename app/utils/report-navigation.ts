import type { LocationQuery } from 'vue-router'
import type { MatchFilters, Report } from '~~/shared/types'

type ReportNavigationContext = {
  playerId?: string
  queueType?: MatchFilters['queueType']
  teamMode?: MatchFilters['teamMode']
}

export function getReportNavigationContext(query: LocationQuery): ReportNavigationContext {
  const context: ReportNavigationContext = {}
  if (typeof query.playerId === 'string' && /^[a-zA-Z0-9._-]{1,128}$/.test(query.playerId))
    context.playerId = query.playerId
  if (query.queueType === 'all' || query.queueType === 'normal' || query.queueType === 'ranked')
    context.queueType = query.queueType
  if (query.teamMode === 'all' || query.teamMode === 'duo' || query.teamMode === 'squad')
    context.teamMode = query.teamMode
  return context
}

export function getReportMatchHistory(
  report: Pick<Report, 'platform' | 'members'> | null,
  context: ReportNavigationContext,
) {
  if (!report) return null
  // Reports are shared by a roster; the current viewer's player is URL context,
  // not an owner persisted on the report. Older shared links use the first member.
  const member =
    report.members.find((member) => member.accountId === context.playerId) ?? report.members[0]
  if (!member) return null
  return {
    playerName: member.name,
    to: {
      path: `/players/${report.platform}/${encodeURIComponent(member.accountId)}`,
      query: { queueType: context.queueType, teamMode: context.teamMode },
    },
  }
}
