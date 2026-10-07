-- Carlos Ortega fork: Radar SEO follow-up. Actions the user marked as done
-- (with the numbers measured before the change, to judge the impact later),
-- alert rules and the alerts they raised. Numbered 0901 so it sorts after the
-- upstream migrations and after 0900_cost_ledger.
CREATE TABLE IF NOT EXISTS `radar_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`action_key` text NOT NULL,
	`kind` text NOT NULL,
	`title` text,
	`page` text,
	`query` text,
	`done_at` text NOT NULL,
	`done_by` text,
	`note` text,
	`baseline_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `radar_actions_key_idx` ON `radar_actions` (`project_id`,`action_key`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radar_alert_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`scope` text NOT NULL,
	`target` text,
	`metric` text NOT NULL,
	`condition` text NOT NULL,
	`threshold` real NOT NULL,
	`window_days` integer DEFAULT 7 NOT NULL,
	`min_value` real DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radar_alert_rules_project_idx` ON `radar_alert_rules` (`project_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radar_alert_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`rule_name` text NOT NULL,
	`day` text NOT NULL,
	`created_at` text NOT NULL,
	`summary` text NOT NULL,
	`details_json` text NOT NULL,
	`seen` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `radar_alert_events_rule_day_idx` ON `radar_alert_events` (`rule_id`,`day`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radar_alert_events_project_idx` ON `radar_alert_events` (`project_id`,`created_at`);
