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
  container: HTMLDivElement;
  containerBoundingRect: LTWH;
}) => {
  const { pageX, pageY, container, containerBoundingRect } = args;
  return {
    x: pageX - containerBoundingRect.left + container.scrollLeft,
    y: pageY - containerBoundingRect.top + container.scrollTop - window.scrollY,
  };
};
