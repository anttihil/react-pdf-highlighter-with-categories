import React from "react";

import { Rnd } from "react-rnd";
import { getPageFromElement } from "../lib/pdfjs-dom";

import "../style/AreaHighlight.css";

import type { LTWHP, ViewportHighlight } from "../types.js";

interface Props {
  categoryLabels: Array<{ label: string; background: string }>;
  highlight: ViewportHighlight;
  onChange: (rect: LTWHP) => void;
  comment: {
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
  highlight,
  onChange,
  comment,
  isScrolledTo,
  categoryLabels,
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
            ...highlight.position.boundingRect,
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
          x: highlight.position.boundingRect.left,
          y: highlight.position.boundingRect.top,
        }}
        size={{
          width: highlight.position.boundingRect.width,
          height: highlight.position.boundingRect.height,
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
