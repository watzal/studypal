export type HType = "concept" | "definition" | "fact" | "formula" | "example";

export const TYPES: Record<HType, { label: string; plural: string }> = {
  concept: { label: "Key concept", plural: "Concepts" },
  definition: { label: "Definition", plural: "Definitions" },
  fact: { label: "Fact", plural: "Facts" },
  formula: { label: "Formula", plural: "Formulas" },
  example: { label: "Example", plural: "Examples" },
};
export const TYPE_ORDER = Object.keys(TYPES) as HType[];

export type Rect = [number, number, number, number];

export interface Sentence {
  id: string;
  page: number;
  text: string;
  rects: Rect[]; // PDF points, top-left origin
}

export interface Highlight {
  id: string;
  type: HType;
  why: string;
}

export interface PageData {
  page: number;
  sentences: Sentence[];
  highlights: Highlight[];
  engine: "llm" | "rules";
  seconds: number;
  error?: string;
}

export interface BookSummary {
  id: string;
  title: string;
  pages: number;
  done: number;
}

export interface BookStatus extends BookSummary {
  errors: number;
  done_pages: number[];
}

/** Must match book.py: pages are processed in chunks, the next one starting at PREFETCH_AT. */
export const CHUNK = 30;
export const PREFETCH_AT = 25;
