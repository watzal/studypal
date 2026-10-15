import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { Cpu, FileQuestion, Sparkles, TriangleAlert } from "lucide-react";
import { TYPES, TYPE_ORDER, type HType, type PageData } from "../lib/types";

interface Props {
  pageNo: number;
  data?: PageData;
  hidden: Set<HType>;
  onToggle: (t: HType) => void;
  active: string | null;
  hover: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}

/** Everything highlighted on the page as a list, in reading order. Hovering
 *  or clicking an item lights up the same sentence on the page. */
export function KeyPointsPanel({ pageNo, data, hidden, onToggle, active, hover, onHover, onSelect }: Props) {
  const list = useRef<HTMLOListElement>(null);

  const items = useMemo(() => {
    if (!data) return [];
    const order = new Map(data.sentences.map((s, i) => [s.id, i]));
    const text = new Map(data.sentences.map((s) => [s.id, s.text]));
    return data.highlights
      .filter((h) => text.has(h.id))
      .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
      .map((h) => ({ ...h, text: text.get(h.id)! }));
  }, [data]);

  const counts = useMemo(() => {
    const c: Partial<Record<HType, number>> = {};
    items.forEach((i) => (c[i.type] = (c[i.type] ?? 0) + 1));
    return c;
  }, [items]);

  useEffect(() => {
    if (active) list.current?.querySelector(`[data-kp="${active}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const shown = items.filter((i) => !hidden.has(i.type));

  return (
    <aside className="scrollbar-thin flex flex-col border-t border-line bg-surface/50 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
      <div className="sticky top-0 z-10 border-b border-line bg-surface/90 px-5 pb-4 pt-5 backdrop-blur-xl">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold tracking-tight">
            Key points
            <span className="ml-2 align-middle text-sm font-normal text-muted">page {pageNo}</span>
          </h2>
          {data && <EngineBadge engine={data.engine} seconds={data.seconds} />}
        </div>

        <div className="mt-3.5 flex flex-wrap gap-1.5" role="group" aria-label="Show highlight types">
          {TYPE_ORDER.map((t) => {
            const on = !hidden.has(t);
            const count = counts[t] ?? 0;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(t)}
                className={clsx(
                  `t-${t}`,
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  on ? "border-line bg-surface text-ink shadow-sm" : "border-transparent bg-transparent text-muted line-through opacity-60",
                  !count && on && "opacity-60",
                )}
              >
                <i className={clsx("swatch h-2 w-2 rounded-[3px]", !on && "opacity-40")} />
                {TYPES[t].plural}
                <span className="tabular-nums text-muted">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 px-4 py-4">
        {!data ? (
          <Pending pageNo={pageNo} />
        ) : data.error ? (
          <Empty icon={<TriangleAlert className="h-5 w-5" />} title="This page couldn't be processed" text={data.error} />
        ) : items.length === 0 ? (
          <Empty
            icon={<FileQuestion className="h-5 w-5" />}
            title="Nothing to memorise here"
            text="Probably a title, picture or exercise page. Turn the page to keep going."
          />
        ) : (
          <ol ref={list} className="space-y-2.5">
            <AnimatePresence initial={true}>
              {shown.map((item, i) => (
                <motion.li
                  key={`${pageNo}-${item.id}`}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ delay: Math.min(i * 0.05, 0.4), duration: 0.25 }}
                >
                  <button
                    type="button"
                    data-kp={item.id}
                    onMouseEnter={() => onHover(item.id)}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onHover(item.id)}
                    onBlur={() => onHover(null)}
                    onClick={() => onSelect(active === item.id ? null : item.id)}
                    className={clsx(
                      `t-${item.type}`,
                      "group relative block w-full overflow-hidden rounded-xl border bg-surface py-3 pl-4 pr-3.5 text-left transition-all duration-150",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                      active === item.id
                        ? "border-transparent shadow-lift ring-2 ring-[rgb(var(--c-strong)/.55)]"
                        : hover === item.id
                          ? "border-line shadow-card"
                          : "border-line/70 hover:shadow-card",
                    )}
                  >
                    <span className="bar-c absolute inset-y-0 left-0 w-1" />
                    <span className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider swatch-strong">
                      {TYPES[item.type].label}
                    </span>
                    <span className="block text-[14px] leading-relaxed text-ink">{item.text}</span>
                    <span className="mt-1.5 block text-[13px] leading-snug text-muted">{item.why}</span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
            {shown.length === 0 && (
              <li className="px-2 py-6 text-center text-sm text-muted">All highlight types are hidden. Tap one above to show it.</li>
            )}
          </ol>
        )}
      </div>
    </aside>
  );
}

function EngineBadge({ engine, seconds }: { engine: PageData["engine"]; seconds: number }) {
  const llm = engine === "llm";
  return (
    <span
      title={llm ? `Picked by Gemma in ${seconds.toFixed(1)} s, on this machine` : "The model wasn't running, so simple rules picked these"}
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        llm ? "bg-accent/10 text-accent" : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    >
      {llm ? <Sparkles className="h-3 w-3" /> : <Cpu className="h-3 w-3" />}
      {llm ? "Gemma" : "Rules"}
    </span>
  );
}

function Pending({ pageNo }: { pageNo: number }) {
  return (
    <div>
      <div className="mb-4 flex items-start gap-3 rounded-xl bg-accent/[0.07] p-3.5 text-sm">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 animate-pulse text-accent" />
        <p>
          <span className="font-medium">Reading page {pageNo}…</span>
          <span className="block text-muted">
            StudyPal works 30 pages at a time, just ahead of where you are. Highlights appear in a moment.
          </span>
        </p>
      </div>
      <div className="space-y-2.5">
        {[0.92, 0.7, 0.84].map((w, i) => (
          <div key={i} className="rounded-xl border border-line/70 bg-surface p-3.5">
            <div className="shimmer mb-2.5 h-2.5 w-16 rounded-full" />
            <div className="shimmer mb-1.5 h-3 rounded-full" style={{ width: `${w * 100}%` }} />
            <div className="shimmer h-3 w-3/5 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-raised text-muted">{icon}</span>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
  );
}
