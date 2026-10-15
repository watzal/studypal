import { memo, useEffect, useRef, useState, type RefObject } from "react";
import clsx from "clsx";
import { renderToCanvas, type PDFDoc, type RenderTask } from "../lib/pdf";

export type ThumbState = "done" | "working" | "idle";

/** Page rail. Thumbnails render lazily as they scroll into view, so a
 *  600-page book costs nothing until you look at it. The dot under each one
 *  shows whether its highlights are ready, being made, or not started. */
export function Thumbnails(props: {
  doc: PDFDoc;
  pages: number;
  current: number;
  stateOf: (p: number) => ThumbState;
  onSelect: (p: number) => void;
}) {
  const { doc, pages, current, stateOf, onSelect } = props;
  const rail = useRef<HTMLElement>(null);
  const [ratio, setRatio] = useState(1.36);

  useEffect(() => {
    doc.getPage(1).then((p) => {
      const v = p.getViewport({ scale: 1 });
      setRatio(v.height / v.width);
    });
  }, [doc]);

  useEffect(() => {
    rail.current
      ?.querySelector(`[data-page="${current}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);

  return (
    <nav
      ref={rail}
      aria-label="Pages"
      className="scrollbar-thin hidden overflow-y-auto border-r border-line bg-raised/60 px-3 py-4 lg:block"
    >
      <ol className="space-y-3">
        {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
          <li key={p}>
            <Thumb doc={doc} n={p} ratio={ratio} active={p === current} state={stateOf(p)} onSelect={onSelect} root={rail} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

const Thumb = memo(function Thumb(props: {
  doc: PDFDoc;
  n: number;
  ratio: number;
  active: boolean;
  state: ThumbState;
  onSelect: (p: number) => void;
  root: RefObject<HTMLElement>;
}) {
  const { doc, n, ratio, active, state, onSelect, root } = props;
  const btn = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | null = null;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const page = await doc.getPage(n);
        if (cancelled) return;
        const r = renderToCanvas(page, 110);
        task = r.task;
        try {
          await r.task.promise;
        } catch {
          return;
        }
        if (!cancelled) {
          host.current?.replaceChildren(r.canvas);
          setDrawn(true);
        }
      },
      { root: root.current, rootMargin: "400px 0px" },
    );
    if (btn.current) io.observe(btn.current);
    return () => {
      cancelled = true;
      io.disconnect();
      task?.cancel();
    };
  }, [doc, n, root]);

  const label = state === "done" ? "highlighted" : state === "working" ? "being highlighted" : "not highlighted yet";
  return (
    <button
      ref={btn}
      type="button"
      data-page={n}
      onClick={() => onSelect(n)}
      aria-current={active ? "page" : undefined}
      aria-label={`Page ${n}, ${label}`}
      className="group block w-full text-left focus:outline-none"
    >
      <div
        className={clsx(
          "relative overflow-hidden rounded-md bg-white shadow-card ring-offset-2 ring-offset-bg transition-all duration-200",
          active ? "ring-2 ring-accent" : "group-hover:ring-2 group-hover:ring-line group-focus-visible:ring-2 group-focus-visible:ring-accent/60",
        )}
        style={{ aspectRatio: `1 / ${ratio}` }}
      >
        <div ref={host} className="h-full w-full" />
        {!drawn && <div className="shimmer absolute inset-0 opacity-40" />}
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] tabular-nums">
        <span className={clsx(active ? "font-semibold text-ink" : "text-muted")}>{n}</span>
        <span className="relative flex h-1.5 w-1.5" title={label}>
          {state === "working" && <span className="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-75" />}
          <span
            className={clsx(
              "relative h-1.5 w-1.5 rounded-full",
              state === "done" && "bg-emerald-500",
              state === "working" && "bg-amber-400",
              state === "idle" && "bg-line",
            )}
          />
        </span>
      </div>
    </button>
  );
});
