import { foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, boolean } from 'drizzle-orm/pg-core'

export const playerSnapshots = pgTable('player_snapshots', {
  id: uuid('id').primaryKey(), source: text('source').notNull(), platform: text('platform').notNull(),
  accountId: text('account_id').notNull(), requestedName: text('requested_name'), displayName: text('display_name').notNull(),
  matchIds: jsonb('match_ids').notNull(), fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'string' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
}, t => [index('player_lookup').on(t.source, t.platform, t.accountId), index('player_name_lookup').on(t.source, t.platform, t.requestedName)])

export const matchSnapshots = pgTable('match_snapshots', {
  source: text('source').notNull(), platform: text('platform').notNull(), matchId: text('match_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(), mapName: text('map_name').notNull(),
  rawGameMode: text('raw_game_mode'), rawMatchType: text('raw_match_type'), isCustom: boolean('is_custom'),
  queueType: text('queue_type').notNull(), teamMode: text('team_mode').notNull(), perspective: text('perspective').notNull(),
  classificationVersion: text('classification_version').notNull(), classification: text('classification').notNull(),
  participants: jsonb('participants').notNull(), rosters: jsonb('rosters').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'string' }).notNull(),
}, t => [primaryKey({ columns: [t.source, t.platform, t.matchId] })])

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey(), source: text('source').notNull(), platform: text('platform').notNull(),
  matchId: text('match_id').notNull(), rosterId: text('roster_id').notNull(), analysisVersion: text('analysis_version').notNull(),
  revision: integer('revision').notNull(), quality: text('quality').notNull(), summary: jsonb('summary').notNull(),
  members: jsonb('members').notNull(), events: jsonb('events').notNull(), warnings: jsonb('warnings').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true, mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
  lastRetryAt: timestamp('last_retry_at', { withTimezone: true, mode: 'string' }),
}, t => [
  uniqueIndex('report_analysis_key').on(t.source, t.platform, t.matchId, t.rosterId, t.analysisVersion),
  foreignKey({ columns: [t.source, t.platform, t.matchId], foreignColumns: [matchSnapshots.source, matchSnapshots.platform, matchSnapshots.matchId] }),
])
