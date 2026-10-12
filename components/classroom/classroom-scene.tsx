import type { ReactNode } from "react";

interface ClassroomSceneProps {
  presenter: ReactNode;
  screenShare?: ReactNode;
  whiteboard?: ReactNode;
  mosaic?: ReactNode;
}

export function ClassroomScene({
  presenter,
  screenShare,
  whiteboard,
  mosaic,
}: ClassroomSceneProps) {
  if (mosaic) return mosaic;
  if (whiteboard) return whiteboard;
  if (screenShare) return screenShare;

  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/chalkboard.png')] opacity-10" />
      {presenter}
    </>
  );
}
