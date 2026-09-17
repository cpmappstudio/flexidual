import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClassroomSessionOutlet,
  ClassroomSessionProvider,
} from "@/components/classroom/classroom-session-provider";
import { useClassroomPresentation } from "@/components/classroom/classroom-presentation";
import { ClassroomWindowControls } from "@/components/classroom/classroom-window-controls";

const state = vi.hoisted(() => ({
  pathname: "/es/school/classroom/room-1",
  push: vi.fn(),
  mounts: vi.fn(),
  unmounts: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: state.push }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/classroom/flexi-classroom-client", () => ({
  default: function Classroom() {
    const presentation = useClassroomPresentation()!;
    const report = presentation.reportPersistence;
    useEffect(() => {
      state.mounts();
      report({ canPersist: true, needsFullView: false });
      return () => { state.unmounts(); };
    }, [report]);
    return (
      <>
        <input aria-label="Whiteboard state" defaultValue="" />
        <span data-testid="presentation-mode">{presentation.mode}</span>
        <ClassroomWindowControls compact={presentation.mode === "compact"} />
      </>
    );
  },
}));

function View({ classroom = true }: { classroom?: boolean }) {
  return (
    <ClassroomSessionProvider>
      {classroom && (
        <ClassroomSessionOutlet
          roomName="room-1"
          classroomPath="/es/school/classroom/room-1"
        />
      )}
    </ClassroomSessionProvider>
  );
}

describe("classroom miniview", () => {
  beforeEach(() => {
    state.pathname = "/es/school/classroom/room-1";
    vi.clearAllMocks();
    Object.defineProperty(HTMLVideoElement.prototype, "webkitSetPresentationMode", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal("documentPictureInPicture", undefined);
  });
  afterEach(() => {
    cleanup();
    delete (HTMLVideoElement.prototype as HTMLVideoElement & {
      webkitSetPresentationMode?: unknown;
    }).webkitSetPresentationMode;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("minimizes and restores the same classroom without opening a browser window", () => {
    const open = vi.spyOn(window, "open");
    render(<View />);
    const board = screen.getByLabelText("Whiteboard state");
    fireEvent.change(board, { target: { value: "Existing drawing" } });
    fireEvent.click(screen.getByRole("button", { name: "floatingWindow" }));
    const mini = document.querySelector("[data-classroom-mini]")!;
    expect(mini.contains(board)).toBe(true);
    expect((mini as HTMLElement).hidden).toBe(false);
    expect(screen.getByTestId("presentation-mode").textContent).toBe("compact");
    expect(screen.queryByRole("button", { name: "floatingWindow" })).toBeNull();
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "returnToClassroom" }));
    expect(screen.getByLabelText("Whiteboard state")).toBe(board);
    expect((board as HTMLInputElement).value).toBe("Existing drawing");
    expect(screen.getByTestId("presentation-mode").textContent).toBe("full");
    expect((mini as HTMLElement).hidden).toBe(true);
    expect(state.mounts).toHaveBeenCalledTimes(1);
    expect(state.unmounts).not.toHaveBeenCalled();
  });

  it("preserves the same classroom while navigating away and back", () => {
    const view = render(<View />);
    const board = screen.getByLabelText("Whiteboard state");
    fireEvent.change(board, { target: { value: "Keep drawing" } });
    state.pathname = "/es/school/calendar";
    view.rerender(<View classroom={false} />);
    expect(document.querySelector("[data-classroom-mini]")?.contains(board)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "returnToClassroom" }));
    expect(state.push).toHaveBeenCalledWith("/es/school/classroom/room-1");
    state.pathname = "/es/school/classroom/room-1";
    view.rerender(<View />);
    expect(screen.getByLabelText("Whiteboard state")).toBe(board);
    expect((board as HTMLInputElement).value).toBe("Keep drawing");
    expect(screen.getByTestId("presentation-mode").textContent).toBe("full");
    expect(state.mounts).toHaveBeenCalledTimes(1);
    expect(state.unmounts).not.toHaveBeenCalled();
  });

  it("restores Chrome's closed Document PiP into a miniview with only the restore action", async () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const external = frame.contentWindow!;
    external.close = vi.fn();
    vi.stubGlobal("documentPictureInPicture", {
      requestWindow: vi.fn(async () => external),
    });
    const view = render(<View />);
    const board = screen.getByLabelText("Whiteboard state");
    fireEvent.change(board, { target: { value: "Keep drawing" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "floatingWindow" }));
    });
    expect(external.document.body.contains(board)).toBe(true);
    state.pathname = "/es/school/calendar";
    view.rerender(<View classroom={false} />);
    act(() => external.dispatchEvent(new Event("pagehide")));
    expect(document.querySelector("[data-classroom-mini]")?.contains(board)).toBe(true);
    expect(screen.getByTestId("presentation-mode").textContent).toBe("compact");
    expect(screen.getAllByRole("button", { name: "returnToClassroom" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "floatingWindow" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "returnToClassroom" }));
    expect(state.push).toHaveBeenCalledWith("/es/school/classroom/room-1");
    state.pathname = "/es/school/classroom/room-1";
    view.rerender(<View />);
    expect(screen.getByLabelText("Whiteboard state")).toBe(board);
    expect((board as HTMLInputElement).value).toBe("Keep drawing");
    expect(screen.getByRole("button", { name: "floatingWindow" })).toBeTruthy();
    expect(state.mounts).toHaveBeenCalledTimes(1);
    expect(state.unmounts).not.toHaveBeenCalled();
    frame.remove();
  });
});
