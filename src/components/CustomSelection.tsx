import { PDFViewer } from "pdfjs-dist/web/pdf_viewer";
import React from "react";
import { useEffect, useState, useRef } from "react";
import { getTextNodeAndOffset } from "../lib/selection-range-utils";

interface CustomSelectionProps {
  container?: HTMLDivElement | null;
  onSelectionFailed: () => void;
  onSelectionEnd: () => void;
  viewer: PDFViewer;
}
const CustomSelection = ({
  container,
  onSelectionFailed,
  onSelectionEnd,
  viewer,
}: CustomSelectionProps) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasCtx = useRef<CanvasRenderingContext2D | null>(null);
  const origin = useRef([0, 0]);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const range = useRef<Range>(document.createRange());
  const startTime = useRef(0);

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
      if (!canvasRef.current) return;
      setIsDrawing(true);

      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      origin.current = [x, y];

      startTime.current = e.timeStamp;
    };
    container.addEventListener("pointerdown", handlePointerDown);
    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [container]);

  useEffect(() => {
    if (!container) return;
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDrawing) return;
      e.preventDefault();

      const ctx = canvasCtx.current;
      if (!ctx || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.beginPath();
      ctx.moveTo(origin.current[0], origin.current[1]);
      ctx.lineTo(x, y);
      ctx.stroke();

      // Activate selection after 50ms
      if (e.timeStamp - startTime.current < 50) return;

      const selection = window.getSelection();
      if (!selection) return;

      // Get text layer for the current page
      textLayerRef.current = viewer.getPageView(
        viewer.currentPageNumber - 1
      ).textLayer?.div;
      if (!textLayerRef.current) return;

      if (!isSelecting) {
        setIsSelecting(true);
        // Reset selection
        selection?.empty();
        range.current = document.createRange();
        selection?.addRange(range.current);
      }

      const { textNode, offset } = getTextNodeAndOffset(
        e,
        textLayerRef.current
      );

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
  }, [container, viewer, isDrawing, isSelecting]);

  useEffect(() => {
    if (!container) return;
    function handlePointerUp() {
      if (!isSelecting) {
        return;
      }

      const canvasContext = canvasCtx.current;
      if (!canvasContext) {
        return;
      }

      canvasContext.clearRect(
        0,
        0,
        canvasContext.canvas.width,
        canvasContext.canvas.height
      );
      setIsDrawing(false);
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
