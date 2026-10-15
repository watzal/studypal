"""Extract numbered sentences with their on-page positions from a PDF.

Each sentence gets a stable id like ``p12_s07`` (page 12, sentence 7) and the
list of rectangles it covers, so highlights can be drawn on the real page.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field

import pymupdf

# Split after . ? ! (optionally followed by a closing quote/bracket) when the
# next word starts with a capital letter, digit or quote. Avoids splitting on
# "e.g." / "Fig. 2" / decimals in the common cases.
_ABBREV = {"e.g", "i.e", "fig", "eq", "no", "vs", "etc", "dr", "mr", "mrs", "st", "approx", "viz"}
_END = re.compile(r"[.?!][\"')\]]?$")


@dataclass
class Sentence:
    id: str
    page: int                     # 1-based
    text: str
    rects: list[tuple[float, float, float, float]] = field(default_factory=list)


def _is_boundary(word: str, next_word: str | None) -> bool:
    if not _END.search(word):
        return False
    stem = word.rstrip(".?!\"')]").lower()
    if stem in _ABBREV or (len(stem) == 1 and stem.isalpha()):
        return False
    if next_word is None:
        return True
    return next_word[0].isupper() or next_word[0].isdigit() or next_word[0] in "\"'(“"


def _merge_rects(words: list[tuple]) -> list[tuple[float, float, float, float]]:
    """Join a sentence's word boxes into one rectangle per line."""
    lines: dict[tuple[int, int], list[float]] = {}
    for x0, y0, x1, y1, _w, block, line, _n in words:
        key = (block, line)
        if key in lines:
            r = lines[key]
            r[0], r[1], r[2], r[3] = min(r[0], x0), min(r[1], y0), max(r[2], x1), max(r[3], y1)
        else:
            lines[key] = [x0, y0, x1, y1]
    return [tuple(r) for r in lines.values()]


# "words" and "dict" must use the same flags, or their block numbers disagree
# (dict counts image blocks by default, words doesn't).
_FLAGS = pymupdf.TEXTFLAGS_WORDS
# List markers at the start of a line: "1.", "B.", "(a)", "iv)", bullets.
_MARKER = re.compile(r"^(\(?(\d{1,2}|[A-Za-z]|[ivx]{1,4})[.)]|[•▪●◦–])$")
_BOLD = re.compile(r"bold|demi|semibold|heavy|black", re.I)  # NCERT headings use Bookman-Demi


@dataclass
class _Line:
    text: str
    size: float
    bold: bool
    bbox: tuple[float, float, float, float]
    alone: bool                   # only line in its block
    block_pos: tuple[float, float]


def _lines(page: pymupdf.Page) -> dict[tuple[int, int], _Line]:
    out = {}
    for b_no, b in enumerate(page.get_text("dict", flags=_FLAGS)["blocks"]):
        lines = b.get("lines", [])
        for l_no, line in enumerate(lines):
            spans = [s for s in line["spans"] if s["text"].strip()]
            if spans:
                out[(b_no, l_no)] = _Line(
                    text=" ".join(s["text"].strip() for s in spans),
                    size=max(s["size"] for s in spans),
                    bold=all(s["flags"] & 16 or _BOLD.search(s["font"]) for s in spans),
                    bbox=tuple(line["bbox"]),
                    alone=len(lines) == 1,
                    block_pos=(round(b["bbox"][1]), b["bbox"][0]),
                )
    return out


def _is_furniture(ln: _Line, body: float, height: float, running: set[str]) -> bool:
    """Headings, running headers/footers and page numbers: not study content."""
    if re.fullmatch(r"[\d\s]+", ln.text) or ln.size > body * 1.15:
        return True
    if _in_margin(ln, height) and _norm(ln.text) in running:
        return True
    if len(ln.text.split()) > 8 or _END.search(ln.text):
        return False  # a short line that ends like a sentence is content
    return ln.alone and ln.bold


def _in_margin(ln: _Line, height: float) -> bool:
    return ln.bbox[3] < height * 0.12 or ln.bbox[1] > height * 0.85


def _norm(text: str) -> str:
    return re.sub(r"[\d\s]+", " ", text).strip().lower()  # "Santoor Grade 5 80" ~ "... 82"


def running_lines(doc: pymupdf.Document, pages: range) -> set[str]:
    """Short margin lines that repeat across pages: running headers/footers.

    A fixed margin band can't tell them apart from body text, which in some
    books runs as low as a footer sits in others. Repetition can.
    """
    counts: Counter[str] = Counter()
    for idx in pages:
        page = doc[idx]
        counts.update({_norm(ln.text) for ln in _lines(page).values()
                       if _in_margin(ln, page.rect.height) and len(ln.text.split()) <= 8} - {""})
    # A fixed count, not a share of pages: a chapter-name header repeats only
    # within its chapter, however long the book or chunk is.
    need = 3 if len(pages) >= 6 else 2
    return {t for t, c in counts.items() if c >= need}


