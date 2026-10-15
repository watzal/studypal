import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { Brand } from "./Brand";
import { Thumbnails, type ThumbState } from "./Thumbnails";
import { PageView } from "./PageView";
import { KeyPointsPanel } from "./KeyPointsPanel";
import { fileUrl, getBook, getPage, visitPage } from "../lib/api";
import { pdfjs, type PDFDoc } from "../lib/pdf";
import { CHUNK, PREFETCH_AT, type BookStatus, type HType, type PageData } from "../lib/types";

const POLL_MS = 1500;

export function Reader({ bookId, requestedPage }: { bookId: string; requestedPage: number }) {
  const [doc, setDoc] = useState<PDFDoc | null>(null);
  const [meta, setMeta] = useState<BookStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(requestedPage);
  const [pages, setPages] = useState<Record<number, PageData>>({});
  const [hidden, setHidden] = useState<Set<HType>>(new Set());
  const [active, setActive] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const n = meta?.pages ?? doc?.numPages ?? 0;
  const go = useCallback((p: number) => setPage((cur) => (n ? Math.min(Math.max(1, p), n) : cur)), [n]);

  // Refs so the polling loop always sees the latest state.
  const live = useRef({ page, pages, meta });
  live.current = { page, pages, meta };

  // Load the book's status and the PDF itself.
  useEffect(() => {
    let alive = true;
    getBook(bookId)
      .then((m) => {
        if (!alive) return;
        setMeta(m);
        document.title = `${m.title} · StudyPal`;
      })
      .catch((e) => alive && setError(e.message));
    const task = pdfjs.getDocument(fileUrl(bookId));
    task.promise.then((d) => alive && setDoc(d)).catch(() => alive && setError("This PDF couldn't be opened."));
    return () => {
      alive = false;
      task.destroy();
    };
  }, [bookId]);

  // The URL drives the page (e.g. browser back/forward, a pasted link).
  useEffect(() => setPage(requestedPage), [requestedPage]);

  const fetchPage = useCallback(
    async (p: number) => {
      const data = await getPage(bookId, p).catch(() => null);
      if (data) setPages((s) => ({ ...s, [p]: data }));
    },
    [bookId],
  );

  // Every page turn: update the URL, tell the backend where the student is, load highlights.
  useEffect(() => {
    if (!meta) return;
    window.history.replaceState(null, "", `#/book/${bookId}/${page}`);
    setActive(null);
    visitPage(bookId, page).catch(() => {});
    if (!live.current.pages[page]) fetchPage(page);
  }, [bookId, page, meta?.id, fetchPage]);

  // Poll until the current page is ready, and keep the progress current while pages are processing.
  useEffect(() => {
    if (!meta) return;
    let alive = true;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const { page: p, pages: have, meta: m } = live.current;
        // also re-check rule-based pages: the backend redoes them once Gemma is up
        if (!have[p] || have[p].engine === "rules") await fetchPage(p);
        if (m && m.done < m.pages) {
          const next = await getBook(bookId);
          if (alive) setMeta(next);
        }
      } catch {
        /* transient: try again next tick */
      } finally {
        busy = false;
      }
    };
    const t = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [bookId, meta?.id, fetchPage]);

  // Keyboard: arrows / j k to turn pages, Esc to close a highlight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "ArrowRight" || e.key === "j" || e.key === "PageDown") go(page + 1);
      else if (e.key === "ArrowLeft" || e.key === "k" || e.key === "PageUp") go(page - 1);
      else if (e.key === "Escape") setActive(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, go]);

  const done = useMemo(() => new Set(meta?.done_pages ?? []), [meta]);

  // Which pages the backend is working on right now: the current chunk, plus the
  // next one once the student is PREFETCH_AT pages in. Drawn as pulsing dots.
  const thumbState = useCallback(
    (p: number): ThumbState => {
      if (done.has(p) || pages[p]) return "done";
      const chunk = Math.floor((page - 1) / CHUNK);
      const inChunk = (c: number) => p > c * CHUNK && p <= (c + 1) * CHUNK;
      const prefetching = ((page - 1) % CHUNK) + 1 >= PREFETCH_AT;
      return inChunk(chunk) || (prefetching && inChunk(chunk + 1)) ? "working" : "idle";
    },
    [done, pages, page],
  );

  const toggle = (t: HType) =>
    setHidden((s) => {
      const next = new Set(s);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

  if (error) return <ReaderError message={error} />;

  const data = pages[page];
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <TopBar
        title={meta?.title ?? ""}
        page={page}
        pages={n}
        go={go}
        done={meta?.done ?? 0}
      />

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[132px_minmax(0,1fr)_360px] xl:grid-cols-[148px_minmax(0,1fr)_400px]">
        {doc ? (
          <Thumbnails doc={doc} pages={n} current={page} stateOf={thumbState} onSelect={go} />
        ) : (
          <div className="hidden border-r border-line lg:block" />
        )}

        <main className="scrollbar-thin relative px-3 py-6 sm:px-8 lg:overflow-y-auto">
          <PageView
            doc={doc}
            pageNo={page}
            data={data}
            hidden={hidden}
            active={active}
            hover={hover}
            onHover={setHover}
            onSelect={setActive}
          />
          <MobilePager page={page} pages={n} go={go} />
        </main>

        <KeyPointsPanel
          pageNo={page}
          data={data}
          hidden={hidden}
          onToggle={toggle}
          active={active}
          hover={hover}
          onHover={setHover}
          onSelect={setActive}
        />
      </div>
    </div>
  );
}

