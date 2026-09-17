import { useState } from "react";
import { createPortal } from "react-dom";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClassroomFloatingWindow } from "@/hooks/use-classroom-floating-window";

let host: HTMLDivElement;
let home: HTMLDivElement;
let restore = vi.fn<() => void>();

function Probe({
  enabled = true,
  video = null,
}: {
  enabled?: boolean;
  video?: HTMLVideoElement | null;
}) {
  const pip = useClassroomFloatingWindow({
    host,
    video,
    enabled,
    restoreHost: restore,
  });
  const [draft, setDraft] = useState("");
  return (
    <>
      <button onClick={() => void pip.openFloating()}>Open PiP</button>
      <button onClick={pip.openWindow}>Open popup</button>
      <button onClick={pip.close}>Close PiP</button>
      <span data-testid="mode">
        {pip.externalWindow
          ? "external"
          : pip.nativeVideoActive
            ? "video"
            : "internal"}
      </span>
      {pip.error && <span>PiP unavailable</span>}
      <span data-testid="floating-kind">{pip.floatingKind}</span>
      {createPortal(
        <input
          aria-label="Draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />,
        host,
      )}
    </>
  );
}

function makeWindow() {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const external = frame.contentWindow!;
  Object.defineProperty(external, "closed", {
    configurable: true,
    value: false,
  });
  external.close = vi.fn(() => {
    Object.defineProperty(external, "closed", {
      configurable: true,
      value: true,
    });
    external.dispatchEvent(new Event("pagehide"));
  });
  external.focus = vi.fn();
  return external;
}

function makeVideo() {
  const video = document.createElement("video");
  video.play = vi.fn(async () => {});
  Object.defineProperty(video, "readyState", { configurable: true, value: 4 });
  Object.defineProperty(video, "srcObject", { configurable: true, value: {} });
  document.body.append(video);
  return video;
}

