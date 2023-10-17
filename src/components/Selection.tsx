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
  Coords,
  LTWHP,
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
import { screenshot } from "../lib/screenshot";
import { Tip } from "./Tip";
import {
  getCoordsInContainer,
  getSelectionBoxBoundingRect,
} from "../lib/selection-utils";
import SelectionBox from "./SelectionBox";
import HighlightInProgress from "./HighlightInProgress";

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

  const range = useRef<Range>(document.createRange());

  const [startTime, setStartTime] = useState(Infinity);

  const [areaStartElem, setAreaStartElem] = useState<HTMLElement | null>(null);

  const [startNode, setStartNode] = useState<{
    textNode: Text;
    offset: number;
  } | null>(null);

  const containerBoundingRect = useMemo(
    () => container?.getBoundingClientRect(),
    [container]
  );

  const reset = () => {
    window.getSelection()?.empty();
    onReset();
    setStartTime(Infinity);
    setState({ start: null, end: null, locked: false });
  };

  useEffect(() => {
    const onSelectionChange = () => {
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
      if (!selectionType) return;

      const startElem = asElement(event.target);
      if (
        !isHTMLElement(startElem) ||
        !Boolean(startElem.closest(".page")) ||
        state.locked
      ) {
        reset();
        return;
      }

      if (selectionType === "text") {
        const { textNode, offset } = getTextNodeAndOffset(event, viewer);
        if (!textNode) {
          onTextSelectionFailure();
          return;
        }
        // set text selection start node
        window.getSelection()?.empty();
        setStartNode({ textNode, offset });
      } else {
        // set area selection start element
        setAreaStartElem(startElem);
      }

      setStartTime(event.timeStamp);

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
      if (
        !selectionType ||
        !state.start ||
        state.locked ||
        shouldRejectShortSelect(event, startTime)
      )
        return;

      if (selectionType === "text") {
        const { textNode, offset } = getTextNodeAndOffset(event, viewer);
        if (!textNode || !startNode) return;
        // update text selection end node
        window
          .getSelection()
          ?.setBaseAndExtent(
            startNode.textNode,
            startNode.offset,
            textNode,
            offset
          );
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
    container,
    containerBoundingRect,
    selectionType,
    startNode,
    startTime,
    state,
    viewer,
  ]);

  useEffect(() => {
    if (!container) return;
    const handlePointerUp = (event: PointerEvent) => {
      if (
        !selectionType ||
        !state.start ||
        shouldRejectShortSelect(event, startTime) ||
        !container ||
        !container.contains(asElement(event.target))
      ) {
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
        if (!areaStartElem) {
          reset();
          return;
        }
        const page = getPageFromElement(areaStartElem);
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

        // TODO: have a separate tip for selection and highlight hover, use data instead of setting component
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
    areaStartElem,
    addHighlight,
    hideTip,
    setTip,
  ]);

  return (
    <>
      <SelectionBox
        start={state.start}
        end={state.end}
        selectionType={selectionType}
      />
      <HighlightInProgress
        ghostHighlight={ghostHighlight}
        viewer={viewer}
        categoryLabels={categoryLabels}
        resizeAreaHighlight={(boundingRect: LTWHP) => {
          setGhostHighlight((prev) => {
            if (!prev) return null;
            return { ...prev, position: { ...prev.position, boundingRect } };
          });
        }}
      />
    </>
  );
};

export default Selection;
