import React from "react";

import "../style/Highlight.css";

import type { LTWHP } from "../types.js";

interface Props {
  categoryLabels: Array<{ label: string; background: string }>;
  comment?: {
    category: string;
    text: string;
  };
  isScrolledTo: boolean;
  isSelecting?: boolean;
  onClick?: () => void;
  onMouseOut?: () => void;
  onMouseOver?: () => void;
  position: {
    boundingRect: LTWHP;
    rects: Array<LTWHP>;
  };
}

const getColor = (
  labels: { label: string; background: string }[],
  isScrolledTo: boolean,
  category?: string
) => {
  const defaultColor = "#ddcc77";
  if (!category) return defaultColor;
  if (isScrolledTo) return "";

  return (
    labels.find((item) => item.label === category)?.background ?? defaultColor
  );
};

export const Highlight = ({
  categoryLabels,
  comment,
  isSelecting,
  isScrolledTo,
  onClick,
  onMouseOut,
  onMouseOver,
  position,
}: Props) => {
  const { rects } = position;

  return (
    <div className={`Highlight ${isScrolledTo ? "Highlight--scrolledTo" : ""}`}>
      <div className="Highlight__parts">
        {rects.map((rect, index) => (
          <div
            onMouseOver={onMouseOver}
            onMouseOut={onMouseOut}
            onClick={onClick}
            key={index}
            style={{
              ...rect,
              backgroundColor: getColor(
                categoryLabels,
                isScrolledTo,
                comment?.category
              ),
            }}
            className={
              "Highlight__part" +
              (isSelecting ? " Highlight__part--preview" : "")
            }
          />
        ))}
      </div>
    </div>
  );
};

export default Highlight;
