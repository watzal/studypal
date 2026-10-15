import os
import sys

import pymupdf
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import book as book_mod  # noqa: E402
from book import Book  # noqa: E402
from keypoints import rule_keypoints  # noqa: E402
from make_sample import build  # noqa: E402
from store import Store  # noqa: E402


@pytest.fixture()
def long_pdf(tmp_path):
    """70 pages: the 3-page sample repeated."""
    one = tmp_path / "one.pdf"
    build(str(one))
    src, doc = pymupdf.open(str(one)), pymupdf.open()
    while len(doc) < 70:
        doc.insert_pdf(src, to_page=min(2, 69 - len(doc)))
    path = tmp_path / "long.pdf"
    doc.save(str(path))
    return str(path)


@pytest.fixture()
def calls(monkeypatch):
    """Stand-in for the model that records which pages it was asked about.
    Starts as 'model down' (rules); set seen.engine = 'llm' to bring it up."""

    class Calls(list):
        engine = "rules"

    seen = Calls()

    def fake(sentences):
        if sentences:
            seen.append(sentences[0].page)
        return rule_keypoints(sentences), seen.engine

    monkeypatch.setattr(book_mod, "keypoints", fake)
    monkeypatch.setattr(book_mod, "model_available", lambda: seen.engine == "llm")
    return seen


def test_first_chunk_only_on_open(long_pdf, tmp_path, calls):
    b = Book(long_pdf, Store(str(tmp_path / "db.sqlite")))
    b.drain()
    assert sorted(calls) == list(range(1, 31))
    assert b.page(1)["sentences"] and b.page(31) is None


def test_prefetch_next_chunk_at_page_25(long_pdf, tmp_path, calls):
    b = Book(long_pdf, Store(str(tmp_path / "db.sqlite")))
    b.visit(24)
    b.drain()
    assert max(calls) == 30  # not yet
    b.visit(25)
    b.drain()
    assert sorted(calls) == list(range(1, 61))


def test_jump_ahead_serves_that_page_first(long_pdf, tmp_path, calls):
    b = Book(long_pdf, Store(str(tmp_path / "db.sqlite")))
    b.visit(65)  # straight away, while chunk 1 is still running
    assert b.wait(65, timeout=30)["page"] == 65
    b.drain()
    assert sorted(calls) == list(range(1, 31)) + list(range(61, 71))
    # pages 61-64 come after 65-70: the student is at 65, not 61
    assert calls.index(65) < calls.index(61)


def test_cache_survives_reopen(long_pdf, tmp_path, calls):
    db = str(tmp_path / "db.sqlite")
    Book(long_pdf, Store(db)).drain()
    calls.clear()
    b = Book(long_pdf, Store(db))
    b.drain()
    assert calls == [] and b.status()["done"] == 30


def test_rule_pages_redone_when_model_comes_up(long_pdf, tmp_path, calls):
    b = Book(long_pdf, Store(str(tmp_path / "db.sqlite")))
    b.drain()                       # model down: pages 1-30 via rules
    assert b.page(3)["engine"] == "rules"
    calls.clear()
    calls.engine = "llm"            # model finished booting
    b.visit(3)
    b.drain()
    assert sorted(calls) == list(range(1, 31))
    assert b.page(3)["engine"] == "llm"
    calls.clear()
    b.visit(3)                      # nothing left to upgrade
    b.drain()
    assert calls == []
