import React from "react";

import { Rnd } from "react-rnd";
import { getPageFromElement } from "../lib/pdfjs-dom";

import "../style/AreaHighlight.css";

import type { LTWHP, Position } from "../types.js";

interface Props {
  categoryLabels: Array<{ label: string; background: string }>;
  position: Position;
  onChange: (rect: LTWHP) => void;
  comment?: {
    category: string;
    text: string;
  };
  isScrolledTo: boolean;
}

const getColor = (
  labels: { label: string; background: string }[],
  isScrolledTo: boolean,
  category?: string
): string => {
  const defaultColor = "#ddcc77";
  if (!category) return defaultColor;

  if (isScrolledTo) return "";

  return (
    labels.find((item) => item.label === category)?.background ?? defaultColor
  );
};

export const AreaHighlight = ({
  onChange,
  comment,
  isScrolledTo,
  categoryLabels,
  position,
  ...otherProps
}: Props) => {
  return (
    <div
      className={`AreaHighlight ${
        isScrolledTo ? "AreaHighlight--scrolledTo" : ""
      }`}
    >
      <Rnd
        className="AreaHighlight__part"
        onDragStop={(_, data) => {
          const boundingRect: LTWHP = {
            ...position.boundingRect,
            top: data.y,
            left: data.x,
          };

          onChange(boundingRect);
        }}
        onResizeStop={(_mouseEvent, _direction, ref, _delta, position) => {
          const boundingRect: LTWHP = {
            top: position.y,
            left: position.x,
            width: ref.offsetWidth,
            height: ref.offsetHeight,
            pageNumber: getPageFromElement(ref)?.number || -1,
          };

          onChange(boundingRect);
        }}
        position={{
          x: position.boundingRect.left,
          y: position.boundingRect.top,
        }}
        size={{
          width: position.boundingRect.width,
          height: position.boundingRect.height,
        }}
        onClick={(event: Event) => {
          event.stopPropagation();
          event.preventDefault();
        }}
        {...otherProps}
        style={{
          backgroundColor: getColor(
            categoryLabels,
            isScrolledTo,
            comment?.category
          ),
        }}
      />
    </div>
  );
};

export default AreaHighlight;
