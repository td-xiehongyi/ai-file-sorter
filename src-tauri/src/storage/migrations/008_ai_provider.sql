CREATE TABLE IF NOT EXISTS ai_provider_settings (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    provider_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('ollama', 'open_ai_compatible')),
    display_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    updated_at TEXT NOT NULL
);
