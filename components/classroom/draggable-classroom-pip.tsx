"use client";

import { Move } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

const PIP_WIDTH = 192;
const PIP_HEIGHT = 144;
const PIP_MARGIN = 12;

interface DraggableClassroomPipProps {
  children: ReactNode;
  containerRef: RefObject<HTMLDivElement | null>;
}

export function DraggableClassroomPip({
  children,
  containerRef,
}: DraggableClassroomPipProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const dragRef = useRef({
    active: false,
    startMouse: { x: 0, y: 0 },
    startPosition: { x: 0, y: 0 },
  });

  const clampPosition = useCallback(
    (x: number, y: number) => {
      const container = containerRef.current;
      if (!container) return { x, y };

      return {
        x: Math.max(
          PIP_MARGIN,
          Math.min(container.offsetWidth - PIP_WIDTH - PIP_MARGIN, x),
        ),
        y: Math.max(
          PIP_MARGIN,
          Math.min(container.offsetHeight - PIP_HEIGHT - PIP_MARGIN, y),
        ),
      };
    },
    [containerRef],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setPosition({
      x: PIP_MARGIN,
      y: container.offsetHeight - PIP_HEIGHT - PIP_MARGIN,
    });
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      setPosition((currentPosition) => {
        if (!currentPosition) return currentPosition;
        return clampPosition(currentPosition.x, currentPosition.y);
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [clampPosition, containerRef]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragRef.current.active) return;
      const deltaX = event.clientX - dragRef.current.startMouse.x;
      const deltaY = event.clientY - dragRef.current.startMouse.y;
      setPosition(
        clampPosition(
          dragRef.current.startPosition.x + deltaX,
          dragRef.current.startPosition.y + deltaY,
        ),
      );
    };
    const handleMouseUp = () => {
      dragRef.current.active = false;
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!dragRef.current.active) return;
      event.preventDefault();
      const touch = event.touches[0];
      const deltaX = touch.clientX - dragRef.current.startMouse.x;
      const deltaY = touch.clientY - dragRef.current.startMouse.y;
      setPosition(
        clampPosition(
          dragRef.current.startPosition.x + deltaX,
          dragRef.current.startPosition.y + deltaY,
        ),
      );
    };
    const handleTouchEnd = () => {
      dragRef.current.active = false;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [clampPosition]);

  if (!position) return null;

  return (
    <div
      style={{
        left: position.x,
        top: position.y,
        width: PIP_WIDTH,
        height: PIP_HEIGHT,
      }}
      className="absolute z-50 cursor-move select-none overflow-hidden rounded-md bg-muted shadow-xl"
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        dragRef.current = {
          active: true,
          startMouse: { x: event.clientX, y: event.clientY },
          startPosition: { ...position },
        };
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        dragRef.current = {
          active: true,
          startMouse: { x: touch.clientX, y: touch.clientY },
          startPosition: { ...position },
        };
      }}
    >
      {children}
      <div className="absolute top-1 right-1 p-1 bg-background/50 rounded-full pointer-events-none">
        <Move className="w-3 h-3 text-foreground/70" />
      </div>
    </div>
  );
}
