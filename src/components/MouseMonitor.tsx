import React, { useEffect, useRef } from "react";

interface Props {
  onMoveAway?: () => void;
  paddingX: number;
  paddingY: number;
  children: JSX.Element;
}

const MouseMonitor = ({ onMoveAway, paddingX, paddingY, children }: Props) => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const { current } = container;
      if (!current) {
        return;
      }

      const { clientX, clientY } = event;

      // TODO: see if possible to optimize
      const { left, top, width, height } = current.getBoundingClientRect();

      const inBoundsX =
        clientX > left - paddingX && clientX < left + width + paddingX;
      const inBoundsY =
        clientY > top - paddingY && clientY < top + height + paddingY;

      const isNear = inBoundsX && inBoundsY;

      if (!isNear) {
        onMoveAway?.();
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [onMoveAway, paddingX, paddingY]);

  return (
    <div className="MouseMonitor" ref={container}>
      {children}
    </div>
  );
};

export default MouseMonitor;
