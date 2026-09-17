import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationChime } from "@/hooks/use-notification-chime";

const contexts: FakeContext[] = [];
class FakeContext {
  state = "running";
  currentTime = 10;
  destination = {};
  oscillators: {
    type: string;
    frequency: { value: number };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }[] = [];
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  createGain = vi.fn(() => ({
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  }));
  constructor() {
    contexts.push(this);
  }
  createOscillator() {
    const oscillator = {
      type: "sine",
      connect: vi.fn(),
      frequency: { value: 0 },
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }
}
function Probe({
  enabled = true,
  kind = "classroom",
  ownerWindow,
}: Parameters<typeof useNotificationChime>[0] = {}) {
  const play = useNotificationChime({ enabled, kind, ownerWindow });
  return <button onClick={() => void play()}>Play</button>;
}
describe("notification chimes", () => {
  beforeEach(() => {
    contexts.length = 0;
    vi.stubGlobal("AudioContext", FakeContext);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("preserves the classroom tone and its permission gate", async () => {
    const view = render(<Probe enabled={false} />);
    await act(async () => fireEvent.click(screen.getByText("Play")));
    fireEvent.pointerDown(window);
    expect(contexts).toHaveLength(0);
    view.rerender(<Probe />);
    await act(async () => fireEvent.click(screen.getByText("Play")));
    expect(contexts[0].oscillators.map((item) => item.frequency.value)).toEqual(
      [660, 880, 1100],
    );
    expect(contexts[0].oscillators[2].start).toHaveBeenCalledWith(10.36);
    expect(contexts[0].oscillators.every((item) => item.type === "sine")).toBe(
      true,
    );
    expect(
      contexts[0].createGain.mock.results[0].value.gain.linearRampToValueAtTime,
    ).toHaveBeenCalledWith(0.18, 10.04);
    view.rerender(<Probe enabled={false} />);
    expect(contexts[0].close).toHaveBeenCalledTimes(1);
  });

  it("keeps chat silent until interaction and plays a single soft message ping", async () => {
    const view = render(<Probe kind="chat" />);
    await act(async () => fireEvent.click(screen.getByText("Play")));
    expect(contexts).toHaveLength(0);
    await act(async () => fireEvent.pointerDown(window));
    await act(async () => fireEvent.click(screen.getByText("Play")));
    expect(contexts[0].oscillators).toHaveLength(1);
    expect(contexts[0].oscillators[0].stop).toHaveBeenCalledWith(10.3);
    expect(
      contexts[0].oscillators.every((item) => item.type === "triangle"),
    ).toBe(true);
    expect(
      contexts[0].createGain.mock.results[0].value.gain.linearRampToValueAtTime,
    ).toHaveBeenCalledWith(0.06, 10.008);
    expect(
      contexts[0].createGain.mock.results[0].value.gain
        .exponentialRampToValueAtTime,
    ).toHaveBeenCalledWith(0.001, 10.3);
    contexts[0].state = "suspended";
    await act(async () => fireEvent.click(screen.getByText("Play")));
    expect(contexts[0].oscillators).toHaveLength(1);
    view.unmount();
    expect(contexts[0].close).toHaveBeenCalledTimes(1);
  });

  it("unlocks from the PiP window and retains its audio context across window changes", async () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const ownerWindow = frame.contentWindow!;
    const view = render(<Probe kind="chat" ownerWindow={ownerWindow} />);
    await act(async () => ownerWindow.dispatchEvent(new Event("pointerdown")));
    await act(async () => fireEvent.click(screen.getByText("Play")));
    expect(contexts).toHaveLength(1);
    expect(contexts[0].oscillators).toHaveLength(1);
    view.rerender(<Probe kind="chat" />);
    expect(contexts[0].close).not.toHaveBeenCalled();
    view.unmount();
    frame.remove();
  });

  it("treats unsupported audio as optional", async () => {
    vi.stubGlobal("AudioContext", undefined);
    render(<Probe />);
    fireEvent.pointerDown(window);
    await act(async () => fireEvent.click(screen.getByText("Play")));
    expect(contexts).toHaveLength(0);
  });
});
