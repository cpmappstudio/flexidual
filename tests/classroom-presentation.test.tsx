import { useEffect, useRef } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Track } from "livekit-client";
import {
  ClassroomPresentationContext,
  type ClassroomPresentation,
} from "@/components/classroom/classroom-presentation";
import { ClassroomVideoPipSource } from "@/components/classroom/classroom-video-pip-source";
import {
  ClassroomLayout,
  ClassroomLayoutHeader,
  ClassroomLayoutSidebar,
  ClassroomLayoutStage,
  ClassroomLayoutControls,
} from "@/components/classroom/classroom-layout";
import { useClassroomStageViewport } from "@/components/classroom/use-classroom-layout-state";
import { DraggableClassroomPip } from "@/components/classroom/draggable-classroom-pip";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("classroom presentation", () => {
  it("does not attach an extra video track for Safari's internal miniview", () => {
    const track = { attach: vi.fn(), detach: vi.fn(), stop: vi.fn() };
    const register = vi.fn();
    const view = render(
      <ClassroomPresentationContext.Provider
        value={{
          floatingKind: "internal",
          setVideoElement: register,
        } as unknown as ClassroomPresentation}
      >
        <ClassroomVideoPipSource track={track as unknown as Track} />
      </ClassroomPresentationContext.Provider>,
    );
    expect(view.container.querySelector("video")).toBeNull();
    expect(track.attach).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("retains the camera overlay's dragged position when changing presentations", () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    function View({ compact }: { compact: boolean }) {
      const containerRef = useRef<HTMLDivElement>(null);
      return (
        <ClassroomPresentationContext.Provider
          value={
            { mode: compact ? "compact" : "full" } as ClassroomPresentation
          }
        >
          <div ref={containerRef}>
            <DraggableClassroomPip containerRef={containerRef}>
              <span>Camera overlay</span>
            </DraggableClassroomPip>
          </div>
        </ClassroomPresentationContext.Provider>
      );
    }
    const view = render(<View compact={false} />);
    const camera = screen.getByText("Camera overlay").parentElement!;
    fireEvent.mouseDown(camera, { button: 0, clientX: 100, clientY: 500 });
    fireEvent.mouseMove(document, { clientX: 300, clientY: 300 });
    fireEvent.mouseUp(document);
    expect(camera.style.left).toBe("212px");
    expect(camera.style.top).toBe("244px");
    view.rerender(<View compact />);
    view.rerender(<View compact={false} />);
    expect(screen.getByText("Camera overlay").parentElement).toBe(camera);
    expect(camera.style.left).toBe("212px");
    expect(camera.style.top).toBe("244px");
  });

  it("keeps the same stage mounted while adapting the layout", () => {
    const mounts = vi.fn();
    const unmounts = vi.fn();
    function Stage() {
      useEffect(() => {
        mounts();
        return () => {
          unmounts();
        };
      }, []);
      return <input aria-label="Stage state" defaultValue="" />;
    }
    function View({ compact }: { compact: boolean }) {
      return (
        <ClassroomPresentationContext.Provider
          value={
            { mode: compact ? "compact" : "full" } as ClassroomPresentation
          }
        >
          <ClassroomLayout>
            <ClassroomLayoutHeader>
              <span>Header</span>
            </ClassroomLayoutHeader>
            <ClassroomLayoutStage>
              <Stage />
            </ClassroomLayoutStage>
            <ClassroomLayoutControls>
              <span>Controls</span>
            </ClassroomLayoutControls>
            <ClassroomLayoutSidebar>
              <span>Chat</span>
            </ClassroomLayoutSidebar>
          </ClassroomLayout>
        </ClassroomPresentationContext.Provider>
      );
    }
    const view = render(<View compact={false} />);
    const state = screen.getByLabelText("Stage state");
    fireEvent.change(state, { target: { value: "Preserved" } });
    view.rerender(<View compact />);
    expect(screen.getByLabelText("Stage state")).toBe(state);
    expect(
      (screen.getByText("Header").parentElement as HTMLElement).style.display,
    ).toBe("none");
    expect(
      (screen.getByText("Chat").parentElement as HTMLElement).style.display,
    ).toBe("none");
    expect(screen.getByText("Controls").parentElement?.style.gridRow).toBe("2");
    view.rerender(<View compact={false} />);
    expect((state as HTMLInputElement).value).toBe("Preserved");
    expect(screen.getByText("Header").parentElement?.style.display).toBe("");
    expect(mounts).toHaveBeenCalledTimes(1);
    expect(unmounts).not.toHaveBeenCalled();
  });

  it("retains one native PiP video and replaces its track before detaching the previous one", () => {
    const register = vi.fn();
    const operations: string[] = [];
    const makeTrack = (name: string) => ({
      attach: vi.fn(() => {
        operations.push(`attach ${name}`);
      }),
      detach: vi.fn(() => {
        operations.push(`detach ${name}`);
      }),
      stop: vi.fn(),
    });
    const camera = makeTrack("camera");
    const screenShare = makeTrack("screen");
    const context = {
      setVideoElement: register,
    } as unknown as ClassroomPresentation;
    const node = (
      track: unknown,
      floatingKind: ClassroomPresentation["floatingKind"] = "video",
    ) => (
      <ClassroomPresentationContext.Provider
        value={{ ...context, floatingKind }}
      >
        <ClassroomVideoPipSource track={track as Track} />
      </ClassroomPresentationContext.Provider>
    );
    const view = render(node(camera));
    const video = view.container.querySelector("video");
    view.rerender(node(camera, "document"));
    view.rerender(node(camera));
    expect(view.container.querySelector("video")).toBe(video);
    expect(camera.attach).toHaveBeenCalledTimes(1);
    expect(camera.detach).not.toHaveBeenCalled();
    view.rerender(node(screenShare));
    expect(view.container.querySelector("video")).toBe(video);
    expect(operations).toEqual([
      "attach camera",
      "attach screen",
      "detach camera",
    ]);
    expect(register).toHaveBeenCalledTimes(1);
    expect(video?.muted).toBe(true);
    expect(camera.stop).not.toHaveBeenCalled();
    view.unmount();
    expect(screenShare.detach).toHaveBeenCalledWith(video);
    expect(screenShare.stop).not.toHaveBeenCalled();
    expect(register).toHaveBeenLastCalledWith(null);
  });

  it("does not intercept scrolling outside an active stage drag", () => {
    function Viewport() {
      const { stageRef, startPanDrag } = useClassroomStageViewport();
      return (
        <div ref={stageRef}>
          <button onClick={() => startPanDrag(0, 0)}>Drag</button>
        </div>
      );
    }
    render(<Viewport />);
    const scroll = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(scroll, "touches", {
      value: [{ clientX: 10, clientY: 10 }],
    });
    document.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
    fireEvent.click(screen.getByText("Drag"));
    const drag = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(drag, "touches", {
      value: [{ clientX: 20, clientY: 20 }],
    });
    act(() => document.dispatchEvent(drag));
    expect(drag.defaultPrevented).toBe(true);
  });
});
