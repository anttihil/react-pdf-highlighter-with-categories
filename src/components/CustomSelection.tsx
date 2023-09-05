import React from "react";
import { useEffect, useState, useRef } from "react";

interface CustomSelectionProps {
  container: HTMLDivElement;
  viewerNode: HTMLDivElement;
}
const CustomSelection = ({ container, viewerNode }: CustomSelectionProps) => {
  const [isDrawing, setIsDrawing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasCtx = useRef<CanvasRenderingContext2D | null>(null);

  const origin = useRef([0, 0]);

  function handlePointerDown(this: HTMLDivElement, e: globalThis.PointerEvent) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsDrawing(true);

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    origin.current = [x, y];

    console.log(document.elementFromPoint(e.clientX, e.clientY));
  }

  function handlePointerMove(this: HTMLDivElement, e: globalThis.PointerEvent) {
    e.preventDefault();
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    const ctx = canvasCtx.current;
    if (!ctx || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.beginPath();
    ctx.moveTo(origin.current[0], origin.current[1]);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handlePointerUp(this: HTMLDivElement, e: globalThis.PointerEvent) {
    e.preventDefault();

    const ctx = canvasCtx.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    setIsDrawing(false);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvasCtx.current = canvas.getContext("2d");
    const ctx = canvasCtx.current;
    if (!ctx) return;

    ctx.strokeStyle = "yellow";
    ctx.fillStyle = "blue";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", handlePointerUp);

    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", handlePointerUp);
    };
  }, [container, handlePointerDown, handlePointerMove, handlePointerUp]);

  return (
    <canvas
      ref={canvasRef}
      width={container.clientWidth}
      height={container.clientHeight}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 1000,
        pointerEvents: "none",
      }}
    />
  );
};

export default CustomSelection;
