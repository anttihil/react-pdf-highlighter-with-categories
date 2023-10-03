import React, {
  Children,
  cloneElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { Position } from "../types";
import { PDFViewer } from "pdfjs-dist/web/pdf_viewer";

interface Props {
  children: JSX.Element | null;
  tipPosition: Position | null;
  viewer: PDFViewer;
}

const clamp = (value: number, left: number, right: number) =>
  Math.min(Math.max(value, left), right);

const TipContainer = ({ children, tipPosition, viewer }: Props) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const node = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!node.current) {
      return;
    }

    const { offsetHeight, offsetWidth } = node.current;

    setSize({
      height: offsetHeight,
      width: offsetWidth,
    });
  }, []);

  // initial position update
  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    if (!node.current) {
      return;
    }
    const observer = new MutationObserver(updatePosition);
    observer.observe(node.current, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }, [updatePosition]);

  if (!tipPosition) return null;

  const { boundingRect, pageNumber } = tipPosition;

  const page = {
    node: viewer.getPageView((boundingRect.pageNumber || pageNumber) - 1).div,
    pageNumber: boundingRect.pageNumber || pageNumber,
  };

  const pageBoundingClientRect = page.node.getBoundingClientRect();

  const { height, width } = size;

  const style = {
    left: page.node.offsetLeft + boundingRect.left + boundingRect.width / 2,
    top: boundingRect.top + page.node.offsetTop,
    bottom: boundingRect.top + page.node.offsetTop + boundingRect.height,
  };

  const scrollTop = viewer.container.scrollTop;

  const shouldMove = style.top - height - 5 < scrollTop;

  const top = shouldMove ? style.bottom + 5 : style.top - height - 5;

  const left = clamp(
    style.left - width / 2,
    0,
    pageBoundingClientRect.width - width
  );

  const isStyleCalculationInProgress = width === 0 && height === 0;

  return (
    <div
      className="PdfHighlighter__tip-container"
      style={{
        visibility: isStyleCalculationInProgress ? "hidden" : "visible",
        top,
        left,
      }}
      ref={node}
    >
      {children &&
        Children.map(children, (child) =>
          cloneElement(child, {
            onUpdate: () => {
              setSize({
                width: 0,
                height: 0,
              });
              setTimeout(updatePosition, 0);
            },
          })
        )}
    </div>
  );
};

export default TipContainer;
