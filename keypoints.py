"""Pick the key sentences on a page.

Primary path: an open-weight model (Gemma via llama.cpp's OpenAI-compatible
server, on this machine or self-hosted on Render) returns sentence *ids* plus
a type and a reason.
Asking for ids instead of quoted text means a small model can't misquote the
book, and every highlight maps exactly onto the page.

Fallback path: a cheap rule-based scorer, used when no model server is
running, and as the baseline to beat in the write-up.
"""
from __future__ import annotations

import json
import os
import re
import time

import requests

from extract import Sentence

# 127.0.0.1, not localhost: on Windows, localhost tries IPv6 first and each
# refused connection costs ~2 s. Set to "" to use the rule-based scorer only.
# On Render, render.yaml sets STUDYPAL_LLM_HOSTPORT to the Gemma service's
# private-network address instead.
_hostport = os.environ.get("STUDYPAL_LLM_HOSTPORT")
LLM_URL = os.environ.get("STUDYPAL_LLM_URL", (
    f"http://{_hostport}/v1/chat/completions" if _hostport
    else "http://127.0.0.1:8080/v1/chat/completions"))
LLM_KEY = os.environ.get("STUDYPAL_LLM_KEY", "")   # llama-server --api-key, for a hosted model
LLM_TIMEOUT = float(os.environ.get("STUDYPAL_LLM_TIMEOUT", "120"))  # CPU-only hosts need more
RETRY_AFTER = 60  # seconds to skip the model after it was unreachable
_down_since: float | None = None


def model_available() -> bool:
    """False when no model is configured, or it was unreachable a moment ago."""
    return bool(LLM_URL) and (_down_since is None or time.monotonic() - _down_since > RETRY_AFTER)
TYPES = ("concept", "definition", "fact", "formula", "example")

SYSTEM = (
    "You are a careful study assistant. You mark the few sentences on a textbook "
    "page that a student must remember for an exam: definitions, key concepts, "
    "facts, formulas and telling examples. Never mark figure captions, sentences "
    "that only point to a figure or table, or questions to the reader. "
    "Most important first. Never invent ids."
)

USER_TMPL = """Page {page}. Each sentence starts with its id in brackets.

{numbered}

Mark at most {limit} sentences, most important first.
Return JSON: {{"highlights": [{{"id": "<sentence id>", "type": one of {types}, "why": "<under 12 words>"}}]}}"""


def highlight_limit(n_sentences: int) -> int:
    """About one sentence in four, between 3 and 10 a page: room for every key
    term on a dense page without painting the whole page."""
    return max(3, min(10, round(n_sentences / 4)))


def schema(ids: list[str], limit: int) -> dict:
    """JSON schema for llama.cpp's grammar-constrained output. The reply always
    parses; the id enum means the model can only name sentences that exist
    (unconstrained, Gemma 3 4B sometimes wrote "[p5_s15]" for p5_s15); and
    maxItems makes the limit a hard one (asked nicely for "3 to 6", it marked
    13 sentences a page)."""
    return {
        "type": "object",
        "properties": {
            "highlights": {
                "type": "array",
                "maxItems": limit,
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "enum": ids},
                        "type": {"type": "string", "enum": list(TYPES)},
                        "why": {"type": "string"},
                    },
                    "required": ["id", "type", "why"],
                },
            }
        },
        "required": ["highlights"],
    }


def llm_keypoints(sentences: list[Sentence], timeout: float | None = None) -> list[dict]:
    if not sentences:
        return []
    numbered = "\n".join(f"[{s.id}] {s.text}" for s in sentences)
    limit = highlight_limit(len(sentences))
    body = {
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": USER_TMPL.format(
                page=sentences[0].page, numbered=numbered, types=list(TYPES), limit=limit)},
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object",
                            "schema": schema([s.id for s in sentences], limit)},
    }
    headers = {"Authorization": f"Bearer {LLM_KEY}"} if LLM_KEY else {}
    r = requests.post(LLM_URL, json=body, headers=headers, timeout=timeout or LLM_TIMEOUT)
    r.raise_for_status()
    content = r.json()["choices"][0]["message"]["content"]
    data = json.loads(content)
    valid = {s.id for s in sentences}
    seen, out = set(), []
    for h in data.get("highlights", []):
        # drop hallucinated or repeated ids, normalise unknown types
        if h.get("id") in valid and h["id"] not in seen:
            seen.add(h["id"])
            h["type"] = h.get("type") if h.get("type") in TYPES else "concept"
            out.append(h)
    return out


# ---------------------------------------------------------------- baseline

_DEF = re.compile(r"\b(is|are) (called|known as|defined as)\b|\bis defined as\b|\brefers to\b|\bmeans\b", re.I)
# Math symbols or chemical-style formulas (CO2, H2L2, C6H12O6). Not "his/her" or "HIV/AIDS".
_FORMULA = re.compile(r"[=×÷√∝→⇌]|\b(?:[A-Z][a-z]?\d*)+\d\b")
_FACT = re.compile(r"\b(1[5-9]|20)\d{2}\b|\b\d+(\.\d+)?\s*(%|km|kg|m/s|°C|K|mol|J|N|years?)\b", re.I)
_CUE = re.compile(r"\b(important|key|main|therefore|thus|hence|principle|law|rule|always|never)\b", re.I)


def rule_keypoints(sentences: list[Sentence], top_k: int = 5) -> list[dict]:
    scored = []
    for s in sentences:
        score, kind = 0.0, "concept"
        if _DEF.search(s.text):
            score, kind = score + 3, "definition"
        if _FORMULA.search(s.text):
            score, kind = score + 2, "formula"
        if _FACT.search(s.text):
            score += 1.5
            kind = kind if kind != "concept" else "fact"
        score += len(_CUE.findall(s.text))
        if score > 0:
            scored.append((score, s.id, kind))
    scored.sort(key=lambda x: -x[0])
    keep = sorted(scored[:top_k], key=lambda x: x[1])
    return [{"id": sid, "type": kind, "why": _RULE_WHY[kind]} for _, sid, kind in keep]


_RULE_WHY = {
    "definition": "Defines a term",
    "formula": "Contains a formula",
    "fact": "A date, number or quantity to remember",
    "concept": "Signals a key idea",
}


def keypoints(sentences: list[Sentence]) -> tuple[list[dict], str]:
    """Returns (highlights, engine) where engine is 'llm' or 'rules'."""
    global _down_since
    if model_available():
        try:
            out = llm_keypoints(sentences)
            _down_since = None
            return out, "llm"
        except requests.ConnectionError:
            _down_since = time.monotonic()  # no server: don't wait on every page
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 503:
                _down_since = time.monotonic()  # server up, model still loading
        except (requests.RequestException, KeyError, json.JSONDecodeError):
            pass
    return rule_keypoints(sentences), "rules"
