-- Pre-launch menu rebuild explicitly approved by the maintainer. Unrelated data stays intact.
DELETE FROM recipes;
--> statement-breakpoint
DELETE FROM weekly_menu_images;
--> statement-breakpoint
DELETE FROM menu_import_audit;
--> statement-breakpoint
DELETE FROM menu_records;
--> statement-breakpoint
DELETE FROM menu_job_items;
--> statement-breakpoint
DELETE FROM menu_sync_lease;
--> statement-breakpoint
DELETE FROM menu_sync_jobs;
--> statement-breakpoint
DELETE FROM menu_sources;
--> statement-breakpoint
DELETE FROM dishes;
--> statement-breakpoint
DELETE FROM menu_sync_state;
--> statement-breakpoint
DELETE FROM settings WHERE key = 'menu_ai_config';

--> statement-breakpoint
UPDATE users SET recipe_default_view='weekly';
