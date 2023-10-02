import { PDFViewer } from "pdfjs-dist/web/pdf_viewer";
import React, { useMemo } from "react";
import { useEffect, useState, useRef } from "react";
import { getTextNodeAndOffset } from "../lib/selection-range-utils";
interface CustomSelectionProps {
  container: HTMLDivElement | null;
  onSelectionFailed: () => void;
  onSelectionEnd: () => void;
  viewer: PDFViewer;
}

const getEventCanvasCoordinates = (e: PointerEvent, rect: DOMRect) => {
  return [e.clientX - rect.left, e.clientY - rect.top];
};

const drawLine = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) => {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
};

const getCurrentTextLayer = (viewer: PDFViewer) => {
  return viewer.getPageView(viewer.currentPageNumber - 1).textLayer?.div;
};

const CustomSelection = ({
  container,
  onSelectionFailed,
  onSelectionEnd,
  viewer,
}: CustomSelectionProps) => {
  const [isSelecting, setIsSelecting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasCtx = useRef<CanvasRenderingContext2D | null>(null);
  const origin = useRef([0, 0]);
  const range = useRef<Range>(document.createRange());
  const drawStartTime = useRef(Infinity);

  const canvasDOMRect = useMemo(() => {
    if (!canvasRef.current) return null;
    return canvasRef.current.getBoundingClientRect();
  }, [canvasRef.current]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvasCtx.current = canvas.getContext("2d");

    const ctx = canvasCtx.current;
    if (!ctx) return;

    ctx.strokeStyle = "yellow";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    return () => {
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, []);

  useEffect(() => {
    if (!container) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!canvasDOMRect) return;
      origin.current = getEventCanvasCoordinates(e, canvasDOMRect);
      drawStartTime.current = e.timeStamp;
    };
    container.addEventListener("pointerdown", handlePointerDown);
    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [container, canvasDOMRect]);

  useEffect(() => {
    if (!container) return;
    const handlePointerMove = (e: PointerEvent) => {
      // Activate drawing and selecting after 50ms
      if (e.timeStamp - drawStartTime.current < 50) return;

      // disable normal selection and scrolling for mobile
      e.preventDefault();

      const ctx = canvasCtx.current;
      if (!ctx || !canvasDOMRect) return;

      const [x1, y1] = origin.current;
      const [x2, y2] = getEventCanvasCoordinates(e, canvasDOMRect);
      drawLine(ctx, x1, y1, x2, y2);

      const selection = window.getSelection();
      if (!selection) return;

      // initialize selection
      if (!isSelecting) {
        setIsSelecting(true);
        // Reset selection
        selection.empty();
        range.current = document.createRange();
        selection.addRange(range.current);
      }

      const textLayer = getCurrentTextLayer(viewer);
      if (!textLayer) return;

      const { textNode, offset } = getTextNodeAndOffset(e, textLayer);
      if (textNode) {
        isSelecting
          ? range.current?.setEnd(textNode, offset)
          : range.current?.setStart(textNode, offset);
        return;
      }

      // if we don't find anything, we enable area selection
      if (isSelecting) {
        onSelectionFailed();
      }
    };

    container.addEventListener("pointermove", handlePointerMove);
    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
    };
  }, [container, viewer, isSelecting, canvasDOMRect, onSelectionFailed]);

  useEffect(() => {
    if (!container) return;
    function handlePointerUp() {
      drawStartTime.current = Infinity;

      if (!isSelecting) return;

      const canvasContext = canvasCtx.current;
      if (!canvasContext) return;

      canvasContext.clearRect(
        0,
        0,
        canvasContext.canvas.width,
        canvasContext.canvas.height
      );

      setIsSelecting(false);
      onSelectionEnd();
    }
    container.addEventListener("pointerup", handlePointerUp);
    return () => {
      container.removeEventListener("pointerup", handlePointerUp);
    };
  }, [container, isSelecting, onSelectionEnd]);

  return (
    <canvas
      ref={canvasRef}
      width={container?.clientWidth ?? 0}
      height={container?.clientHeight ?? 0}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 1000,
        // pass through pointer events to the viewer
        pointerEvents: "none",
      }}
    />
  );
};

export default CustomSelection;
