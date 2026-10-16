-- Carlos Ortega fork: what the AI has cost for each client report, in euros.
ALTER TABLE `client_reports` ADD `ai_cost_eur` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `client_reports` ADD `ai_calls` integer DEFAULT 0 NOT NULL;
