"""Web API and the reader UI, in one process.

    uvicorn server:app --port 8000      then open http://127.0.0.1:8000

Books and the SQLite cache live in STUDYPAL_DATA (default ./data).
"""
from __future__ import annotations

import os
import re
import shutil
import threading
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from book import Book, book_id
from store import Store

DATA = Path(os.environ.get("STUDYPAL_DATA", "data"))
BOOKS = DATA / "books"
BOOKS.mkdir(parents=True, exist_ok=True)
STATIC = Path(__file__).parent / "static"

store = Store(str(DATA / "studypal.db"))
app = FastAPI(title="StudyPal")

_open: dict[str, Book] = {}   # books with a running worker
_open_lock = threading.Lock()


def _book(bid: str) -> Book:
    with _open_lock:
        if bid not in _open:
            row = store.book(bid)
            if row is None or not Path(row["path"]).exists():
                raise HTTPException(404, "No such book")
            _open[bid] = Book(row["path"], store)
        return _open[bid]


@app.get("/api/books")
def list_books():
    return [{"id": b["id"], "title": b["title"] or Path(b["path"]).stem, "pages": b["pages"],
             "done": b["done"]} for b in store.books()]


@app.post("/api/books")
def upload(file: UploadFile):
    name = Path(file.filename or "book.pdf").name
    if not name.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files for now.")
    tmp = BOOKS / f".upload-{uuid.uuid4().hex}.pdf"
    with tmp.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    bid = book_id(str(tmp))
    folder = BOOKS / bid[:16]
    dest = next(folder.glob("*.pdf"), None) if folder.exists() else None
    if dest:                          # same book uploaded again: keep the first copy
        tmp.unlink()
    else:
        folder.mkdir(parents=True, exist_ok=True)
        dest = folder / re.sub(r"[^\w.\- ]", "_", name)
        tmp.replace(dest)
    try:
        with _open_lock:
            if bid not in _open:
                _open[bid] = Book(str(dest), store)
    except Exception as e:
        shutil.rmtree(folder, ignore_errors=True)
        msg = str(e) if isinstance(e, ValueError) else "This file couldn't be read as a PDF."
        raise HTTPException(422, msg)
    return get_book(bid)


@app.get("/api/books/{bid}")
def get_book(bid: str):
    b = _book(bid)
    return {"id": bid, "title": b.title, **b.status(), "done_pages": b.done_pages()}


@app.get("/api/books/{bid}/file")
def book_file(bid: str):
    return FileResponse(_book(bid).path, media_type="application/pdf")


@app.post("/api/books/{bid}/visit/{page}")
def visit(bid: str, page: int):
    b = _book(bid)
    try:
        b.visit(page)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return b.status()


@app.get("/api/books/{bid}/pages/{page}")
def page(bid: str, page: int):
    data = _book(bid).page(page)
    if data is None:  # queued: the reader polls until it's ready
        return JSONResponse({"page": page, "status": "processing"}, status_code=202)
    return data


app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")
