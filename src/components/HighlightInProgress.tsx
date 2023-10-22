import React from "react";
import { createPortal } from "react-dom";
import Highlight from "./Highlight";
import AreaHighlight from "./AreaHighlight";
import { findOrCreateHighlightLayer } from "../lib/find-or-create-highlight-layer";
import { PDFViewer } from "pdfjs-dist/web/pdf_viewer";
import { GhostHighlight, LTWHP } from "../types";

interface PreviewHighlightProps {
  previewHighlight: GhostHighlight | null;
  viewer: PDFViewer;
  categoryLabels: Array<{ label: string; background: string }>;
  resizeAreaHighlight: (boundingRect: LTWHP) => void;
}
const PreviewHighlight = ({
  categoryLabels,
  previewHighlight: ghostHighlight,
  viewer,
  resizeAreaHighlight,
}: PreviewHighlightProps) => {
  if (!ghostHighlight) {
    return null;
  }

  const {
    position,
    content: { text },
  } = ghostHighlight;

  const selectionLayer = findOrCreateHighlightLayer(
    position.pageNumber,
    viewer
  );

  if (!selectionLayer) return null;

  return createPortal(
    text ? (
      <Highlight
        isScrolledTo={false}
        position={position}
        categoryLabels={categoryLabels}
      />
    ) : (
      <AreaHighlight
        isScrolledTo={false}
        position={position}
        categoryLabels={categoryLabels}
        onChange={resizeAreaHighlight}
      />
    ),
    selectionLayer
  );
};

export default PreviewHighlight;