describe("classroom floating windows", () => {
  beforeEach(() => {
    home = document.createElement("div");
    host = document.createElement("div");
    home.append(host);
    document.body.append(home);
    restore = vi.fn(() => home.append(host));
    vi.stubGlobal("documentPictureInPicture", undefined);
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(document, "pictureInPictureElement", {
      configurable: true,
      value: null,
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
  });
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    document.head
      .querySelectorAll("[data-test-style]")
      .forEach((node) => node.remove());
    document.documentElement.className = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("moves the same React view into Document PiP and restores its draft on manual close", async () => {
    const external = makeWindow();
    const requestWindow = vi.fn(async () => external);
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    render(<Probe />);
    const draft = screen.getByLabelText("Draft");
    fireEvent.change(draft, { target: { value: "Keep this state" } });
    await act(async () => fireEvent.click(screen.getByText("Open PiP")));
    expect(external.document.body.contains(host)).toBe(true);
    expect(within(external.document.body).getByLabelText("Draft")).toBe(draft);
    fireEvent.change(draft, { target: { value: "Edited in PiP" } });
    act(() => external.dispatchEvent(new Event("pagehide")));
    expect(home.contains(host)).toBe(true);
    expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe(
      "Edited in PiP",
    );
    expect(screen.getByTestId("mode").textContent).toBe("internal");
    expect(requestWindow).toHaveBeenCalledTimes(1);
    expect(requestWindow).toHaveBeenCalledWith({
      width: 480,
      height: 400,
      disallowReturnToOpener: true,
    });
  });

  it("copies styles loaded after opening the window and synchronizes theme changes", async () => {
    const external = makeWindow();
    vi.stubGlobal("documentPictureInPicture", {
      requestWindow: async () => external,
    });
    render(<Probe />);
    await act(async () => fireEvent.click(screen.getByText("Open PiP")));
    await act(async () => {
      const style = document.createElement("style");
      style.dataset.testStyle = "";
      style.textContent = ".whiteboard { color: red; }";
      document.head.append(style);
      document.documentElement.className = "dark";
    });
    expect(external.document.head.textContent).toContain(".whiteboard");
    expect(external.document.documentElement.className).toBe("dark");
  });

  it("closes a late Document PiP result after the session is disabled", async () => {
    const external = makeWindow();
    let resolve!: (value: Window) => void;
    vi.stubGlobal("documentPictureInPicture", {
      requestWindow: () =>
        new Promise<Window>((done) => {
          resolve = done;
        }),
    });
    const view = render(<Probe />);
    fireEvent.click(screen.getByText("Open PiP"));
    view.rerender(<Probe enabled={false} />);
    await act(async () => resolve(external));
    expect(external.close).toHaveBeenCalledTimes(1);
    expect(home.contains(host)).toBe(true);
    expect(screen.getByTestId("mode").textContent).toBe("internal");
  });

  it("keeps the session intact on rejection and offers a separate popup on a new click", async () => {
    const external = makeWindow();
    vi.stubGlobal("documentPictureInPicture", {
      requestWindow: async () => {
        throw new Error("Denied");
      },
    });
    const open = vi.spyOn(window, "open").mockReturnValue(external);
    render(<Probe />);
    const draft = screen.getByLabelText("Draft");
    fireEvent.change(draft, { target: { value: "Unchanged" } });
    await act(async () => fireEvent.click(screen.getByText("Open PiP")));
    expect(screen.getByText("PiP unavailable")).toBeTruthy();
    expect(home.contains(draft)).toBe(true);
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Open popup"));
    expect(external.document.body.contains(draft)).toBe(true);
    expect((draft as HTMLInputElement).value).toBe("Unchanged");
  });

  it("does not request a window if the session ends while exiting fullscreen", async () => {
    let resolve!: () => void;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: host,
    });
    document.exitFullscreen = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const requestWindow = vi.fn();
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    const view = render(<Probe />);
    fireEvent.click(screen.getByText("Open PiP"));
    view.rerender(<Probe enabled={false} />);
    await act(async () => resolve());
    expect(requestWindow).not.toHaveBeenCalled();
    expect(home.contains(host)).toBe(true);
  });

  it("keeps the view internal when a popup is blocked", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    render(<Probe />);
    fireEvent.click(screen.getByText("Open popup"));
    expect(screen.getByText("PiP unavailable")).toBeTruthy();
    expect(home.contains(host)).toBe(true);
  });

  it("uses native video PiP without moving or recreating the classroom", async () => {
    const video = makeVideo();
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    video.requestPictureInPicture = vi.fn(async () => {
      Object.defineProperty(document, "pictureInPictureElement", {
        configurable: true,
        value: video,
      });
      return {} as PictureInPictureWindow;
    });
    render(<Probe video={video} />);
    await act(async () => fireEvent.click(screen.getByText("Open PiP")));
    expect(home.contains(host)).toBe(true);
    expect(screen.getByTestId("mode").textContent).toBe("video");
    act(() => {
      Object.defineProperty(document, "pictureInPictureElement", {
        configurable: true,
        value: null,
      });
      video.dispatchEvent(new Event("leavepictureinpicture"));
    });
    expect(screen.getByTestId("mode").textContent).toBe("internal");
  });

  it("offers a normal window without video and updates when a playable PiP video becomes available", () => {
    const video = document.createElement("video");
    video.requestPictureInPicture = vi.fn();
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    render(<Probe video={video} />);
    expect(screen.getByTestId("floating-kind").textContent).toBe("window");
    expect(screen.queryByText("PiP unavailable")).toBeNull();
    Object.defineProperty(video, "readyState", {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(video, "srcObject", {
      configurable: true,
      value: {},
    });
    fireEvent.loadedMetadata(video);
    expect(screen.getByTestId("floating-kind").textContent).toBe("video");
    Object.defineProperty(video, "srcObject", {
      configurable: true,
      value: null,
    });
    fireEvent.emptied(video);
    expect(screen.getByTestId("floating-kind").textContent).toBe("window");
    expect(video.requestPictureInPicture).not.toHaveBeenCalled();
  });

  it("keeps Safari inside Flexidual even when both native PiP APIs are available", async () => {
    const video = makeVideo() as HTMLVideoElement & {
      webkitSetPresentationMode: (mode: string) => void;
      webkitPresentationMode: string;
    };
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    video.requestPictureInPicture = vi.fn();
    video.webkitPresentationMode = "inline";
    video.webkitSetPresentationMode = vi.fn();
    const open = vi.spyOn(window, "open");
    render(<Probe video={video} />);
    const draft = screen.getByLabelText("Draft");
    fireEvent.change(draft, { target: { value: "Preserved" } });
    await act(async () => fireEvent.click(screen.getByText("Open PiP")));
    expect(screen.getByTestId("floating-kind").textContent).toBe("internal");
    expect(screen.getByTestId("mode").textContent).toBe("internal");
    expect(video.requestPictureInPicture).not.toHaveBeenCalled();
    expect(video.webkitSetPresentationMode).not.toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByText("PiP unavailable")).toBeNull();
    expect(home.contains(draft)).toBe(true);
    expect((draft as HTMLInputElement).value).toBe("Preserved");
  });

  it("closes an already active Safari native window without changing the classroom", () => {
    const video = makeVideo() as HTMLVideoElement & {
      webkitSetPresentationMode: (mode: string) => void;
      webkitPresentationMode: string;
    };
    video.webkitPresentationMode = "picture-in-picture";
    video.webkitSetPresentationMode = vi.fn((mode) => {
      video.webkitPresentationMode = mode;
    });
    render(<Probe video={video} />);
    expect(video.webkitSetPresentationMode).toHaveBeenCalledWith("inline");
    expect(screen.getByTestId("mode").textContent).toBe("internal");
    expect(home.contains(host)).toBe(true);
  });

  it("prefers Document PiP when available even with WebKit video methods", async () => {
    const external = makeWindow();
    const requestWindow = vi.fn(async () => external);
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    const video = makeVideo() as HTMLVideoElement & {
      webkitSetPresentationMode: (mode: string) => void;
    };
    video.webkitSetPresentationMode = vi.fn();
    render(<Probe video={video} />);
    await act(async () => fireEvent.click(screen.getByText("Open PiP")));
    expect(screen.getByTestId("floating-kind").textContent).toBe("document");
    expect(external.document.body.contains(host)).toBe(true);
    expect(requestWindow).toHaveBeenCalledTimes(1);
    expect(video.webkitSetPresentationMode).not.toHaveBeenCalled();
  });

  it("closes native PiP if resuming its video fails without affecting the classroom", async () => {
    const video = makeVideo();
    video.play = vi.fn(async () => {
      throw new Error("Playback denied");
    });
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    video.requestPictureInPicture = vi.fn(async () => {
      Object.defineProperty(document, "pictureInPictureElement", {
        configurable: true,
        value: video,
      });
      return {} as PictureInPictureWindow;
    });
    document.exitPictureInPicture = vi.fn(async () => {});
    render(<Probe video={video} />);
    await act(async () => fireEvent.click(screen.getByText("Open PiP")));
    expect(document.exitPictureInPicture).toHaveBeenCalledTimes(1);
    expect(screen.getByText("PiP unavailable")).toBeTruthy();
    expect(home.contains(host)).toBe(true);
  });

  it("closes an unexpected Safari native entry while keeping the internal classroom", async () => {
    const video = makeVideo() as HTMLVideoElement & {
      webkitSupportsPresentationMode: (mode: string) => boolean;
      webkitSetPresentationMode: (mode: string) => void;
      webkitPresentationMode: string;
    };
    video.webkitPresentationMode = "inline";
    video.webkitSupportsPresentationMode = vi.fn(() => true);
    video.webkitSetPresentationMode = vi.fn();
    render(<Probe video={video} />);
    act(() => {
      video.webkitPresentationMode = "picture-in-picture";
      video.dispatchEvent(new Event("webkitpresentationmodechanged"));
    });
    expect(video.webkitSetPresentationMode).toHaveBeenLastCalledWith("inline");
    expect(screen.getByTestId("mode").textContent).toBe("internal");
    expect(home.contains(host)).toBe(true);
  });

  it("exits native PiP even if the video source unmounts before the session ends", async () => {
    const video = makeVideo();
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    video.requestPictureInPicture = vi.fn(async () => {
      Object.defineProperty(document, "pictureInPictureElement", {
        configurable: true,
        value: video,
      });
      return {} as PictureInPictureWindow;
    });
    document.exitPictureInPicture = vi.fn(async () => {
      Object.defineProperty(document, "pictureInPictureElement", {
        configurable: true,
        value: null,
      });
    });
    const view = render(<Probe video={video} />);
    await act(async () => fireEvent.click(screen.getByText("Open PiP")));
    view.rerender(<Probe video={null} enabled={false} />);
    expect(document.exitPictureInPicture).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("mode").textContent).toBe("internal");
  });

  it("rejects video PiP without a playable source without changing the session", async () => {
    render(<Probe video={document.createElement("video")} />);
    await act(async () => fireEvent.click(screen.getByText("Open PiP")));
    expect(screen.getByText("PiP unavailable")).toBeTruthy();
    expect(home.contains(host)).toBe(true);
  });

  it("restores the host and closes the external window when its owner unmounts", async () => {
    const external = makeWindow();
    vi.stubGlobal("documentPictureInPicture", {
      requestWindow: async () => external,
    });
    const view = render(<Probe />);
    await act(async () => fireEvent.click(screen.getByText("Open PiP")));
    view.unmount();
    expect(home.contains(host)).toBe(true);
    expect(external.close).toHaveBeenCalledTimes(1);
  });
});
