import { useMemo } from "react";
import { IHighlight, LTWHP, Position, ScaledPosition } from "../types";
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

type T_ViewportHighlight<Highlight> = { position: Position } & Highlight;

interface Props<Highlight> {
  highlights: Highlight[];
  ghostHighlight?: Highlight;
  visiblePages: number[];
  viewer: PDFViewer;
  tip: {
    highlight: Highlight;
    callback: (highlight: Highlight) => JSX.Element;
  };
  scrolledToHighlightId: string;
  categoryLabels: Array<{ label: string; background: string }>;
  setTip: (position: Position, inner: JSX.Element | null) => void;
  hideTip: () => void;
  updateHighlight: (
    highlightId: string,
    position: Object,
    content: Object
  ) => void;
  popupContent: (highlight: Highlight) => JSX.Element;
  selectionInProgress: boolean;
}
export const Highlights = ({
  highlights,
  ghostHighlight,
  visiblePages,
  viewer,
  tip,
  scrolledToHighlightId,
  categoryLabels,
  setTip,
  hideTip,
  updateHighlight,
  popupContent,
  selectionInProgress,
}: Props<IHighlight>) => {
  const showTip = (
    highlight: T_ViewportHighlight<IHighlight>,
    content: JSX.Element
  ) => {
    if (selectionInProgress) {
      return;
    }

    setTip(highlight.position, content);
  };

  const highlightsByPage = useMemo(() => {
    const groupHighlightsByPage = (
      highlights: Array<IHighlight>,
      ghostHighlight?: IHighlight
    ): {
      [pageNumber: string]: Array<IHighlight>;
    } => {
      const allHighlights = [...highlights, ghostHighlight].filter(Boolean);

      const pageNumbers = new Set<number>();
      for (const highlight of allHighlights) {
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
        for (const highlight of allHighlights) {
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
    return groupHighlightsByPage(highlights, ghostHighlight);
  }, [highlights, ghostHighlight]);

  const highlightLayers = visiblePages.map((pageNumber) => ({
    element: findOrCreateHighlightLayer(pageNumber, viewer),
    pageNumber,
  }));

  return (
    <div>
      {highlightLayers.map(({ element, pageNumber }) => {
        if (!element) return null;
        return createPortal(
          (highlightsByPage[String(pageNumber)] || []).map(
            ({ position, id, ...highlight }, index) => {
              const viewportHighlight: T_ViewportHighlight<IHighlight> = {
                id,
                position: scaledPositionToViewport(position, viewer),
                ...highlight,
              };

              if (tip && tip.highlight.id === String(id)) {
                showTip(viewportHighlight, tip.callback(viewportHighlight));
              }

              const isScrolledTo = Boolean(scrolledToHighlightId === id);

              const isTextHighlight = !Boolean(
                highlight.content && highlight.content.image
              );

              return (
                <Popup
                  popupContent={popupContent(viewportHighlight)}
                  onMouseOver={(popupContent) => {
                    /* const setTip = (highlight, callback) => {
              this.setState({
                tip: { highlight, callback },
              });

              this.showTip(highlight, callback(highlight));
            }, */
                    showTip(viewportHighlight, popupContent);
                  }}
                  /* hideTipAndSelection, */
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
          ),
          element
        );
      })}
    </div>
  );
};
