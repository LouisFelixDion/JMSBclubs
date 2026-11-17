"""Create db/events.db from db/schema.sql. Run: py db/init_db.py"""
import sqlite3
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB_PATH = HERE / "events.db"
SCHEMA_PATH = HERE / "schema.sql"


def main():
    schema = SCHEMA_PATH.read_text(encoding="utf-8")
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(schema)
        tables = [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )]
    print(f"Initialized {DB_PATH}")
    print("Tables:", ", ".join(tables))


if __name__ == "__main__":
    main()
