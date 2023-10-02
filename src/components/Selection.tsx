import React, { useEffect, useMemo, useRef, useState } from "react";

import { asElement, getPagesFromRange, isHTMLElement } from "../lib/pdfjs-dom";
import "../style/Selection.css";

import type {
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
  onSelection: (
    startTarget: HTMLElement,
    boundingRect: LTWH,
    resetSelection: () => void,
    categoryLabels: Array<{ label: string; background: string }>
  ) => void;
  onChange: (isVisible: boolean) => void;
  categoryLabels: Array<{ label: string; background: string }>;
  onReset: () => void;
  viewer: PDFViewer;
  selectionType: SelectionType;
  onTextSelectionChange: (
    viewportPosition: Position,
    scaledPosition: ScaledPosition,
    content: { text: string }
  ) => void;
}

const getSelectionBoxBoundingRect = (start: Coords, end: Coords): LTWH => {
  return {
    left: Math.min(end.x, start.x),
    top: Math.min(end.y, start.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
};

const getContainerCoords = (args: {
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
  onChange,
  categoryLabels,
  onReset,
  onSelection,
  onTextSelectionFailure,
  onTextSelectionChange,
  selectionType,
  viewer,
}: Props) => {
  const [state, setState] = useState<State>({
    locked: false,
    start: null,
    end: null,
  });

  const [isSelectionCollapsed, setSelectionCollapsed] = useState(true);

  const startTarget = useRef<HTMLElement | null>(null);
  const range = useRef<Range>(document.createRange());
  const startTime = useRef(Infinity);

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

        onTextSelectionChange(viewportPosition, scaledPosition, content);
      }, 500)();
    };

    document.addEventListener("selectionchange", onSelectionChange);

    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [container, range.current, viewer, isSelectionCollapsed]);

  useEffect(() => {
    const { start, end } = state;

    // start && end means that the selection is visible
    onChange(Boolean(start && end));
  }, [state.start, state.end, onChange]);

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
          range.current = document.createRange();
          // TODO: instead of adding a range, save start node and offset and use Selection.setBaseAndExtent on move and up
          selection?.addRange(range.current);
          range.current.setStart(textNode, offset);
        } else {
          onTextSelectionFailure();
        }
      }

      startTime.current = event.timeStamp;

      // init selection box
      const { pageX, pageY } = event;
      setState({
        start: getContainerCoords({
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
      if (!selectionType || !state.start || state.locked) return;

      if (shouldRejectShortSelect(event, startTime.current)) return;

      if (selectionType === "text") {
        const { textNode, offset } = getTextNodeAndOffset(event, viewer);
        if (textNode) {
          range.current?.setEnd(textNode, offset);
        }
      }

      const { pageX, pageY } = event;

      setState((prev) => ({
        ...prev,
        end: getContainerCoords({
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
  }, [selectionType, state, container, containerBoundingRect]);

  useEffect(() => {
    const handlePointerUp = (event: PointerEvent): void => {
      if (
        !selectionType ||
        !container ||
        !state.start ||
        shouldRejectShortSelect(event, startTime.current)
      ) {
        reset();
        return;
      }
      const { pageX, pageY } = event;
      const end = getContainerCoords({
        pageX,
        pageY,
        container,
        containerBoundingRect,
      });

      const boundingRect = getSelectionBoxBoundingRect(state.start, end);

      if (
        !isHTMLElement(event.target) ||
        !container.contains(asElement(event.target)) ||
        !shouldRender(boundingRect)
      ) {
        reset();
        return;
      }

      if (selectionType === "text") {
        const { textNode, offset } = getTextNodeAndOffset(event, viewer);
        if (textNode) {
          range.current?.setEnd(textNode, offset);
        }
      }

      setState((prev) => ({ ...prev, end, locked: true }));

      if (!state.start || !end || !startTarget.current) return;

      if (isHTMLElement(event.target)) {
        onSelection(startTarget.current, boundingRect, reset, categoryLabels);
      }
    };

    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [
    onSelection,
    container,
    state.start,
    containerBoundingRect,
    selectionType,
  ]);

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
    </>
  );
};

export default Selection;
