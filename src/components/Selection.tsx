import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  asElement,
  getPageFromElement,
  getPagesFromRange,
  isHTMLElement,
} from "../lib/pdfjs-dom";
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
  getTextNodeAndOffset,
} from "../lib/selection-range-utils";
import { PDFViewer } from "pdfjs-dist/web/pdf_viewer";
import debounce from "lodash.debounce";
import getClientRects from "../lib/get-client-rects";
import getBoundingRect from "../lib/get-bounding-rect";
import { viewportToScaled } from "../lib/coordinates";
import Highlight from "./Highlight";
import { createPortal } from "react-dom";
import { findOrCreateHighlightLayer } from "../lib/find-or-create-highlight-layer";
import { screenshot } from "../lib/screenshot";
import { Tip } from "./Tip";
import AreaHighlight from "./AreaHighlight";

interface Coords {
  x: number;
  y: number;
}

interface State {
  locked: boolean;
  start: Coords | null;
  end: Coords | null;
}

interface Props {
  container: HTMLDivElement | null;
  onTextSelectionFailure: () => void;
  categoryLabels: Array<{ label: string; background: string }>;
  onReset: () => void;
  viewer: PDFViewer;
  selectionType: SelectionType;
  hideTip: () => void;
  setTip: (tip: {
    position: Position | null;
    inner: JSX.Element | null;
  }) => void;
  addHighlight: (highlight: NewHighlight) => void;
}

