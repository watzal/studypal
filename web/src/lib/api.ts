import type { BookStatus, BookSummary, PageData } from "./types";

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Something went wrong (${res.status})`);
  return { status: res.status, body };
}

export const listBooks = async () => (await call<BookSummary[]>("/api/books")).body;

export const getBook = async (id: string) => (await call<BookStatus>(`/api/books/${id}`)).body;

export async function uploadBook(file: File) {
  const form = new FormData();
  form.append("file", file);
  return (await call<BookStatus>("/api/books", { method: "POST", body: form })).body;
}

export const visitPage = (id: string, page: number) =>
  call(`/api/books/${id}/visit/${page}`, { method: "POST" });

/** The page's sentences and highlights, or null while it's still being processed. */
export async function getPage(id: string, page: number): Promise<PageData | null> {
  const { status, body } = await call<PageData>(`/api/books/${id}/pages/${page}`);
  return status === 202 ? null : body;
}

export const fileUrl = (id: string) => `/api/books/${id}/file`;
