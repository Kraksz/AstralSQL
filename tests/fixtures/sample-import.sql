-- A small SQLite import example. Review the destination before running.
BEGIN;
CREATE TABLE IF NOT EXISTS astral_import_example (
  id INTEGER PRIMARY KEY,
  note TEXT NOT NULL
);
INSERT OR REPLACE INTO astral_import_example VALUES
  (1, 'A semicolon; inside text'),
  (2, 'Hello, sky blue');
COMMIT;
