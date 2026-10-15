import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { Sparkles, X } from "lucide-react";
import { renderToCanvas, type PDFDoc, type RenderTask } from "../lib/pdf";
import { TYPES, type HType, type Highlight, type PageData, type Sentence } from "../lib/types";

const MAX_WIDTH = 920;
const POPOVER_W = 300;

interface Props {
  doc: PDFDoc | null;
  pageNo: number;
  data?: PageData;
  hidden: Set<HType>;
  active: string | null;
  hover: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}

/** The real page, rendered with PDF.js, with highlights drawn on top of it. */
export function PageView({ doc, pageNo, data, hidden, active, hover, onHover, onSelect }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // Set only once a page is fully drawn, so highlights never sit on the previous page.
  const [shown, setShown] = useState<{ page: number; scale: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(([e]) => setWidth(Math.min(MAX_WIDTH, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!doc || !width) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    (async () => {
      const page = await doc.getPage(pageNo);
      if (cancelled) return;
      const r = renderToCanvas(page, width, 2.2);
      task = r.task;
      try {
        await r.task.promise;
      } catch {
        return; // cancelled by a newer page turn or resize
      }
      if (cancelled) return;
      host.current?.replaceChildren(r.canvas);
      setShown({ page: pageNo, scale: r.scale, w: r.width, h: r.height });
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNo, width]);

  const ready = shown?.page === pageNo;
  const sentences = useMemo(() => new Map((data?.sentences ?? []).map((s) => [s.id, s])), [data]);
  const visible = useMemo(
    () => (data?.highlights ?? []).filter((h) => !hidden.has(h.type) && sentences.has(h.id)),
    [data, hidden, sentences],
  );

  // Bring a highlight picked in the side panel into view.
  useEffect(() => {
    if (!active) return;
    overlay.current?.querySelector(`[data-hl="${active}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const activeHl = ready ? visible.find((h) => h.id === active) : undefined;

  return (
    <div ref={wrap} className="mx-auto w-full" style={{ maxWidth: MAX_WIDTH }}>
      <div
        className="relative mx-auto overflow-visible rounded-[3px] bg-white shadow-page"
        style={shown ? { width: shown.w, height: shown.h } : { width: "100%", aspectRatio: "1 / 1.37" }}
        onClick={(e) => e.target === e.currentTarget && onSelect(null)}
      >
        <div ref={host} className="absolute inset-0 overflow-hidden rounded-[3px]" />
        {!shown && <div className="shimmer absolute inset-0 rounded-[3px] opacity-50" />}

        {/* Highlights */}
        <div ref={overlay} className="absolute inset-0" onMouseLeave={() => onHover(null)}>
          {ready &&
            data &&
            visible.map((h, hi) =>
              sentences.get(h.id)!.rects.map(([x0, y0, x1, y1], ri) => (
                <button
                  key={`${pageNo}-${h.id}-${ri}`}
                  type="button"
                  data-hl={h.id}
                  tabIndex={ri === 0 ? 0 : -1}
                  aria-label={ri === 0 ? `${TYPES[h.type].label}: ${sentences.get(h.id)!.text}` : undefined}
                  aria-hidden={ri === 0 ? undefined : true}
                  className={`hl t-${h.type}`}
                  data-hover={hover === h.id}
                  data-active={active === h.id}
                  onMouseEnter={() => onHover(h.id)}
                  onFocus={() => onHover(h.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(active === h.id ? null : h.id);
                  }}
                  style={{
                    left: x0 * shown!.scale - 2,
                    top: y0 * shown!.scale - 1.5,
                    width: (x1 - x0) * shown!.scale + 4,
                    height: (y1 - y0) * shown!.scale + 3,
                    animationDelay: `${120 + hi * 110 + ri * 45}ms`,
                  }}
                />
              )),
            )}
        </div>

        {/* "Gemma is reading this page" while its highlights are being made */}
        <AnimatePresence>
          {ready && !data && (
            <motion.div
              key="reading"
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-[3px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.4 } }}
            >
              <div className="scan absolute inset-x-0 h-[14%]" />
              <div className="absolute left-1/2 top-4 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-stone-900/85 px-3.5 py-1.5 text-xs font-medium text-white shadow-lift backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-amber-300" />
                Finding the key points on this page…
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {activeHl && shown && (
            <Popover
              key={activeHl.id}
              h={activeHl}
              s={sentences.get(activeHl.id)!}
              scale={shown.scale}
              pageW={shown.w}
              pageH={shown.h}
              onClose={() => onSelect(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Popover(props: { h: Highlight; s: Sentence; scale: number; pageW: number; pageH: number; onClose: () => void }) {
  const { h, s, scale, pageW, pageH, onClose } = props;
  const first = s.rects[0];
  const last = s.rects[s.rects.length - 1];
  const below = last[3] * scale + 10;
  const placeAbove = below + 150 > pageH && first[1] * scale > 170;
  const left = Math.max(8, Math.min(first[0] * scale, pageW - POPOVER_W - 8));
  const [page, sentence] = h.id.replace("p", "").split("_s");

  return (
    <motion.div
      role="dialog"
      aria-label={TYPES[h.type].label}
      initial={{ opacity: 0, y: placeAbove ? 6 : -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className={clsx(
        `t-${h.type}`,
        "absolute z-20 rounded-2xl border border-line bg-surface p-4 text-ink shadow-lift",
      )}
      style={{
        width: Math.min(POPOVER_W, pageW - 16),
        left,
        ...(placeAbove ? { bottom: pageH - first[1] * scale + 10 } : { top: below }),
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider swatch-strong">
          <i className="swatch h-2.5 w-2.5 rounded-[3px]" />
          {TYPES[h.type].label}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-raised hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-[15px] font-medium leading-snug">{h.why}</p>
      <p className="mt-2 text-xs text-muted">
        Page {page} · sentence {Number(sentence)}
      </p>
    </motion.div>
  );
}