def extract_page(page: pymupdf.Page, page_no: int, min_words: int = 4,
                 running: set[str] = frozenset()) -> list[Sentence]:
    """Sentences on one page, in reading order.

    PDFs don't store sentences or reliably store paragraphs: one PDF puts a
    paragraph in one block, another puts every line in its own block. So we
    read block by block, split on punctuation, and also break at layout
    signals: a paragraph gap, a jump to another column or box, a list marker.
    """
    lines = _lines(page)
    if not lines:
        return []
    body = sorted(ln.size for ln in lines.values())[len(lines) // 2]  # median size
    keep = {k for k, ln in lines.items()
            if not _is_furniture(ln, body, page.rect.height, running)}

    # Some PDFs draw text several times, shifted ~1pt, to fake bold: keep one copy.
    seen: dict[str, list[tuple]] = {}
    words = []  # (x0,y0,x1,y1,word,block,line,wordno)
    for w in page.get_text("words", flags=_FLAGS):
        if (w[5], w[6]) not in keep:
            continue
        copies = seen.setdefault(w[4], [])
        if any(abs(w[0] - c[0]) < 3 and abs(w[1] - c[1]) < 3 for c in copies):
            continue
        copies.append(w)
        words.append(w)
    words.sort(key=lambda w: (*lines[(w[5], w[6])].block_pos, w[5], w[6], w[7]))

    sentences: list[Sentence] = []
    buf: list[tuple] = []

    def flush():
        nonlocal buf
        if len(buf) >= min_words:
            sid = f"p{page_no}_s{len(sentences) + 1:02d}"
            text = " ".join(x[4] for x in buf).replace("- ", "-")
            sentences.append(Sentence(sid, page_no, text, _merge_rects(buf)))
        buf = []

    def same_line(a, b) -> bool:
        return a is not None and b is not None and (a[5], a[6]) == (b[5], b[6])

    for i, w in enumerate(words):
        nxt = words[i + 1] if i + 1 < len(words) else None
        prev = buf[-1] if buf else (words[i - 1] if i else None)
        new_line = not same_line(prev, w)
        if new_line and same_line(w, nxt) and _MARKER.match(w[4]):
            flush()  # "2. Next question": start a new item, drop the marker
            continue
        if buf and new_line:
            a, b = lines[(prev[5], prev[6])].bbox, lines[(w[5], w[6])].bbox
            same_row = abs(b[1] - a[1]) < 3          # e.g. "called" | "antibodies."
            if not same_row and (
                    b[1] - a[3] > body * 1.2         # paragraph gap
                    or b[1] < a[1]                   # moved up: next column / box
                    or b[0] > a[2] or b[2] < a[0]):  # no horizontal overlap
                flush()
        buf.append(w)
        # across blocks (table cells, answer options) a full stop always ends it
        if nxt is None or _is_boundary(w[4], nxt[4] if nxt[5] == w[5] else None):
            flush()
    return sentences


def extract(pdf_path: str, pages: range | None = None) -> list[Sentence]:
    doc = pymupdf.open(pdf_path)
    pages = pages or range(len(doc))
    running = running_lines(doc, pages)
    out: list[Sentence] = []
    for idx in pages:
        out.extend(extract_page(doc[idx], idx + 1, running=running))
    doc.close()
    return out


_SMALL_WORDS = {"a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"}


def guess_title(doc: pymupdf.Document, pages: int = 3) -> str | None:
    """The chapter's name: the largest text on its first pages.

    PDF metadata is usually junk ("Human Welfare.pmd"), and NCERT file names
    are codes ("lebo107"), but the chapter heading is always the biggest type.
    """
    best: tuple[float, str] | None = None
    for i in range(min(pages, len(doc))):
        for ln in _lines(doc[i]).values():
            text = re.sub(r"^(chapter|unit|lesson)?\s*\d+[.:]?\s*", "", ln.text, flags=re.I).strip()
            if len(re.findall(r"[A-Za-z]", text)) >= 4 and (best is None or ln.size > best[0]):
                best = (ln.size, text)
    if best is None:
        return None
    title = re.sub(r"\s+", " ", best[1])
    if title.isupper():  # "HUMAN HEALTH AND DISEASE" -> "Human Health and Disease"
        words = title.lower().split()
        title = " ".join(w if i and w in _SMALL_WORDS else w.capitalize() for i, w in enumerate(words))
    return title[:80]


def is_scanned(pdf_path: str, sample: int = 5) -> bool:
    """True when the PDF has (almost) no text layer and would need OCR."""
    doc = pymupdf.open(pdf_path)
    n = min(sample, len(doc))
    chars = sum(len(doc[i].get_text().strip()) for i in range(n))
    doc.close()
    return chars < 50 * n
