import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { ArrowRight, BookOpen, Cpu, FileUp, Layers, Loader2, ScanText, TriangleAlert } from "lucide-react";
import { Brand } from "./Brand";
import { listBooks, uploadBook } from "../lib/api";
import { TYPES, TYPE_ORDER, type BookSummary, type HType } from "../lib/types";

export function Library() {
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "StudyPal";
    listBooks().then(setBooks).catch(() => setBooks([]));
  }, []);

  async function open(file?: File | null) {
    if (!file || busy) return;
    setError(null);
    setBusy(file.name);
    try {
      const book = await uploadBook(file);
      window.location.hash = `#/book/${book.id}/1`;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <span className="hidden items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-xs text-muted sm:inline-flex">
          <Cpu className="h-3.5 w-3.5" /> Powered by Gemma, open-weight and self-hosted
        </span>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        {/* Hero */}
        <section className="grid items-center gap-12 pt-6 sm:pt-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              <ScanText className="h-3.5 w-3.5" /> Exam prep for NEET, JEE & boards
            </p>
            <h1 className="font-serif text-[2.6rem] font-semibold leading-[1.04] tracking-tight sm:text-6xl">
              Your textbook,
              <br />
              already{" "}
              <span className="relative inline-block">
                <motion.span
                  className="absolute inset-x-[-6px] bottom-[0.08em] h-[0.42em] origin-left -rotate-1 rounded bg-[#ffd43b]/80 dark:bg-[#ffd43b]/35"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.45, duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
                />
                <span className="relative">highlighted.</span>
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Drop in a chapter. StudyPal reads it page by page and marks the definitions, concepts and facts you need
              to remember, right on the page you study from.
            </p>

            <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
              <Feature icon={<BookOpen className="h-4 w-4" />} title="On the real page" text="Not in a chat window." />
              <Feature icon={<Layers className="h-4 w-4" />} title="Reads ahead of you" text="30 pages at a time." />
              <Feature icon={<Cpu className="h-4 w-4" />} title="Your own model" text="Self-hosted Gemma, no per-page fees." />
            </ul>
          </motion.div>

          <PageMock />
        </section>

        {/* Upload */}
        <motion.section
          className="mt-16"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              open(e.dataTransfer.files[0]);
            }}
            className={clsx(
              "group relative flex cursor-pointer flex-col items-center gap-3 overflow-hidden rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-all duration-200",
              "focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/25",
              dragging
                ? "scale-[1.01] border-accent bg-accent/[0.06]"
                : "border-line bg-surface hover:border-accent/50 hover:bg-raised",
            )}
          >
            <input
              ref={input}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => open(e.target.files?.[0])}
            />
            <span
              className={clsx(
                "grid h-14 w-14 place-items-center rounded-2xl bg-accent/10 text-accent transition-transform duration-300",
                dragging ? "-translate-y-1 scale-110" : "group-hover:-translate-y-0.5",
              )}
            >
              {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileUp className="h-6 w-6" />}
            </span>
            <div>
              <p className="text-lg font-semibold">
                {busy ? `Opening ${busy}…` : dragging ? "Drop it here" : "Drop a PDF chapter, or click to choose"}
              </p>
              <p className="mt-1 text-sm text-muted">
                NCERT chapters work great. The first 30 pages are ready in moments, the rest follow as you read.
              </p>
            </div>
            <AnimatePresence>
              {error && (
                <motion.p
                  role="alert"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-1 inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
                >
                  <TriangleAlert className="h-4 w-4" /> {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted">
            {TYPE_ORDER.map((t) => (
              <li key={t} className={clsx("inline-flex items-center gap-1.5", `t-${t}`)}>
                <i className="swatch h-2.5 w-2.5 rounded-[3px]" /> {TYPES[t].label}
              </li>
            ))}
          </ul>
        </motion.section>

        {/* Books */}
        {books && books.length > 0 && (
          <section className="mt-16">
            <h2 className="mb-5 font-serif text-2xl font-semibold tracking-tight">Your books</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {books.map((b, i) => (
                <BookCard key={b.id} book={b} index={i} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface/60 p-3.5 sm:flex-col sm:items-start sm:gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">{icon}</span>
      <span>
        <span className="block font-medium leading-snug">{title}</span>
        <span className="text-muted">{text}</span>
      </span>
    </li>
  );
}

function BookCard({ book, index }: { book: BookSummary; index: number }) {
  const pct = Math.round((100 * book.done) / Math.max(book.pages, 1));
  const hue = parseInt(book.id.slice(0, 6), 16) % 360;
  return (
    <motion.a
      href={`#/book/${book.id}/1`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index }}
      whileHover={{ y: -3 }}
      className="group flex gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-lift focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/25"
    >
      <div
        className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg shadow-card"
        style={{ background: `linear-gradient(150deg, hsl(${hue} 45% 42%), hsl(${(hue + 40) % 360} 50% 28%))` }}
      >
        <span className="absolute inset-y-0 left-1.5 w-px bg-white/25" />
        <span className="absolute bottom-2 left-3 right-2 font-serif text-[11px] font-semibold leading-tight text-white/90">
          {book.title}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate font-serif text-lg font-semibold">{book.title}</p>
        <p className="text-sm text-muted">{book.pages} pages</p>
        <div className="mt-auto">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span>{pct === 100 ? "Fully highlighted" : `${book.done} of ${book.pages} pages highlighted`}</span>
            <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </motion.a>
  );
}

/** A stylised textbook page that highlights itself: the product in one picture. */
const MOCK: { w: string; t?: HType }[] = [
  { w: "94%" }, { w: "88%", t: "definition" }, { w: "70%", t: "definition" }, { w: "96%" }, { w: "62%" },
  { w: "0" },
  { w: "92%" }, { w: "97%", t: "concept" }, { w: "54%", t: "concept" }, { w: "90%" },
  { w: "0" },
  { w: "86%", t: "fact" }, { w: "95%" }, { w: "77%" }, { w: "91%", t: "example" }, { w: "48%" },
];

function PageMock() {
  let order = 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, rotate: 1.5 }}
      animate={{ opacity: 1, y: 0, rotate: 1.5 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="relative mx-auto w-full max-w-md"
      aria-hidden="true"
    >
      <div className="absolute inset-0 translate-x-3 translate-y-3 rotate-2 rounded-2xl border border-line bg-raised" />
      <div className="relative rounded-2xl bg-white p-7 shadow-page sm:p-9">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">Chapter 7</div>
        <div className="mb-5 font-serif text-xl font-semibold text-stone-800">7.2 Immunity</div>
        <div className="space-y-2.5">
          {MOCK.map((line, i) => {
            if (line.w === "0") return <div key={i} className="h-2" />;
            const delay = line.t ? 0.7 + 0.35 * order++ : 0;
            return (
              <div key={i} className="relative h-2.5" style={{ width: line.w }}>
                <div className="absolute inset-0 rounded-full bg-stone-200" />
                {line.t && (
                  <motion.div
                    className={clsx("swatch absolute -inset-x-1 -inset-y-1 origin-left rounded-[4px] opacity-60 mix-blend-multiply", `t-${line.t}`)}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay, duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.2, duration: 0.4 }}
        className="t-definition absolute -left-4 top-[30%] w-56 rounded-xl border border-line bg-surface p-3 shadow-lift sm:-left-10"
      >
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide swatch-strong">
          <i className="swatch h-2 w-2 rounded-sm" /> Definition
        </div>
        <p className="text-[13px] leading-snug text-ink">Core term for this chapter: you'll be asked to define it.</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.1, duration: 0.4 }}
        className="absolute -bottom-5 right-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium shadow-lift"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" /> 4 key points on this page
      </motion.div>
    </motion.div>
  );
}
