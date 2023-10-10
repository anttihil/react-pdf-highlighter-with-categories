import { PDFViewer } from "pdfjs-dist/web/pdf_viewer";
import { findOrCreateContainerLayer } from "./pdfjs-dom";

export function findOrCreateHighlightLayer(page: number, viewer: PDFViewer) {
  const { textLayer } = viewer.getPageView(page - 1) || {};

  if (!textLayer) {
    return null;
  }

  return findOrCreateContainerLayer(
    textLayer.div,
    "PdfHighlighter__highlight-layer"
  );
}
