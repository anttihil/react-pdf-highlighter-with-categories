import { useMemo } from "react";
import {
  IHighlight,
  LTWHP,
  Position,
  ScaledPosition,
  ViewportHighlight,
} from "../types";
import { findOrCreateHighlightLayer } from "../lib/find-or-create-highlight-layer";
import { PDFViewer } from "pdfjs-dist/web/pdf_viewer";
import React from "react";
import Highlight from "./Highlight";
import { scaledPositionToViewport } from "../lib/position-conversion";
import Popup from "./Popup";
import AreaHighlight from "./AreaHighlight";
import { viewportToScaled } from "../lib/coordinates";
import { createPortal } from "react-dom";
import { screenshot } from "../lib/screenshot";

interface Props {
  highlights: IHighlight[];
  visiblePages: number[];
  viewer: PDFViewer;
  scrolledToHighlightId: string;
  categoryLabels: Array<{ label: string; background: string }>;
  setTip: (tip: {
    position: Position | null;
    inner: JSX.Element | null;
  }) => void;
  hideTip: () => void;
  updateHighlight: (
    highlightId: string,
    position: Object,
    content: Object
  ) => void;
}
export const Highlights = ({
  highlights,
  visiblePages,
  viewer,
  scrolledToHighlightId,
  categoryLabels,
  setTip,
  hideTip,
  updateHighlight,
}: Props) => {
  const highlightsByPage = useMemo(() => {
    const groupHighlightsByPage = (
      highlights: Array<IHighlight>
    ): {
      [pageNumber: string]: Array<IHighlight>;
    } => {
      const pageNumbers = new Set<number>();
      for (const highlight of highlights) {
        pageNumbers.add(highlight!.position.pageNumber);
        for (const rect of highlight!.position.rects) {
          if (rect.pageNumber) {
            pageNumbers.add(rect.pageNumber);
          }
        }
      }

      const groupedHighlights = {} as Record<number, any[]>;

      for (const pageNumber of pageNumbers) {
        groupedHighlights[pageNumber] = groupedHighlights[pageNumber] || [];
        for (const highlight of highlights) {
          const pageSpecificHighlight = {
            ...highlight,
            position: {
              pageNumber,
              boundingRect: highlight!.position.boundingRect,
              rects: [],
              usePdfCoordinates: highlight!.position.usePdfCoordinates,
            } as ScaledPosition,
          };
          let anyRectsOnPage = false;
          for (const rect of highlight!.position.rects) {
            if (
              pageNumber === (rect.pageNumber || highlight!.position.pageNumber)
            ) {
              pageSpecificHighlight.position.rects.push(rect);
              anyRectsOnPage = true;
            }
          }
          if (anyRectsOnPage || pageNumber === highlight!.position.pageNumber) {
            groupedHighlights[pageNumber].push(pageSpecificHighlight);
          }
        }
      }

      return groupedHighlights;
    };
    return groupHighlightsByPage(highlights);
  }, [highlights]);

  const highlightLayers = useMemo(
    () =>
      visiblePages.map((pageNumber) => ({
        element: findOrCreateHighlightLayer(pageNumber, viewer),
        pageNumber,
      })),
    [visiblePages, viewer]
  );

  const renderHighlightsOnPage = (pageNumber: number) =>
    (highlightsByPage[String(pageNumber)] || []).map(
      ({ position, id, ...highlight }, index) => {
        const viewportHighlight: ViewportHighlight = {
          id,
          position: scaledPositionToViewport(position, viewer),
          ...highlight,
        };

        const isScrolledTo = Boolean(scrolledToHighlightId === id);

        const isTextHighlight = !Boolean(
          highlight.content && highlight.content.image
        );

        return (
          <Popup
            popupContent={<HighlightPopup {...viewportHighlight} />}
            onMouseOver={(popupContent) => {
              setTip({
                position: viewportHighlight.position,
                inner: popupContent,
              });
            }}
            onMouseOut={hideTip}
            key={index}
          >
            {isTextHighlight ? (
              <Highlight
                isScrolledTo={isScrolledTo}
                position={viewportHighlight.position}
                comment={viewportHighlight.comment}
                categoryLabels={categoryLabels}
              />
            ) : (
              <AreaHighlight
                isScrolledTo={isScrolledTo}
                highlight={viewportHighlight}
                onChange={(boundingRect) => {
                  const rectToScaled = (rect: LTWHP) => {
                    const viewport = viewer.getPageView(
                      (rect.pageNumber || pageNumber) - 1
                    ).viewport;

                    return viewportToScaled(rect, viewport);
                  };
                  const updateImage = (boundingRect: LTWHP) =>
                    screenshot(boundingRect, pageNumber, viewer);
                  updateHighlight(
                    viewportHighlight.id,
                    { boundingRect: rectToScaled(boundingRect) },
                    { image: updateImage(boundingRect) }
                  );
                }}
                comment={highlight.comment}
                categoryLabels={categoryLabels}
              />
            )}
          </Popup>
        );
      }
    );

  return (
    <div>
      {highlightLayers.map(({ element, pageNumber }) => {
        if (!element) return null;
        return createPortal(renderHighlightsOnPage(pageNumber), element);
      })}
    </div>
  );
};

const HighlightPopup = ({
  comment,
}: {
  comment: { text: string; category: string };
}) =>
  comment.text ? (
    <div className="Highlight__popup">
      {comment.category} {comment.text}
    </div>
  ) : null;
