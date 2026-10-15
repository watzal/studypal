"""Process a book a chunk at a time, ahead of where the student is reading.

A 600-page book through a local model takes most of an hour, so nothing is
processed up front beyond the first chunk. The reader calls ``visit(page)``
on every page turn:

- the chunk holding that page is processed first (the student is waiting);
- once the student is PREFETCH_AT pages into a chunk, the next chunk starts;
- the most recent visit always wins, so jumping from page 3 to page 400
  serves page 400 next and finishes the earlier chunk afterwards.

Pages are saved one at a time, so highlights appear while a chunk is still
running, and are cached in SQLite, so reopening a book is instant.

Usage:
    python book.py book.pdf --goto 26
"""
from __future__ import annotations

import hashlib
import itertools
import logging
import queue
import threading
import time
from dataclasses import asdict
from pathlib import Path

import pymupdf

from extract import extract_page, guess_title, is_scanned, running_lines
from keypoints import keypoints, model_available
from store import Store

CHUNK = 30
PREFETCH_AT = 25  # page within a chunk (1-based) that starts the next chunk

log = logging.getLogger(__name__)
# MuPDF isn't thread-safe, even across documents: one book's worker at a time.
_MUPDF = threading.Lock()


def book_id(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


class Book:
    def __init__(self, pdf_path: str, store: Store):
        if is_scanned(pdf_path):
            raise ValueError("This PDF has no text layer (scanned). OCR support comes next.")
        self.path, self.store = pdf_path, store
        self.id = book_id(pdf_path)
        with _MUPDF:
            doc = pymupdf.open(pdf_path)
            self.n_pages = len(doc)
            self.title = guess_title(doc) or Path(pdf_path).stem.replace("_", " ")
            doc.close()
        store.add_book(self.id, pdf_path, self.n_pages, self.title)

        self._done = store.done_pages(self.id)
        # Pages highlighted by the rule fallback because the model was down (on
        # Render it boots minutes after the app). Redone once it's reachable.
        self._rules = store.done_pages(self.id, engine="rules")
        self._errors: dict[int, str] = {}
        self._running: dict[int, set[str]] = {}       # chunk -> running header/footer lines
        self._queue: queue.PriorityQueue = queue.PriorityQueue()
        self._visits = itertools.count()
        self._changed = threading.Condition()
        threading.Thread(target=self._work, daemon=True, name=f"book-{self.id[:8]}").start()
        self.visit(1)

    # ------------------------------------------------------------ reader API

    def visit(self, page: int) -> None:
        """The student is on `page`: make sure it, and soon the next chunk, get processed."""
        if not 1 <= page <= self.n_pages:
            raise ValueError(f"page {page} is outside 1..{self.n_pages}")
        visit = -next(self._visits)  # newest visit sorts first
        chunk = (page - 1) // CHUNK
        self._enqueue(chunk, (visit, 0), start=page)
        if (page - 1) % CHUNK + 1 >= PREFETCH_AT:
            self._enqueue(chunk + 1, (visit, 1))

    def page(self, page: int) -> dict | None:
        """Sentences and highlights for a page, or None while it's still queued."""
        if page in self._errors:
            return {"page": page, "error": self._errors[page]}
        return self.store.get_page(self.id, page)

    def status(self) -> dict:
        return {"pages": self.n_pages, "done": len(self._done), "errors": len(self._errors)}

    def done_pages(self) -> list[int]:
        return sorted(self._done)

    def wait(self, page: int, timeout: float | None = None) -> dict | None:
        """Block until `page` is ready (for the CLI and tests; the reader polls `page`)."""
        with self._changed:
            self._changed.wait_for(lambda: page in self._done or page in self._errors, timeout)
        return self.page(page)

    def drain(self) -> None:
        """Block until everything queued so far is processed."""
        self._queue.join()

    # ------------------------------------------------------------ worker

    def _enqueue(self, chunk: int, key: tuple[int, int], start: int = 1) -> None:
        first, last = chunk * CHUNK + 1, min((chunk + 1) * CHUNK, self.n_pages)
        # from the page being read to the chunk's end, then the pages before it
        order = [*range(max(start, first), last + 1), *range(first, min(start, last + 1))]
        for i, n in enumerate(order):
            if self._wanted(n):
                self._queue.put((*key, i, n))

    def _wanted(self, page: int) -> bool:
        if page in self._errors:
            return False
        return page not in self._done or (page in self._rules and model_available())

    def _work(self) -> None:
        doc = None
        while True:
            *_, page = self._queue.get()
            try:
                if self._wanted(page):
                    doc = doc or pymupdf.open(self.path)
                    self._process(doc, page)
            except Exception as e:  # one bad page must not stop the book
                log.exception("page %d of %s failed", page, self.path)
                self._errors[page] = str(e)
            finally:
                with self._changed:
                    self._changed.notify_all()
                self._queue.task_done()

    def _process(self, doc: pymupdf.Document, page: int) -> None:
        chunk = (page - 1) // CHUNK
        t0 = time.perf_counter()
        with _MUPDF:
            if chunk not in self._running:
                first, last = chunk * CHUNK, min((chunk + 1) * CHUNK, self.n_pages)
                self._running[chunk] = running_lines(doc, range(first, last))
            sentences = extract_page(doc[page - 1], page, running=self._running[chunk])
        highlights, engine = keypoints(sentences)  # the slow part, outside the lock
        self.store.save_page(self.id, page, [asdict(s) for s in sentences], highlights,
                             engine, round(time.perf_counter() - t0, 3))
        (self._rules.add if engine == "rules" else self._rules.discard)(page)
        self._done.add(page)


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Process a book chunk by chunk, as a reader would.")
    ap.add_argument("pdf")
    ap.add_argument("--goto", type=int, default=1, help="page the student opens")
    ap.add_argument("--db", default="studypal.db")
    a = ap.parse_args()

    t0 = time.perf_counter()
    book = Book(a.pdf, Store(a.db))
    book.visit(a.goto)
    p = book.wait(a.goto)
    print(f"page {a.goto} ready in {time.perf_counter() - t0:.1f}s: "
          f"{len(p['sentences'])} sentences, {len(p['highlights'])} highlights via {p['engine']}")
    book.drain()
    print(f"queued work done in {time.perf_counter() - t0:.1f}s: {book.status()}")
