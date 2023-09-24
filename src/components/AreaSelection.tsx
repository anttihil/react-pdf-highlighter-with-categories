import React, { useEffect, useMemo, useRef, useState } from "react";

import { asElement, isHTMLElement } from "../lib/pdfjs-dom";
import "../style/AreaSelection.css";

import type { LTWH } from "../types.js";

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
  onSelection: (
    startTarget: HTMLElement,
    boundingRect: LTWH,
    resetSelection: () => void,
    categoryLabels: Array<{ label: string; background: string }>
  ) => void;
  onChange: (isVisible: boolean) => void;
  categoryLabels: Array<{ label: string; background: string }>;
  disableTextSelection: (value: boolean) => void;
  resetSelectionType: () => void;
}

const getBoundingRect = (start: Coords, end: Coords): LTWH => {
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

const shouldRender = (boundingRect: LTWH) => {
  return boundingRect.width >= 1 && boundingRect.height >= 1;
};

const AreaSelection = ({
  container,
  disableTextSelection,
  onChange,
  categoryLabels,
  onSelection,
}: Props) => {
  const [state, setState] = useState<State>({
    locked: false,
    start: null,
    end: null,
  });

  const startTarget = useRef<HTMLElement | null>(null);

  const containerBoundingRect = useMemo(
    () => container?.getBoundingClientRect(),
    [container]
  );

  const reset = () => {
    disableTextSelection(false);
    setState({ start: null, end: null, locked: false });
  };

  useEffect(() => {
    const { start, end } = state;

    // start && end means that the selection is visible
    onChange(Boolean(start && end));
  }, [state.start, state.end, onChange]);

  useEffect(() => {
    if (!container) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        !isHTMLElement(event.target) ||
        !Boolean(asElement(event.target).closest(".page"))
      ) {
        disableTextSelection(false);
        setState({ start: null, end: null, locked: false });
        return;
      }

      startTarget.current = asElement(event.target);
      if (!isHTMLElement(startTarget.current)) {
        return;
      }

      disableTextSelection(true);

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
  }, [container, containerBoundingRect, disableTextSelection]);

  useEffect(() => {
    if (!container) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!state.start || state.locked) return;
      const { pageX, pageY } = event;
      setState({
        ...state,
        end: getContainerCoords({
          pageX,
          pageY,
          container,
          containerBoundingRect,
        }),
      });
    };

    container.addEventListener("pointermove", handlePointerMove);

    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
    };
  }, [state.start, state.locked, container, containerBoundingRect]);

  useEffect(() => {
    const handlePointerUp = (event: PointerEvent): void => {
      if (!container || !state.start) return;

      const { pageX, pageY } = event;
      const end = getContainerCoords({
        pageX,
        pageY,
        container,
        containerBoundingRect,
      });

      const boundingRect = getBoundingRect(state.start, end);

      if (
        !isHTMLElement(event.target) ||
        !container.contains(asElement(event.target)) ||
        !shouldRender(boundingRect)
      ) {
        reset();
        return;
      }

      setState((prev) => ({ ...prev, end, locked: true }));

      if (!state.start || !end || !startTarget.current) return;

      if (isHTMLElement(event.target)) {
        onSelection(startTarget.current, boundingRect, reset, categoryLabels);
        disableTextSelection(false);
      }
    };

    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [
    onSelection,
    disableTextSelection,
    container,
    state.start,
    containerBoundingRect,
  ]);

  return (
    <>
      {state.start && state.end ? (
        <div
          className="AreaSelection"
          style={getBoundingRect(state.start, state.end)}
        />
      ) : null}
    </>
  );
};

export default AreaSelection;