const getSelectionBoxBoundingRect = (start: Coords, end: Coords): LTWH => {
  return {
    left: Math.min(end.x, start.x),
    top: Math.min(end.y, start.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
};

const getCoordsInContainer = (args: {
  pageX: number;
  pageY: number;
  container: HTMLDivElement | null;
  containerBoundingRect: DOMRect | undefined;
}) => {
  const { pageX, pageY, container, containerBoundingRect } = args;
  if (!container || !containerBoundingRect) {
    return { x: 0, y: 0 };
  }
  return {
    x: pageX - containerBoundingRect.left + container.scrollLeft,
    y: pageY - containerBoundingRect.top + container.scrollTop - window.scrollY,
  };
};

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

const Selection = ({
  container,
  categoryLabels,
  onReset,
  onTextSelectionFailure,
  selectionType,
  viewer,
  setTip,
  addHighlight,
  hideTip,
}: Props) => {
  const [state, setState] = useState<State>({
    locked: false,
    start: null,
    end: null,
  });

  const [isSelectionCollapsed, setSelectionCollapsed] = useState(true);

  const [ghostHighlight, setGhostHighlight] = useState<GhostHighlight | null>(
    null
  );

  const startTarget = useRef<HTMLElement | null>(null);
  const range = useRef<Range>(document.createRange());
  const startTime = useRef(Infinity);
  const [startNode, setStartNode] = useState<{
    textNode: Text;
    offset: number;
  } | null>(null);

  const containerBoundingRect = useMemo(
    () => container?.getBoundingClientRect(),
    [container]
  );

  const reset = () => {
    const selection = window.getSelection();
    selection?.empty();
    onReset();
    startTime.current = Infinity;
    setState({ start: null, end: null, locked: false });
  };

  useEffect(() => {
    const onSelectionChange = (e: Event) => {
      const selection = window.getSelection();
      if (!selection) {
        return;
      }

      const updatedRange =
        selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

      if (selection.isCollapsed) {
        setSelectionCollapsed(true);
        return;
      }

      if (
        !updatedRange ||
        !container ||
        !container.contains(updatedRange.commonAncestorContainer)
      ) {
        return;
      }

      setSelectionCollapsed(false);
      range.current = updatedRange;

      debounce(() => {
        if (!range.current || isSelectionCollapsed) {
          return;
        }

        const pages = getPagesFromRange(range.current);

        if (!pages || pages.length === 0) {
          return;
        }

        const rects = getClientRects(range.current, pages);

        if (rects.length === 0) {
          return;
        }
        const boundingRect = getBoundingRect(rects);

        const viewportPosition: Position = {
          boundingRect,
          rects,
          pageNumber: pages[0].number,
        };

        const content = {
          text: addMissingSpacesToSelection(range.current) || range.toString(),
        };
        const scaledPosition = viewportPositionToScaled(
          viewportPosition,
          viewer
        );

        setTip({
          position: viewportPosition,
          inner: (
            <Tip
              onOpen={() => {
                setGhostHighlight((prev) => ({
                  ...prev,
                  position: viewportPosition,
                  content,
                }));
                reset();
              }}
              onConfirm={(comment) => {
                addHighlight({ content, position: scaledPosition, comment });
                hideTip();
              }}
              categoryLabels={categoryLabels}
            />
          ),
        });
      }, 100)();
    };

    document.addEventListener("selectionchange", onSelectionChange);

    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [container, viewer, isSelectionCollapsed]);

  useEffect(() => {
    if (!container) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        !selectionType ||
        !isHTMLElement(event.target) ||
        !Boolean(asElement(event.target).closest(".page")) ||
        state.locked
      ) {
        reset();
        return;
      }
      startTarget.current = asElement(event.target);
      if (!isHTMLElement(startTarget.current)) {
        return;
      }
      if (selectionType === "text") {
        const { textNode, offset } = getTextNodeAndOffset(event, viewer);
        if (textNode) {
          // go into text selection mode
          const selection = window.getSelection();
          selection?.empty();
          setStartNode({ textNode, offset });
        } else {
          onTextSelectionFailure();
        }
      }

      startTime.current = event.timeStamp;

      // init selection box
      const { pageX, pageY } = event;
      setState({
        start: getCoordsInContainer({
          pageX,
          pageY,
          container,
          containerBoundingRect,
        }),
        end: null,
        locked: false,
      });
    };

    container.addEventListener("pointerdown", handlePointerDown);

    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [selectionType, container, containerBoundingRect, viewer]);

  useEffect(() => {
    if (!container) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!selectionType || !state.start || state.locked || !startNode) return;

      if (shouldRejectShortSelect(event, startTime.current)) return;

      if (selectionType === "text") {
        const { textNode, offset } = getTextNodeAndOffset(event, viewer);
        if (textNode) {
          const selection = window.getSelection();

          selection?.setBaseAndExtent(
            startNode.textNode,
            startNode.offset,
            textNode,
            offset
          );
        }
      }

      const { pageX, pageY } = event;

      setState((prev) => ({
        ...prev,
        end: getCoordsInContainer({
          pageX,
          pageY,
          container,
          containerBoundingRect,
        }),
      }));
    };

    container.addEventListener("pointermove", handlePointerMove);

    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
    };
  }, [
    selectionType,
    state,
    container,
    containerBoundingRect,
    viewer,
    startNode,
  ]);

  useEffect(() => {
    if (!container) return;
    const handlePointerUp = (event: PointerEvent) => {
      if (
        !selectionType ||
        !state.start ||
        shouldRejectShortSelect(event, startTime.current) ||
        !container ||
        !container.contains(asElement(event.target))
      ) {
        return;
      }

      const { pageX, pageY } = event;
      const end = getCoordsInContainer({
        pageX,
        pageY,
        container,
        containerBoundingRect,
      });

      const boundingRect = getSelectionBoxBoundingRect(state.start, end);

      if (!shouldRender(boundingRect)) {
        reset();
        return;
      }

      setState((prev) => ({ ...prev, end, locked: true }));

      if (selectionType === "text") {
        if (!startNode) {
          reset();
          return;
        }
        window
          .getSelection()
          ?.setBaseAndExtent(
            startNode.textNode,
            startNode.offset,
            startNode.textNode,
            startNode.offset
          );
      } else {
        if (!startTarget.current) {
          reset();
          return;
        }
        const page = getPageFromElement(startTarget.current);
        if (!page || !viewer) {
          return;
        }

        const pageBoundingRect = {
          ...boundingRect,
          top: boundingRect.top - page.node.offsetTop,
          left: boundingRect.left - page.node.offsetLeft,
          pageNumber: page.number,
        };

        const viewportPosition = {
          boundingRect: pageBoundingRect,
          rects: [],
          pageNumber: page.number,
        };

        const scaledPosition = viewportPositionToScaled(
          viewportPosition,
          viewer
        );

        const image = screenshot(
          pageBoundingRect,
          pageBoundingRect.pageNumber,
          viewer
        );

        setTip({
          position: viewportPosition,
          inner: (
            <Tip
              onOpen={() => {
                setGhostHighlight((prev) => ({
                  ...prev,
                  position: viewportPosition,
                  content: { image },
                }));
                reset();
              }}
              onConfirm={(comment) => {
                addHighlight({
                  content: { image },
                  position: scaledPosition,
                  comment,
                });
                hideTip();
              }}
              categoryLabels={categoryLabels}
            />
          ),
        });
      }
    };

    container.addEventListener("pointerup", handlePointerUp);

    return () => {
      container.removeEventListener("pointerup", handlePointerUp);
    };
  }, [
    container,
    state.start,
    containerBoundingRect,
    selectionType,
    categoryLabels,
    startNode,
    viewer,
  ]);

  const renderGhostHighlight = () => {
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

  return (
    <>
      {state.start && state.end ? (
        <div
          className={
            "Selection" + (selectionType === "area" ? " Selection--area" : "")
          }
          style={getSelectionBoxBoundingRect(state.start, state.end)}
        />
      ) : null}
      {renderGhostHighlight()}
    </>
  );
};

export default Selection;
