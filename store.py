"""SQLite cache, so every page goes through the model once, ever."""
from __future__ import annotations

import json
import sqlite3
import threading

SCHEMA = """
CREATE TABLE IF NOT EXISTS books (
    id    TEXT PRIMARY KEY,           -- sha256 of the file, so a renamed copy is the same book
    path  TEXT NOT NULL,
    pages INTEGER NOT NULL,
    title TEXT
);
CREATE TABLE IF NOT EXISTS pages (
    book       TEXT NOT NULL,
    page       INTEGER NOT NULL,      -- 1-based
    sentences  TEXT NOT NULL,         -- JSON
    highlights TEXT NOT NULL,         -- JSON
    engine     TEXT NOT NULL,         -- 'llm' or 'rules'
    seconds    REAL NOT NULL,
    PRIMARY KEY (book, page)
);
"""


class Store:
    def __init__(self, path: str = "studypal.db"):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()  # one connection shared with the worker thread
        self.db.executescript(SCHEMA)
        cols = {r[1] for r in self.db.execute("PRAGMA table_info(books)")}
        if "title" not in cols:  # databases made before titles existed
            self.db.execute("ALTER TABLE books ADD COLUMN title TEXT")

    def add_book(self, book_id: str, path: str, pages: int, title: str | None = None) -> None:
        with self.lock, self.db:
            self.db.execute(
                "INSERT INTO books (id, path, pages, title) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET path = excluded.path, pages = excluded.pages, "
                "title = COALESCE(excluded.title, books.title)",
                (book_id, path, pages, title))

    def books(self) -> list[dict]:
        with self.lock:
            rows = self.db.execute(
                "SELECT b.id, b.path, b.pages, b.title, COUNT(p.page) FROM books b "
                "LEFT JOIN pages p ON p.book = b.id GROUP BY b.id ORDER BY b.rowid DESC").fetchall()
        return [{"id": r[0], "path": r[1], "pages": r[2], "title": r[3], "done": r[4]} for r in rows]

    def book(self, book_id: str) -> dict | None:
        return next((b for b in self.books() if b["id"] == book_id), None)

    def save_page(self, book_id: str, page: int, sentences: list[dict],
                  highlights: list[dict], engine: str, seconds: float) -> None:
        with self.lock, self.db:
            self.db.execute(
                "INSERT OR REPLACE INTO pages VALUES (?, ?, ?, ?, ?, ?)",
                (book_id, page, json.dumps(sentences, ensure_ascii=False),
                 json.dumps(highlights, ensure_ascii=False), engine, seconds))

    def get_page(self, book_id: str, page: int) -> dict | None:
        with self.lock:
            row = self.db.execute(
                "SELECT sentences, highlights, engine, seconds FROM pages WHERE book=? AND page=?",
                (book_id, page)).fetchone()
        if row is None:
            return None
        return {"page": page, "sentences": json.loads(row[0]), "highlights": json.loads(row[1]),
                "engine": row[2], "seconds": row[3]}

    def done_pages(self, book_id: str, engine: str | None = None) -> set[int]:
        sql, args = "SELECT page FROM pages WHERE book=?", [book_id]
        if engine:
            sql, args = sql + " AND engine=?", args + [engine]
        with self.lock:
            return {r[0] for r in self.db.execute(sql, args)}
