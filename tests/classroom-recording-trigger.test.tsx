import { act, render } from "@testing-library/react";
import { ConnectionState } from "livekit-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassroomRecordingTrigger } from "@/components/classroom/classroom-recording-trigger";

const liveKitState = vi.hoisted(() => ({
  connectionState: "disconnected",
}));

vi.mock("@livekit/components-react", () => ({
  useConnectionState: () => liveKitState.connectionState,
}));

describe("ClassroomRecordingTrigger", () => {
  const animationFrames: FrameRequestCallback[] = [];

  beforeEach(() => {
    liveKitState.connectionState = ConnectionState.Disconnected;
    animationFrames.length = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("waits for both the connection and the visible scene", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { rerender } = render(
      <ClassroomRecordingTrigger isSceneReady={false} />,
    );

    liveKitState.connectionState = ConnectionState.Connected;
    rerender(<ClassroomRecordingTrigger isSceneReady={false} />);
    expect(animationFrames).toHaveLength(0);
    expect(log).not.toHaveBeenCalled();

    rerender(<ClassroomRecordingTrigger isSceneReady />);
    expect(animationFrames).toHaveLength(1);
    expect(log).not.toHaveBeenCalled();

    act(() => animationFrames.shift()?.(0));
    expect(log).not.toHaveBeenCalled();
    act(() => animationFrames.shift()?.(16));
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("START_RECORDING");

    rerender(<ClassroomRecordingTrigger isSceneReady />);
    expect(log).toHaveBeenCalledOnce();
  });
});
