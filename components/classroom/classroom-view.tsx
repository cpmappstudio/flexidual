"use client";

import { RoomAudioRenderer } from "@livekit/components-react";
import { ClassroomLayout, ClassroomLayoutControls } from "./classroom-layout";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

type ClassroomViewProps = ComponentPropsWithoutRef<typeof ClassroomLayout>;

export const ClassroomView = forwardRef<HTMLDivElement, ClassroomViewProps>(
  function ClassroomView({ children, ...props }, ref) {
    return (
      <ClassroomLayout ref={ref} {...props}>
        <RoomAudioRenderer />
        {children}
      </ClassroomLayout>
    );
  },
);

export { ClassroomLayoutControls as ClassroomViewControls };
