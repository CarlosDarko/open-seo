-- Carlos Ortega fork: client reports ("Reporting"). Each report is a snapshot of
-- the Search Console analysis taken when it was generated, plus the consultant's
-- notes and the checklist ticks, served as an online page at /c/<token>.
CREATE TABLE IF NOT EXISTS `client_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`token` text NOT NULL,
	`title` text NOT NULL,
	`client_name` text,
	`shared` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text,
	`snapshot_json` text NOT NULL,
	`notes_json` text NOT NULL,
	`checks_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `client_reports_token_idx` ON `client_reports` (`token`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `client_reports_project_idx` ON `client_reports` (`project_id`,`created_at`);
