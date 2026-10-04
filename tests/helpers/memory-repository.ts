import type { DataSource, Platform } from '../../shared/types'
import type { MatchSnapshot } from '../../server/domain/match'
import type { StoredReport } from '../../server/domain/report'
import type { PlayerSnapshot, ReportKey, Repository } from '../../server/repositories/repository'

/** Deterministic persistence fake for service behavior; PostgreSQL is tested separately. */
export class MemoryRepository implements Repository {
  readonly players = new Map<string, PlayerSnapshot>()
  readonly matches = new Map<string, MatchSnapshot>()
  readonly reports = new Map<string, StoredReport>()
  saveReportCount = 0
  private matchKey(source: DataSource, platform: Platform, id: string) { return `${source}:${platform}:${id}` }
  private reportKey(report: ReportKey) { return JSON.stringify([report.source, report.platform, report.matchId, report.rosterId, report.analysisVersion]) }
  async findPlayer(source: DataSource, platform: Platform, lookup: { accountId?: string; name?: string }, now: string) {
    return structuredClone([...this.players.values()].find(player => player.source === source && player.platform === platform && player.expiresAt > now && (lookup.accountId ? player.accountId === lookup.accountId : player.requestedName === lookup.name || player.displayName === lookup.name)) ?? null)
  }
  async getPlayerSnapshot(id: string) { return structuredClone(this.players.get(id) ?? null) }
  async savePlayer(snapshot: PlayerSnapshot) { this.players.set(snapshot.id, structuredClone(snapshot)) }
  async getMatch(source: DataSource, platform: Platform, id: string) { return structuredClone(this.matches.get(this.matchKey(source, platform, id)) ?? null) }
  async getMatches(source: DataSource, platform: Platform, ids: string[]) {
    return structuredClone(ids.flatMap(id => {
      const match = this.matches.get(this.matchKey(source, platform, id))
      return match ? [match] : []
    }))
  }
  async saveMatch(match: MatchSnapshot) { this.matches.set(this.matchKey(match.source, match.platform, match.matchId), structuredClone(match)) }
  async findReport(key: ReportKey) { return structuredClone([...this.reports.values()].find(report => this.reportKey(report) === this.reportKey(key)) ?? null) }
  async getReport(id: string) { return structuredClone(this.reports.get(id) ?? null) }
  async saveReport(report: StoredReport) {
    const existing = await this.findReport(report)
    if (existing) return existing
    this.saveReportCount++
    this.reports.set(report.id, structuredClone(report))
    return structuredClone(report)
  }
  async claimRetry(id: string, now: string) {
    const report = this.reports.get(id)
    if (!report || report.quality !== 'partial' || (report.lastRetryAt && Date.parse(report.lastRetryAt) > Date.parse(now) - 60000)) return false
    report.lastRetryAt = now
    return true
  }
  async improveReport(report: StoredReport, expectedRevision: number) {
    const old = this.reports.get(report.id)
    if (!old) throw new Error('missing report')
    if (old.revision !== expectedRevision) return structuredClone(old)
    this.reports.set(report.id, structuredClone(report))
    return structuredClone(report)
  }
}
