-- Radar alert rules say who to tell besides the alerts list: e-mail
-- recipients and webhook URLs, stored as JSON.
ALTER TABLE `radar_alert_rules` ADD COLUMN `notify_json` text;
