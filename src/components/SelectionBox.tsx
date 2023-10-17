import React from "react";
import { getSelectionBoxBoundingRect } from "../lib/selection-utils";
import { Coords, SelectionType } from "../types";

interface SelectionBoxProps {
  start: Coords | null;
  end: Coords | null;
  selectionType: SelectionType;
}
const SelectionBox = ({ start, end, selectionType }: SelectionBoxProps) => {
  if (!start || !end) {
    return null;
  }

  return (
    <div
      className={
        "Selection" + (selectionType === "area" ? " Selection--area" : "")
      }
      style={getSelectionBoxBoundingRect(start, end)}
    />
  );
};

export default SelectionBox;
