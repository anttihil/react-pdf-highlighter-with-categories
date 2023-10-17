import { Coords, LTWH } from "../types";

export const getSelectionBoxBoundingRect = (
  start: Coords,
  end: Coords
): LTWH => {
  return {
    left: Math.min(end.x, start.x),
    top: Math.min(end.y, start.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
};

export const getCoordsInContainer = (args: {
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
