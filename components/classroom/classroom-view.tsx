"use client";

import { RoomAudioRenderer } from "@livekit/components-react";
import { ClassroomLayout, ClassroomLayoutControls } from "./classroom-layout";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

type ClassroomViewProps = ComponentPropsWithoutRef<typeof ClassroomLayout> & {
  includeRoomAudio?: boolean;
};

export const ClassroomView = forwardRef<HTMLDivElement, ClassroomViewProps>(
  function ClassroomView({ children, includeRoomAudio = true, ...props }, ref) {
    return (
      <ClassroomLayout ref={ref} {...props}>
        {includeRoomAudio && <RoomAudioRenderer />}
        {children}
      </ClassroomLayout>
    );
  },
);

export { ClassroomLayoutControls as ClassroomViewControls };
