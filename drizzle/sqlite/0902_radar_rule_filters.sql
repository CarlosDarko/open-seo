-- Radar alert rules can be narrowed with extra conditions (impressions, CTR,
-- clicks or position of the current or previous period). Stored as JSON.
ALTER TABLE `radar_alert_rules` ADD COLUMN `filters_json` text;
