import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PDFDoc = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
export type PDFPage = Awaited<ReturnType<PDFDoc["getPage"]>>;
export type RenderTask = ReturnType<PDFPage["render"]>;

export { pdfjs };

/** Render a page into a fresh canvas `cssWidth` pixels wide. Resolves when drawn. */
export function renderToCanvas(page: PDFPage, cssWidth: number, maxScale = Infinity) {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(cssWidth / base.width, maxScale);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: scale * dpr });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  const task: RenderTask = page.render({ canvasContext: canvas.getContext("2d")!, viewport });
  return {
    canvas,
    scale,
    width: base.width * scale,
    height: base.height * scale,
    task,
  };
}
