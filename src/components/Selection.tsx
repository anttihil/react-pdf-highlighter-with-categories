import React from "react";

import "../style/Selection.css";

import { NewHighlight, Position, SelectionType } from "../types.js";

import { PDFViewer } from "pdfjs-dist/web/pdf_viewer";

import TextSelection from "./TextSelection";
import AreaSelection from "./AreaSelection";

interface Props {
  container: HTMLDivElement;
  setSelectionType: (value: SelectionType) => void;
  categoryLabels: Array<{ label: string; background: string }>;
  viewer: PDFViewer;
  selectionType: SelectionType;
  hideTip: () => void;
  setTip: (tip: {
    position: Position | null;
    inner: JSX.Element | null;
  }) => void;
  addHighlight: (highlight: NewHighlight) => void;
}

const Selection = ({
  container,
  categoryLabels,
  selectionType,
  viewer,
  setTip,
  addHighlight,
  setSelectionType,
  hideTip,
}: Props) => {
  switch (selectionType) {
    case "text":
      return (
        <TextSelection
          container={container}
          categoryLabels={categoryLabels}
          viewer={viewer}
          selectionType={selectionType}
          setTip={setTip}
          addHighlight={addHighlight}
          setSelectionType={setSelectionType}
          hideTip={hideTip}
        />
      );
    case "area":
      return (
        <AreaSelection
          container={container}
          categoryLabels={categoryLabels}
          viewer={viewer}
          selectionType={selectionType}
          setTip={setTip}
          addHighlight={addHighlight}
          setSelectionType={setSelectionType}
          hideTip={hideTip}
        />
      );
    default:
      return null;
  }
};

export default Selection;
