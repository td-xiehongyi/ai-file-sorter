CREATE TABLE IF NOT EXISTS ai_template_settings (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    global_template_id TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (global_template_id)
        REFERENCES ai_category_templates(template_id)
        ON DELETE RESTRICT
);

INSERT OR IGNORE INTO ai_template_settings(singleton_id, global_template_id, updated_at)
VALUES (1, NULL, '0');

ALTER TABLE ai_analysis_results
ADD COLUMN category_snapshot_json TEXT NOT NULL DEFAULT '[]';
