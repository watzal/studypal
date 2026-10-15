import json
import os
import sys

import pymupdf
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import keypoints  # noqa: E402
from extract import extract, guess_title, is_scanned  # noqa: E402
from highlight import run  # noqa: E402
from make_sample import build  # noqa: E402


@pytest.fixture()
def sample(tmp_path):
    p = tmp_path / "sample.pdf"
    build(str(p))
    return str(p)


def test_extract_ids_and_rects(sample):
    sents = extract(sample)
    assert not is_scanned(sample)
    assert sents[0].id == "p1_s01"
    assert any(s.page == 2 for s in sents)
    assert all(s.rects for s in sents)
    # headings ("Chapter 6: Photosynthesis") and page numbers are dropped
    assert not any(s.text.startswith("Chapter 6") for s in sents)
    # abbreviation-free sentences split on full stops
    assert any(s.text == "These pores are known as stomata." for s in sents)
    # sentences that wrap across lines stay whole (one rect per line)
    photo = next(s for s in sents if s.text.startswith("Photosynthesis is defined"))
    assert photo.text.endswith("using sunlight.") and len(photo.rects) == 2
    assert any(s.text.startswith("Light intensity is") for s in sents)
    assert len([s for s in sents if s.page == 1]) == 10


def test_exercise_page_layout(sample):
    p3 = [s.text for s in extract(sample) if s.page == 3]
    # no bold heading, footer, page number, list marker or answer options
    assert p3 == ["Plants release oxygen during the day.",
                  "Stomata are found mostly on the leaf surface."]


def test_guess_title(sample):
    # largest text on the first pages, without its "Chapter 6:" prefix
    assert guess_title(pymupdf.open(sample)) == "Photosynthesis"


def test_rule_baseline_finds_definitions(sample):
    sents = [s for s in extract(sample) if s.page == 1]
    hs = keypoints.rule_keypoints(sents)
    texts = {s.id: s.text for s in sents}
    defs = [texts[h["id"]] for h in hs if h["type"] == "definition"]
    assert any("chlorophyll" in t for t in defs)


def test_llm_ids_are_validated(sample, monkeypatch):
    sents = [s for s in extract(sample) if s.page == 1]
    fake = {"highlights": [
        {"id": sents[1].id, "type": "definition", "why": "core term"},
        {"id": "p9_s99", "type": "fact", "why": "hallucinated"},
        {"id": sents[1].id, "type": "concept", "why": "duplicate"},
        {"id": sents[3].id, "type": "weird", "why": "bad type"},
    ]}

    class R:
        def raise_for_status(self): pass
        def json(self): return {"choices": [{"message": {"content": json.dumps(fake)}}]}

    monkeypatch.setattr(keypoints.requests, "post", lambda *a, **k: R())
    hs = keypoints.llm_keypoints(sents)
    assert [h["id"] for h in hs] == [sents[1].id, sents[3].id]
    assert hs[1]["type"] == "concept"


def test_end_to_end_without_model(sample, tmp_path, monkeypatch):
    monkeypatch.setattr(keypoints, "LLM_URL", "http://127.0.0.1:9/none")
    out = str(tmp_path / "out.pdf")
    res = run(sample, out)
    assert res["engine"] == ["rules"]
    doc = pymupdf.open(out)
    assert sum(len(list(p.annots())) for p in doc) == len(res["highlights"]) > 0
    assert os.path.exists(out.replace(".pdf", ".json"))
