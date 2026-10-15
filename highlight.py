"""Run the pipeline on a PDF and write a highlighted copy plus a JSON sidecar.

Usage:
    python highlight.py book.pdf --pages 1-10 --out book_highlighted.pdf

The JSON sidecar holds every sentence, its rectangles and the highlights, so
the web reader (PDF.js) can draw the same overlay without re-running the model.
"""
from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from dataclasses import asdict

import pymupdf

from extract import extract, is_scanned
from keypoints import keypoints

COLORS = {  # RGB 0..1
    "concept": (1.0, 0.92, 0.23),    # yellow
    "definition": (0.55, 0.78, 1.0),  # blue
    "fact": (0.55, 0.9, 0.55),        # green
    "formula": (0.55, 0.9, 0.55),     # green
    "example": (1.0, 0.7, 0.85),      # pink
}


def parse_pages(spec: str | None, n: int) -> range:
    if not spec:
        return range(n)
    a, _, b = spec.partition("-")
    return range(int(a) - 1, min(int(b or a), n))


def run(pdf_path: str, out_pdf: str, pages: str | None = None) -> dict:
    if is_scanned(pdf_path):
        raise SystemExit("This PDF has no text layer (scanned). OCR support comes next.")
    doc = pymupdf.open(pdf_path)
    page_range = parse_pages(pages, len(doc))
    sentences = extract(pdf_path, page_range)

    by_page = defaultdict(list)
    for s in sentences:
        by_page[s.page].append(s)

    highlights, engines, timings = [], set(), {}
    for page_no, sents in sorted(by_page.items()):
        t0 = time.perf_counter()
        hs, engine = keypoints(sents)
        timings[page_no] = round(time.perf_counter() - t0, 3)
        engines.add(engine)
        lookup = {s.id: s for s in sents}
        page = doc[page_no - 1]
        for h in hs:
            s = lookup[h["id"]]
            annot = page.add_highlight_annot([pymupdf.Rect(r) for r in s.rects])
            annot.set_colors(stroke=COLORS[h["type"]])
            annot.set_info(title=h["type"], content=h["why"])
            annot.update()
            highlights.append({**h, "page": page_no, "text": s.text})

    doc.save(out_pdf, garbage=3, deflate=True)
    doc.close()

    sidecar = {
        "source": pdf_path,
        "engine": sorted(engines),
        "seconds_per_page": timings,
        "sentences": [asdict(s) for s in sentences],
        "highlights": highlights,
    }
    with open(out_pdf.rsplit(".", 1)[0] + ".json", "w", encoding="utf-8") as f:
        json.dump(sidecar, f, ensure_ascii=False, indent=1)
    return sidecar


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--pages", help="e.g. 1-10")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    out = a.out or a.pdf.rsplit(".", 1)[0] + "_highlighted.pdf"
    res = run(a.pdf, out, a.pages)
    print(f"{len(res['sentences'])} sentences, {len(res['highlights'])} highlights "
          f"via {res['engine']} -> {out}")
    for h in res["highlights"]:
        print(f"  p{h['page']} [{h['type']:<10}] {h['text'][:90]}")
