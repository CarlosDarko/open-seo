-- Carlos Ortega fork: ledger of every DataForSEO charge, kept in euros.
-- Numbered 0900 so it always sorts after upstream migrations and never
-- collides with the numbers drizzle-kit hands out.
CREATE TABLE IF NOT EXISTS `cost_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`day` text NOT NULL,
	`organization_id` text NOT NULL,
	`user_email` text,
	`project_id` text,
	`feature` text NOT NULL,
	`endpoint` text NOT NULL,
	`cost_usd` real NOT NULL,
	`usd_eur_rate` real NOT NULL,
	`cost_eur` real NOT NULL,
	`outcome` text DEFAULT 'ok' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cost_ledger_org_day_idx` ON `cost_ledger` (`organization_id`,`day`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cost_ledger_project_idx` ON `cost_ledger` (`project_id`);
