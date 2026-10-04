CREATE TABLE "match_snapshots" (
	"source" text NOT NULL,
	"platform" text NOT NULL,
	"match_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"map_name" text NOT NULL,
	"raw_game_mode" text,
	"raw_match_type" text,
	"is_custom" boolean,
	"queue_type" text NOT NULL,
	"team_mode" text NOT NULL,
	"perspective" text NOT NULL,
	"classification_version" text NOT NULL,
	"classification" text NOT NULL,
	"participants" jsonb NOT NULL,
	"rosters" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "match_snapshots_source_platform_match_id_pk" PRIMARY KEY("source","platform","match_id")
);
--> statement-breakpoint
CREATE TABLE "player_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"platform" text NOT NULL,
	"account_id" text NOT NULL,
	"requested_name" text,
	"display_name" text NOT NULL,
	"match_ids" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"platform" text NOT NULL,
	"match_id" text NOT NULL,
	"roster_id" text NOT NULL,
	"analysis_version" text NOT NULL,
	"revision" integer NOT NULL,
	"quality" text NOT NULL,
	"summary" jsonb NOT NULL,
	"members" jsonb NOT NULL,
	"events" jsonb NOT NULL,
	"warnings" jsonb NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"last_retry_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_source_platform_match_id_match_snapshots_source_platform_match_id_fk" FOREIGN KEY ("source","platform","match_id") REFERENCES "public"."match_snapshots"("source","platform","match_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_lookup" ON "player_snapshots" USING btree ("source","platform","account_id");--> statement-breakpoint
CREATE INDEX "player_name_lookup" ON "player_snapshots" USING btree ("source","platform","requested_name");--> statement-breakpoint
CREATE UNIQUE INDEX "report_analysis_key" ON "reports" USING btree ("source","platform","match_id","roster_id","analysis_version");