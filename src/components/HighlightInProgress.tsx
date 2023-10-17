import React from "react";
import { createPortal } from "react-dom";
import Highlight from "./Highlight";
import AreaHighlight from "./AreaHighlight";
import { findOrCreateHighlightLayer } from "../lib/find-or-create-highlight-layer";
import { PDFViewer } from "pdfjs-dist/web/pdf_viewer";
import { GhostHighlight } from "../types";

interface HighlightInProgressProps {
  ghostHighlight: GhostHighlight | null;
  viewer: PDFViewer;
  categoryLabels: Array<{ label: string; background: string }>;
}
const HighlightInProgress = ({
  categoryLabels,
  ghostHighlight,
  viewer,
}: HighlightInProgressProps) => {
  if (!ghostHighlight) {
    return null;
  }

  const {
    position,
    content: { image, text },
  } = ghostHighlight;

  const selectionLayer = findOrCreateHighlightLayer(
    position.pageNumber,
    viewer
  );

  if (!selectionLayer || !(image || text)) return null;

  return createPortal(
    text ? (
      <Highlight
        isScrolledTo={false}
        position={ghostHighlight.position}
        categoryLabels={categoryLabels}
      />
    ) : (
      <AreaHighlight
        isScrolledTo={false}
        highlight={ghostHighlight}
        categoryLabels={categoryLabels}
        onChange={() => {}}
      />
    ),
    selectionLayer
  );
};

export default HighlightInProgress;
