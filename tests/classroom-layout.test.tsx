import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassroomHeader } from "@/components/classroom/classroom-header";
import { ClassroomLayoutControls } from "@/components/classroom/classroom-layout";

describe("ClassroomLayoutControls", () => {
  it("does not mount the standard controls in phone landscape", () => {
    render(
      <ClassroomLayoutControls isPhoneLandscape>
        <span>standard media controls</span>
      </ClassroomLayoutControls>,
    );

    expect(screen.queryByText("standard media controls")).toBeNull();
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
