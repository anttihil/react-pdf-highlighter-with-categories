import React, { useCallback, useEffect, useState } from "react";

import { asElement, getPagesFromRange, isHTMLElement } from "../lib/pdfjs-dom";
import "../style/Selection.css";

import {
  GhostHighlight,
  NewHighlight,
  LTWH,
  Position,
  ScaledPosition,
  SelectionType,
} from "../types.js";
import {
  addMissingSpacesToSelection,
  getTextAtPoint,
} from "../lib/selection-range-utils";
import { PDFViewer } from "pdfjs-dist/web/pdf_viewer";
import getClientRects from "../lib/get-client-rects";
import getBoundingRect from "../lib/get-bounding-rect";
import { viewportToScaled } from "../lib/coordinates";
import { Tip } from "./Tip";
import { findOrCreateHighlightLayer } from "../lib/find-or-create-highlight-layer";
import { createPortal } from "react-dom";
import Highlight from "./Highlight";

interface Props {
  container: HTMLDivElement;
  setSelectionType: (value: SelectionType) => void;
  categoryLabels: Array<{ label: string; background: string }>;
  viewer: PDFViewer;
  selectionType: SelectionType;
  hideTip: () => void;
  setTip: (tip: {
    position: Position | null;
    inner: JSX.Element | null;
  }) => void;
  addHighlight: (highlight: NewHighlight) => void;
}

const shouldRejectShortSelect = (event: PointerEvent, timestamp: number) => {
  return event.timeStamp - timestamp < 100;
};

const viewportPositionToScaled = (
  { pageNumber, boundingRect, rects }: Position,
  viewer: PDFViewer
): ScaledPosition => {
  const viewport = viewer.getPageView(pageNumber - 1).viewport;

  return {
    boundingRect: viewportToScaled(boundingRect, viewport),
    rects: (rects || []).map((rect) => viewportToScaled(rect, viewport)),
    pageNumber,
  };
};

const TextSelection = ({
  container,
  categoryLabels,
  selectionType,
  viewer,
  setTip,
  addHighlight,
  setSelectionType,
  hideTip,
}: Props) => {
  const [isSelecting, setIsSelecting] = useState<boolean>(false);

  const [previewHighlight, setPreviewHighlight] =
    useState<GhostHighlight | null>(null);

  const [startTime, setStartTime] = useState(Infinity);

  const [containerBoundingRect, setContainerBoundingRect] = useState<LTWH>(
    container.getBoundingClientRect()
  );

  const reset = useCallback(() => {
    setSelectionType("");
    setStartTime(Infinity);
    setPreviewHighlight(null);
    setIsSelecting(false);
    window.getSelection()?.empty();
  }, []);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      setContainerBoundingRect(container.getBoundingClientRect());
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [container]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!selectionType) return;
      const startElem = asElement(event.target);
      if (!isHTMLElement(startElem) || !Boolean(startElem.closest(".page"))) {
        reset();
        return;
      }

      if (selectionType === "text") {
        const { textNode, offset } = getTextAtPoint(event);
        const selection = window.getSelection();
        if (!selection) {
          reset();
          return;
        }
        selection.empty();
        selection.setPosition(textNode, offset);
      }

      setStartTime(event.timeStamp);
      setIsSelecting(true);
    };

    container.addEventListener("pointerdown", handlePointerDown);

    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [selectionType, container, containerBoundingRect, viewer, isSelecting]);

  useEffect(() => {
    const handleTextSelectionChange = (event: PointerEvent) => {
      if (
        selectionType !== "text" ||
        !isSelecting ||
        shouldRejectShortSelect(event, startTime)
      ) {
        return;
      }

      let { textNode, offset } = getTextAtPoint(event);

      if (!textNode) return;

      const selection = window.getSelection();

      if (!selection) {
        return;
      }

      if (!selection.focusNode) {
        selection.setPosition(textNode, offset);
      } else {
        selection.extend(textNode, offset);
      }

      const range = selection.getRangeAt(0);

      const pages = getPagesFromRange(range);

      if (!pages.length) {
        return;
      }

      const rects = getClientRects(range, pages);

      if (!rects.length) {
        return;
      }

      setPreviewHighlight((prev) => ({
        ...prev,
        position: {
          boundingRect: getBoundingRect(rects),
          rects,
          pageNumber: pages[0].number,
        },
        content: { text: "preview" },
      }));
    };

    container.addEventListener("pointermove", handleTextSelectionChange);

    return () => {
      container.removeEventListener("pointermove", handleTextSelectionChange);
    };
  }, [container, selectionType, startTime, viewer]);

  useEffect(() => {
    const handleTextSelectionFinished = (event: PointerEvent) => {
      if (
        selectionType !== "text" ||
        !isSelecting ||
        shouldRejectShortSelect(event, startTime)
      ) {
        reset();
        return;
      }

      const selection = window.getSelection();

      if (!selection || selection.isCollapsed) {
        reset();
        return;
      }

      const range = selection.getRangeAt(0);

      const pages = getPagesFromRange(range);

      if (!pages.length) {
        reset();
        return;
      }

      const rects = getClientRects(range, pages);

      if (!rects.length) {
        reset();
        return;
      }

      const viewportPosition: Position = {
        boundingRect: getBoundingRect(rects),
        rects,
        pageNumber: pages[0].number,
      };

      const content = {
        text: addMissingSpacesToSelection(range) || range.toString(),
      };

      setIsSelecting(false);

      setTip({
        position: viewportPosition,
        inner: (
          <Tip
            onOpen={() => {
              setPreviewHighlight((prev) => ({
                ...prev,
                position: viewportPosition,
                content,
              }));
              reset();
            }}
            onConfirm={(comment) => {
              addHighlight({
                content,
                position: viewportPositionToScaled(viewportPosition, viewer),
                comment,
              });
              setPreviewHighlight(null);
              hideTip();
            }}
            categoryLabels={categoryLabels}
          />
        ),
      });

      setPreviewHighlight((prev) => ({
        ...prev,
        position: {
          boundingRect: getBoundingRect(rects),
          rects,
          pageNumber: pages[0].number,
        },
        content: { text: "preview" },
      }));
    };

    container.addEventListener("pointerup", handleTextSelectionFinished);

    return () => {
      container.removeEventListener("pointerup", handleTextSelectionFinished);
    };
  }, [
    container,
    containerBoundingRect,
    reset,
    selectionType,
    startTime,
    isSelecting,
  ]);

  const selectionLayer = findOrCreateHighlightLayer(
    previewHighlight?.position.pageNumber || -1,
    viewer
  );

  return (
    <>
      {selectionLayer && previewHighlight
        ? createPortal(
            <Highlight
              isScrolledTo={false}
              position={previewHighlight.position}
              categoryLabels={categoryLabels}
              isSelecting={isSelecting}
            />,
            selectionLayer
          )
        : null}
    </>
  );
};

export default TextSelection;
