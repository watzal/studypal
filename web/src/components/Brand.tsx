import clsx from "clsx";

/** Wordmark: "Pal" sits on a highlighter stroke, the thing the app does. */
export function Brand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <a href="#/" className={clsx("group inline-flex items-center gap-2.5 select-none", className)} aria-label="StudyPal home">
      <span className="relative grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-accent-ink shadow-card">
        <span className="absolute h-2.5 w-5 -rotate-12 rounded-[3px] bg-[#ffd43b] transition-transform duration-300 group-hover:-rotate-6" />
      </span>
      {!compact && (
        <span className="font-serif text-[1.35rem] font-semibold tracking-tight">
          Study
          <span className="relative">
            <span className="absolute inset-x-[-3px] bottom-[3px] h-[0.55em] -rotate-2 rounded-sm bg-[#ffd43b]/70 dark:bg-[#ffd43b]/40" />
            <span className="relative">Pal</span>
          </span>
        </span>
      )}
    </a>
  );
}
