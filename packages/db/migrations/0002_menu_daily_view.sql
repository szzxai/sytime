-- Switch the previous automatically assigned weekly default to the new daily view.
-- Preserve explicit catalogue/review preferences and all menu/review records.
UPDATE users SET recipe_default_view='daily' WHERE recipe_default_view='weekly';
