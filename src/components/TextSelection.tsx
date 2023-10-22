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
  Coords,
} from "../types.js";
import {
  addMissingSpacesToSelection,
  getTextNodeAndOffset,
} from "../lib/selection-range-utils";
import { PDFViewer } from "pdfjs-dist/web/pdf_viewer";
import getClientRects from "../lib/get-client-rects";
import getBoundingRect from "../lib/get-bounding-rect";
import { viewportToScaled } from "../lib/coordinates";
import { Tip } from "./Tip";
import { getCoordsInContainer } from "../lib/selection-utils";
import SelectionBox from "./SelectionBox";
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
  const [startCoords, setStartCoords] = useState<Coords | null>(null);
  const [endCoords, setEndCoords] = useState<Coords | null>(null);
  const [boxLocked, setBoxLocked] = useState<boolean>(false);

  const [previewHighlight, setPreviewHighlight] =
    useState<GhostHighlight | null>(null);

  const [startTime, setStartTime] = useState(Infinity);

  const [containerBoundingRect, setContainerBoundingRect] = useState<LTWH>(
    container.getBoundingClientRect()
  );

  const reset = useCallback(() => {
    setSelectionType("");
    setStartTime(Infinity);
    setStartCoords(null);
    setEndCoords(null);
    setBoxLocked(false);
    setPreviewHighlight(null);
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
      if (
        !isHTMLElement(startElem) ||
        !Boolean(startElem.closest(".page")) ||
        boxLocked
      ) {
        reset();
        return;
      }

      if (selectionType === "text") {
        const { textNode, offset } = getTextNodeAndOffset(event, viewer);
        const selection = window.getSelection();
        if (!textNode || !selection) {
          setSelectionType("area");
          return;
        }
        selection.setPosition(textNode, offset);
      }

      setStartTime(event.timeStamp);
      setStartCoords(
        getCoordsInContainer({
          pageX: event.pageX,
          pageY: event.pageY,
          container,
          containerBoundingRect,
        })
      );
      setEndCoords(null);
      setBoxLocked(false);
    };

    container.addEventListener("pointerdown", handlePointerDown);

    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [selectionType, container, containerBoundingRect, viewer]);

  useEffect(() => {
    const handleTextSelectionChange = (event: PointerEvent) => {
      if (
        selectionType !== "text" ||
        !startCoords ||
        boxLocked ||
        shouldRejectShortSelect(event, startTime)
      ) {
        return;
      }

      const { textNode, offset } = getTextNodeAndOffset(event, viewer);
      const selection = window.getSelection();

      if (!textNode || !selection) {
        return;
      }

      selection.extend(textNode, offset);

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

      setEndCoords(
        getCoordsInContainer({
          pageX: event.pageX,
          pageY: event.pageY,
          container,
          containerBoundingRect,
        })
      );
    };

    container.addEventListener("pointermove", handleTextSelectionChange);

    return () => {
      container.removeEventListener("pointermove", handleTextSelectionChange);
    };
  }, [boxLocked, container, selectionType, startCoords, startTime, viewer]);

  useEffect(() => {
    const handleTextSelectionFinished = (event: PointerEvent) => {
      if (
        selectionType !== "text" ||
        !startCoords ||
        shouldRejectShortSelect(event, startTime)
      ) {
        reset();
        return;
      }

      const { textNode, offset } = getTextNodeAndOffset(event, viewer);
      const selection = window.getSelection();

      if (!textNode || !selection || selection.isCollapsed) {
        reset();
        return;
      }

      selection.extend(textNode, offset);

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

      setEndCoords(
        getCoordsInContainer({
          pageX: event.pageX,
          pageY: event.pageY,
          container,
          containerBoundingRect,
        })
      );
      setBoxLocked(true);

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
    startCoords,
    startTime,
  ]);

  const selectionLayer = findOrCreateHighlightLayer(
    previewHighlight?.position.pageNumber || -1,
    viewer
  );

  return (
    <>
      <SelectionBox
        start={startCoords}
        end={endCoords}
        selectionType={selectionType}
      />
      {selectionLayer && previewHighlight
        ? createPortal(
            <Highlight
              isScrolledTo={false}
              position={previewHighlight.position}
              categoryLabels={categoryLabels}
            />,
            selectionLayer
          )
        : null}
    </>
  );
};

export default TextSelection;
