import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassroomHeader } from "@/components/classroom/classroom-header";
import {
  ClassroomLayout,
  ClassroomLayoutControls,
} from "@/components/classroom/classroom-layout";
import { ClassroomScene } from "@/components/classroom/classroom-scene";

describe("ClassroomLayoutControls", () => {
  it("does not mount the standard controls in phone landscape", () => {
    render(
      <ClassroomLayoutControls isPhoneLandscape>
        <span>standard media controls</span>
      </ClassroomLayoutControls>,
    );

    expect(screen.queryByText("standard media controls")).toBeNull();
  });

  it("uses a deterministic desktop grid for recording", () => {
    const { container } = render(
      <ClassroomLayout layoutMode="recording">
        <span>recording canvas</span>
      </ClassroomLayout>,
    );

    expect(container.firstElementChild?.className).toContain(
      "grid-cols-[minmax(0,1fr)_256px]",
    );
    expect(container.firstElementChild?.className).toContain(
      "grid-rows-[3.5rem_minmax(0,1fr)]",
    );
  });

  it("animates and announces recording finalization", () => {
    render(
      <ClassroomHeader
        title="Algebra I"
        isActive
        activeLabel="En vivo"
        waitingLabel="Esperando"
        isRecording={false}
        isFinalizingRecording
        finalizingRecordingLabel="Finalizando grabación…"
        isPhoneLandscape={false}
        isPanelOpen
        openPanelLabel="Abrir panel"
        closePanelLabel="Cerrar panel"
        onPanelOpenChange={() => undefined}
      />,
    );

    const status = screen.getByRole("status", {
      name: "Finalizando grabación…",
    });
    expect(status.textContent).toContain("Finalizando grabación…");
    expect(status.querySelector(".animate-spin")).not.toBeNull();
  });
});

describe("ClassroomScene", () => {
  it("renders only the highest-priority active scene", () => {
    const { rerender } = render(
      <ClassroomScene
        presenter={<span>presenter</span>}
        screenShare={<span>screen share</span>}
        whiteboard={<span>whiteboard</span>}
      />,
    );

    expect(screen.getByText("whiteboard")).toBeTruthy();
    expect(screen.queryByText("screen share")).toBeNull();
    expect(screen.queryByText("presenter")).toBeNull();

    rerender(
      <ClassroomScene
        presenter={<span>presenter</span>}
        screenShare={<span>screen share</span>}
      />,
    );
    expect(screen.getByText("screen share")).toBeTruthy();
    expect(screen.queryByText("presenter")).toBeNull();

    rerender(<ClassroomScene presenter={<span>presenter</span>} />);
    expect(screen.getByText("presenter")).toBeTruthy();
  });
});
