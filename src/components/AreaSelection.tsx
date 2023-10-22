import React, { useCallback, useEffect, useState } from "react";

import { asElement, getPageFromElement, isHTMLElement } from "../lib/pdfjs-dom";
import "../style/Selection.css";

import {
  GhostHighlight,
  NewHighlight,
  LTWH,
  Position,
  ScaledPosition,
  SelectionType,
  Coords,
  LTWHP,
} from "../types.js";
import { PDFViewer } from "pdfjs-dist/web/pdf_viewer";
import { viewportToScaled } from "../lib/coordinates";
import { screenshot } from "../lib/screenshot";
import { Tip } from "./Tip";
import {
  getCoordsInContainer,
  getSelectionBoxBoundingRect,
} from "../lib/selection-utils";
import SelectionBox from "./SelectionBox";
import { findOrCreateHighlightLayer } from "../lib/find-or-create-highlight-layer";
import { createPortal } from "react-dom";
import AreaHighlight from "./AreaHighlight";

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

const shouldRender = (boundingRect: LTWH) => {
  return boundingRect.width >= 1 && boundingRect.height >= 1;
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

const AreaSelection = ({
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

  const [areaStart, setAreaStart] = useState<HTMLElement | null>(null);

  const [containerBoundingRect, setContainerBoundingRect] = useState<LTWH>(
    container.getBoundingClientRect()
  );

  const stopSelecting = useCallback(() => {
    setSelectionType("");
    setStartTime(Infinity);
    setStartCoords(null);
    setEndCoords(null);
    setBoxLocked(false);
  }, []);

  const reset = useCallback(() => {
    stopSelecting();
    setPreviewHighlight(null);
  }, [stopSelecting]);

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
    const handleAreaSelectionStart = (event: PointerEvent) => {
      if (selectionType !== "area") return;
      const startElem = asElement(event.target);
      if (
        !isHTMLElement(startElem) ||
        !Boolean(startElem.closest(".page")) ||
        boxLocked
      ) {
        reset();
        return;
      }

      setAreaStart(startElem);

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

    container.addEventListener("pointerdown", handleAreaSelectionStart);

    return () => {
      container.removeEventListener("pointerdown", handleAreaSelectionStart);
    };
  }, [selectionType, container, containerBoundingRect, viewer]);

  useEffect(() => {
    const handleAreaSelectionChange = (event: PointerEvent) => {
      if (
        selectionType !== "area" ||
        !startCoords ||
        boxLocked ||
        shouldRejectShortSelect(event, startTime)
      ) {
        return;
      }

      const { pageX, pageY } = event;

      setEndCoords(
        getCoordsInContainer({
          pageX,
          pageY,
          container,
          containerBoundingRect,
        })
      );

      console.log("area selection change");
    };

    container.addEventListener("pointermove", handleAreaSelectionChange);

    return () => {
      container.removeEventListener("pointermove", handleAreaSelectionChange);
    };
  }, [
    boxLocked,
    container,
    containerBoundingRect,
    selectionType,
    startCoords,
    startTime,
  ]);

  useEffect(() => {
    const handleAreaSelectionFinished = (event: PointerEvent) => {
      console.log("area selection finished, selectionType: " + selectionType);
      if (
        selectionType !== "area" ||
        !startCoords ||
        shouldRejectShortSelect(event, startTime) ||
        !areaStart
      ) {
        reset();
        return;
      }

      console.log("before getPageFromElement");
      const page = getPageFromElement(areaStart);
      if (!page) {
        reset();
        return;
      }

      const { pageX, pageY } = event;
      const end = getCoordsInContainer({
        pageX,
        pageY,
        container,
        containerBoundingRect,
      });

      const selectionBoundingRect = getSelectionBoxBoundingRect(
        startCoords,
        end
      );

      console.log("before shouldRender");
      if (!shouldRender(selectionBoundingRect)) {
        reset();
        return;
      }

      setEndCoords(end);
      setBoxLocked(true);

      const pageBoundingRect = {
        ...selectionBoundingRect,
        top: selectionBoundingRect.top - page.node.offsetTop,
        left: selectionBoundingRect.left - page.node.offsetLeft,
        pageNumber: page.number,
      };

      const viewportPosition = {
        boundingRect: pageBoundingRect,
        rects: [],
        pageNumber: page.number,
      };

      const image = screenshot(
        pageBoundingRect,
        pageBoundingRect.pageNumber,
        viewer
      );

      console.log(
        "viewportPositionToScaled",
        viewportPositionToScaled(viewportPosition, viewer)
      );
      // TODO: have a separate tip for selection and highlight hover, use data instead of setting component
      setTip({
        position: viewportPosition,
        inner: (
          <Tip
            onOpen={() => {
              setPreviewHighlight((prev) => ({
                ...prev,
                position: viewportPosition,
                content: { image },
              }));
              stopSelecting();
            }}
            onConfirm={(comment) => {
              addHighlight({
                content: { image },
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
      console.log("area selection finished");
    };

    container.addEventListener("pointerup", handleAreaSelectionFinished);

    return () => {
      container.removeEventListener("pointerup", handleAreaSelectionFinished);
    };
  }, [
    addHighlight,
    areaStart,
    container,
    selectionType,
    startCoords,
    startTime,
    hideTip,
    setTip,
    categoryLabels,
    reset,
    viewer,
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
            <AreaHighlight
              isScrolledTo={false}
              position={previewHighlight.position}
              categoryLabels={categoryLabels}
              onChange={(boundingRect: LTWHP) => {
                setPreviewHighlight((prev) => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    position: { ...prev.position, boundingRect },
                  };
                });
              }}
            />,
            selectionLayer
          )
        : null}
    </>
  );
};

export default AreaSelection;