function TopBar(props: { title: string; page: number; pages: number; go: (p: number) => void; done: number }) {
  const { title, page, pages, go, done } = props;
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page]);
  const pct = pages ? done / pages : 0;

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-bg/85 px-3 backdrop-blur-xl sm:px-5">
      <a
        href="#/"
        className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-surface hover:text-ink"
        aria-label="Back to your books"
      >
        <ArrowLeft className="h-[18px] w-[18px]" />
      </a>
      <Brand compact className="hidden sm:inline-flex" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-base font-semibold sm:text-lg">{title || " "}</p>
      </div>

      <nav className="hidden items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-card sm:flex" aria-label="Pages">
        <IconBtn label="Previous page" onClick={() => go(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-4 w-4" />
        </IconBtn>
        <form
          className="flex items-center gap-1.5 px-1 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            go(Number(draft) || page);
          }}
        >
          <label className="sr-only" htmlFor="page-input">Page</label>
          <input
            id="page-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
            onBlur={() => go(Number(draft) || page)}
            inputMode="numeric"
            className="w-10 rounded-md bg-raised py-1 text-center font-medium tabular-nums outline-none ring-accent/40 focus:ring-2"
          />
          <span className="tabular-nums text-muted">/ {pages || "–"}</span>
        </form>
        <IconBtn label="Next page" onClick={() => go(page + 1)} disabled={!pages || page >= pages}>
          <ChevronRight className="h-4 w-4" />
        </IconBtn>
      </nav>

      <div
        className="flex items-center gap-2.5 rounded-xl border border-line bg-surface py-1.5 pl-2 pr-3 shadow-card"
        title="Pages are highlighted 30 at a time, just ahead of where you're reading"
      >
        <ProgressRing value={pct} />
        <span className="text-xs leading-tight">
          <span className="block font-semibold tabular-nums">
            {done}/{pages || "–"}
          </span>
          <span className="hidden text-muted md:block">{pct >= 1 ? "all highlighted" : "highlighted"}</span>
        </span>
      </div>
    </header>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 -rotate-90" aria-hidden="true">
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="3" className="stroke-line" />
      <motion.circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-accent"
        strokeDasharray={c}
        animate={{ strokeDashoffset: c * (1 - Math.min(1, value)) }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </svg>
  );
}

function IconBtn(props: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      disabled={props.disabled}
      className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-ink disabled:pointer-events-none disabled:opacity-35"
    >
      {props.children}
    </button>
  );
}

function MobilePager({ page, pages, go }: { page: number; pages: number; go: (p: number) => void }) {
  return (
    <div className="mx-auto mt-5 flex max-w-xs items-center justify-between rounded-2xl border border-line bg-surface p-1.5 shadow-card sm:hidden">
      <IconBtn label="Previous page" onClick={() => go(page - 1)} disabled={page <= 1}>
        <ChevronLeft className="h-5 w-5" />
      </IconBtn>
      <span className="text-sm tabular-nums text-muted">
        Page <span className="font-semibold text-ink">{page}</span> of {pages || "–"}
      </span>
      <IconBtn label="Next page" onClick={() => go(page + 1)} disabled={!pages || page >= pages}>
        <ChevronRight className="h-5 w-5" />
      </IconBtn>
    </div>
  );
}

function ReaderError({ message }: { message: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-red-500/10 text-red-600 dark:text-red-300">
          <TriangleAlert className="h-6 w-6" />
        </span>
        <h1 className="font-serif text-2xl font-semibold">Couldn't open this book</h1>
        <p className="mt-2 text-muted">{message}</p>
        <a href="#/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-medium text-accent-ink">
          <ArrowLeft className="h-4 w-4" /> Back to your books
        </a>
      </div>
    </div>
  );
}
