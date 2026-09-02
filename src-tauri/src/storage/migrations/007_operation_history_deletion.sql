ALTER TABLE operation_history ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_operation_history_deleted_at
  ON operation_history(deleted_at, created_at DESC, id DESC);
