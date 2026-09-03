import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Track } from "livekit-client";

const liveKitMocks = vi.hoisted(() => ({
  devices: [] as MediaDeviceInfo[],
  enabled: false,
  pending: false,
  setActiveMediaDevice: vi.fn(async () => undefined),
  toggle: vi.fn(async () => undefined),
  useMediaDeviceSelect: vi.fn(),
}));

const toastError = vi.hoisted(() => vi.fn());

vi.mock("@livekit/components-react", () => ({
  useTrackToggle: () => ({
    enabled: liveKitMocks.enabled,
    pending: liveKitMocks.pending,
    toggle: liveKitMocks.toggle,
  }),
  useMediaDeviceSelect: (options: { kind: MediaDeviceKind }) => {
    liveKitMocks.useMediaDeviceSelect(options);
    return {
      devices: liveKitMocks.devices.filter(
        (device) => device.kind === options.kind,
      ),
      activeDeviceId: "default",
      setActiveMediaDevice: liveKitMocks.setActiveMediaDevice,
    };
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { error: toastError },
}));

import { DeviceToggleButton } from "@/components/classroom/device-toggle-button";

function createDevice(
  kind: MediaDeviceKind,
  deviceId: string,
  label: string,
): MediaDeviceInfo {
  return {
    deviceId,
    groupId: "group",
    kind,
    label,
    toJSON: () => ({}),
  };
}

function renderCameraButton() {
  return render(
    <DeviceToggleButton
      source={Track.Source.Camera}
      kind="videoinput"
      label="Camera"
      pickerLabel="Select camera"
      iconOn={<span>on</span>}
      iconOff={<span>off</span>}
    />,
  );
}

describe("DeviceToggleButton", () => {
  afterEach(() => {
    cleanup();
    liveKitMocks.devices = [];
    liveKitMocks.enabled = false;
    liveKitMocks.pending = false;
    vi.clearAllMocks();
  });

  it("does not request browser permission just to list a disabled device", () => {
    renderCameraButton();

    expect(liveKitMocks.useMediaDeviceSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "videoinput",
        requestPermissions: false,
      }),
    );
    expect(liveKitMocks.useMediaDeviceSelect).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "audiooutput" }),
    );
  });

  it("allows labeled enumeration after the track is enabled", () => {
    liveKitMocks.enabled = true;
    renderCameraButton();

    expect(liveKitMocks.useMediaDeviceSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "videoinput",
        requestPermissions: true,
      }),
    );
  });

  it("enumerates audio outputs without requesting capture permission", () => {
    render(
      <DeviceToggleButton
        source={Track.Source.Microphone}
        kind="audioinput"
        includeAudioOutput
        label="Microphone"
        iconOn={<span>on</span>}
        iconOff={<span>off</span>}
      />,
    );

    expect(liveKitMocks.useMediaDeviceSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "audiooutput",
        requestPermissions: false,
      }),
    );
  });

  it("serializes repeated clicks while a toggle is in flight", async () => {
    let finishToggle: (() => void) | undefined;
    liveKitMocks.toggle.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishToggle = () => resolve(undefined);
        }),
    );
    renderCameraButton();

    const button = screen.getByRole("button", { name: "Camera" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(liveKitMocks.toggle).toHaveBeenCalledTimes(1);
    finishToggle?.();
    await waitFor(() => expect(liveKitMocks.toggle).toHaveBeenCalledTimes(1));
  });

  it("reports a denied device change without closing the selector", async () => {
    liveKitMocks.devices = [
      createDevice("videoinput", "camera-1", "Built-in Camera"),
      createDevice("videoinput", "camera-2", "USB Camera"),
    ];
    liveKitMocks.setActiveMediaDevice.mockRejectedValueOnce(
      new DOMException("Permission denied", "NotAllowedError"),
    );
    renderCameraButton();

    fireEvent.click(screen.getByRole("button", { name: "Select camera" }));
    fireEvent.click(screen.getByRole("button", { name: /USB Camera/ }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "classroom.mediaPermissionDenied",
        expect.objectContaining({ id: "classroom-media-PermissionDenied" }),
      );
    });
    expect(screen.getByRole("button", { name: /USB Camera/ })).toBeTruthy();
  });
});
