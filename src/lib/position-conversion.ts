import { PDFViewer } from "pdfjs-dist/web/pdf_viewer";
import { Position, ScaledPosition } from "../types";
import { scaledToViewport, viewportToScaled } from "./coordinates";

export function viewportPositionToScaled(
  { pageNumber, boundingRect, rects }: Position,
  viewer: PDFViewer
): ScaledPosition {
  const viewport = viewer.getPageView(pageNumber - 1).viewport;

  return {
    boundingRect: viewportToScaled(boundingRect, viewport),
    rects: (rects || []).map((rect) => viewportToScaled(rect, viewport)),
    pageNumber,
  };
}

export function scaledPositionToViewport(
  { pageNumber, boundingRect, rects, usePdfCoordinates }: ScaledPosition,
  viewer: PDFViewer
): Position {
  const viewport = viewer.getPageView(pageNumber - 1).viewport;

  return {
    boundingRect: scaledToViewport(boundingRect, viewport, usePdfCoordinates),
    rects: (rects || []).map((rect) =>
      scaledToViewport(rect, viewport, usePdfCoordinates)
    ),
    pageNumber,
  };
}
