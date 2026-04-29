"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  useMediaDeviceSelect,
  useTrackToggle,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { ChevronUp, Check, Volume2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Variant — three visual contexts this component appears in
// ---------------------------------------------------------------------------
type Variant = "compact" | "default" | "purple";

// ---------------------------------------------------------------------------
// Detect touch/mobile — used to simplify the audio device picker on mobile
// ---------------------------------------------------------------------------
function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

// ---------------------------------------------------------------------------
// Friendly device labels — cameras become "Front Camera" / "Back Camera"
// ---------------------------------------------------------------------------
function formatDeviceLabel(
  device: MediaDeviceInfo,
  kind: "videoinput" | "audioinput" | "audiooutput",
): string {
  const { label, deviceId } = device;
  if (!label) return deviceId ? `Device (${deviceId.slice(0, 8)})` : "Unknown";
  if (kind === "videoinput") {
    // Android: "camera2 0, facing back", iOS: "Back Camera"
    if (/facing front|,\s*facing front|front camera/i.test(label)) return "Front Camera";
    if (/facing back|facing rear|,\s*facing (back|rear)|back camera|rear camera/i.test(label))
      return "Back Camera";
  }
  return label;
}

// ---------------------------------------------------------------------------
// Close-on-outside-click/Escape — shared between both exports
// ---------------------------------------------------------------------------
function useDropdownClose(
  open: boolean,
  setOpen: React.Dispatch<React.SetStateAction<boolean>>,
  ref: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, ref]);
}

// ---------------------------------------------------------------------------
// Circle button class — centralised styling for all three variants
// ---------------------------------------------------------------------------
function circleClass(variant: Variant, enabled: boolean, pending: boolean): string {
  const base = "rounded-full flex items-center justify-center transition-all border select-none";
  const pendingCls = pending ? "opacity-50 cursor-wait" : "";

  switch (variant) {
    case "compact":
      return [
        "w-11 h-11", base, "shadow-md border-2",
        enabled
          ? "bg-white/20 text-white border-white/30 hover:bg-white/30"
          : "bg-red-500/50 text-white border-red-400/60",
        pendingCls,
      ].join(" ");

    case "purple":
      return [
        "w-14 h-14", base, "shadow-lg border-2",
        enabled
          ? "bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-600"
          : "bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 border-red-200 dark:border-red-800",
        pendingCls,
      ].join(" ");

    default: // "default" — teacher desktop / system theme
      return [
        "w-12 h-12", base, "shadow-md",
        enabled
          ? "bg-secondary hover:bg-secondary/80 text-secondary-foreground border-border"
          : "bg-destructive/10 text-destructive border-destructive/20",
        pendingCls,
      ].join(" ");
  }
}

// ---------------------------------------------------------------------------
// Chevron notch — small badge pinned to bottom-right of the circle
// ---------------------------------------------------------------------------
function DeviceNotch({
  compact,
  onClick,
}: {
  compact: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const size = compact ? "w-4 h-4" : "w-5 h-5";
  const pos = compact ? "-bottom-1 -right-1" : "-bottom-1.5 -right-1.5";
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      tabIndex={-1}
      aria-label="Select device"
      className={`absolute ${pos} ${size} rounded-full bg-background/80 border border-border shadow-sm flex items-center justify-center hover:bg-muted transition-colors z-10`}
    >
      <ChevronUp className="w-2.5 h-2.5 text-foreground/70" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Single device row — reused by flat list and sectioned dropdown
// ---------------------------------------------------------------------------
function DeviceRow({
  device,
  isActive,
  onSelect,
  kind,
}: {
  device: MediaDeviceInfo;
  isActive: boolean;
  onSelect: (id: string) => void;
  kind: "videoinput" | "audioinput" | "audiooutput";
}) {
  return (
    <button
      type="button"
      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/70 ${
        isActive ? "text-foreground font-medium" : "text-muted-foreground"
      }`}
      onClick={() => onSelect(device.deviceId)}
    >
      <Check
        className={`w-3.5 h-3.5 shrink-0 ${
          isActive ? "opacity-100 text-primary" : "opacity-0"
        }`}
      />
      <span className="truncate">{formatDeviceLabel(device, kind)}</span>
    </button>
  );
}

// Dropdown panel base class — positioned upward, side and variant-aware
function dropdownCls(side: "left" | "right", variant: Variant = "default", extra = "") {
  const borderCls =
    variant === "purple"
      ? "border-purple-300 dark:border-purple-600"
      : "border-border";
  const scrollCls = variant === "purple" ? "scrollbar-student" : "";
  return `absolute bottom-full ${
    side === "right" ? "right-0" : "left-0"
  } mb-2 z-50 bg-card/95 backdrop-blur-md border ${borderCls} rounded-xl shadow-xl overflow-hidden py-1 ${scrollCls} ${extra}`.trim();
}

// ---------------------------------------------------------------------------
// Flat device list (camera, or speaker-only)
// ---------------------------------------------------------------------------
function DeviceList({
  devices,
  activeDeviceId,
  onSelect,
  side,
  kind,
  variant,
}: {
  devices: MediaDeviceInfo[];
  activeDeviceId: string;
  onSelect: (id: string) => void;
  side: "left" | "right";
  kind: "videoinput" | "audioinput" | "audiooutput";
  variant?: Variant;
}) {
  return (
    <ul
      className={dropdownCls(side, variant, "min-w-[200px] max-w-[260px]")}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {devices.map((d) => (
        <li key={d.deviceId}>
          <DeviceRow
            device={d}
            isActive={d.deviceId === activeDeviceId}
            onSelect={onSelect}
            kind={kind}
          />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Sectioned dropdown: microphone list + optional speaker sub-section
// ---------------------------------------------------------------------------
function SectionedDeviceDropdown({
  micDevices,
  activeMicId,
  onMicSelect,
  speakerDevices,
  activeSpeakerId,
  onSpeakerSelect,
  side,
  variant,
}: {
  micDevices: MediaDeviceInfo[];
  activeMicId: string;
  onMicSelect: (id: string) => void;
  speakerDevices: MediaDeviceInfo[];
  activeSpeakerId: string;
  onSpeakerSelect: (id: string) => void;
  side: "left" | "right";
  variant?: Variant;
}) {
  const showSpeakers = speakerDevices.length > 1;
  return (
    <div
      className={dropdownCls(side, variant, "min-w-[220px] max-w-[280px]")}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {micDevices.length > 0 && (
        <>
          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Microphone
          </p>
          {micDevices.map((d) => (
            <DeviceRow
              key={d.deviceId}
              device={d}
              isActive={d.deviceId === activeMicId}
              onSelect={onMicSelect}
              kind="audioinput"
            />
          ))}
        </>
      )}
      {showSpeakers && (
        <>
          <div className="mx-2 my-1 border-t border-border/60" />
          <p className="px-3 pt-1.5 pb-1 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            <Volume2 className="w-3 h-3" />
            Speaker
          </p>
          {speakerDevices.map((d) => (
            <DeviceRow
              key={d.deviceId}
              device={d}
              isActive={d.deviceId === activeSpeakerId}
              onSelect={onSpeakerSelect}
              kind="audiooutput"
            />
          ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeviceToggleButton — mic or camera toggle + optional device picker notch
// ---------------------------------------------------------------------------
export interface DeviceToggleButtonProps {
  source: Track.Source.Camera | Track.Source.Microphone;
  kind: "videoinput" | "audioinput";
  iconOn: React.ReactNode;
  iconOff: React.ReactNode;
  variant?: Variant;
  /**
   * When true (and kind="audioinput"), the notch opens a sectioned dropdown
   * that combines microphone inputs and speaker outputs in one panel.
   */
  includeAudioOutput?: boolean;
}

export function DeviceToggleButton({
  source,
  kind,
  iconOn,
  iconOff,
  variant = "compact",
  includeAudioOutput = false,
}: DeviceToggleButtonProps) {
  const { toggle, enabled, pending } = useTrackToggle({ source });
  const { localParticipant } = useLocalParticipant();
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind });
  // Always call — only rendered when includeAudioOutput is true
  const {
    devices: outputDevices,
    activeDeviceId: activeOutputId,
    setActiveMediaDevice: setOutputDevice,
  } = useMediaDeviceSelect({ kind: "audiooutput" });

  const [open, setOpen] = useState(false);
  const [dropSide, setDropSide] = useState<"left" | "right">("right");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useDropdownClose(open, setOpen, wrapperRef);

  const handleToggle = async () => {
    try {
      await toggle();
      // Release hardware when camera is turned off so other apps can access it
      if (enabled && source === Track.Source.Camera) {
        localParticipant
          .getTrackPublication(Track.Source.Camera)
          ?.track?.mediaStreamTrack?.stop();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const openDropdown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect();
        setDropSide(
          rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right",
        );
      }
      setOpen((v) => !v);
    },
    [],
  );

  const handleSelect = useCallback(
    async (id: string) => {
      await setActiveMediaDevice(id);
      setOpen(false);
    },
    [setActiveMediaDevice],
  );

  const handleSelectOutput = useCallback(
    async (id: string) => {
      await setOutputDevice(id);
      setOpen(false);
    },
    [setOutputDevice],
  );

  const mobile = isTouchDevice();
  // On mobile: only show the camera picker (front/back) — skip audio device lists
  // to avoid surfacing confusing OS audio routing options (speakerphone, etc.)
  const showPicker = mobile
    ? kind === "videoinput" && devices.length > 1
    : kind === "audioinput" && includeAudioOutput
      ? devices.length > 1 || outputDevices.length > 1
      : devices.length > 1;

  const compact = variant === "compact";

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        onClick={handleToggle}
        disabled={!!pending}
        className={circleClass(variant, !!enabled, !!pending)}
      >
        {enabled ? iconOn : iconOff}
      </button>

      {showPicker && <DeviceNotch compact={compact} onClick={openDropdown} />}

      {open && showPicker && (
        kind === "audioinput" && includeAudioOutput ? (
          <SectionedDeviceDropdown
            micDevices={devices}
            activeMicId={activeDeviceId}
            onMicSelect={handleSelect}
            speakerDevices={outputDevices}
            activeSpeakerId={activeOutputId}
            onSpeakerSelect={handleSelectOutput}
            side={dropSide}
            variant={variant}
          />
        ) : (
          <DeviceList
            devices={devices}
            activeDeviceId={activeDeviceId}
            onSelect={handleSelect}
            side={dropSide}
            kind={kind}
            variant={variant}
          />
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SpeakerSelectButton — standalone audio output selector (student desktop bar)
// ---------------------------------------------------------------------------
export interface SpeakerSelectButtonProps {
  variant?: Exclude<Variant, "compact">;
}

export function SpeakerSelectButton({ variant = "default" }: SpeakerSelectButtonProps) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind: "audiooutput",
  });
  const [open, setOpen] = useState(false);
  const [dropSide, setDropSide] = useState<"left" | "right">("right");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useDropdownClose(open, setOpen, wrapperRef);

  const handleSelect = useCallback(
    async (id: string) => {
      await setActiveMediaDevice(id);
      setOpen(false);
    },
    [setActiveMediaDevice],
  );

  const openDropdown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setDropSide(rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right");
    }
    setOpen((v) => !v);
  }, []);

  // Hide when browser doesn't support audiooutput enumeration or has only one device
  if (devices.length <= 1) return null;

  const iconSize = variant === "purple" ? "w-6 h-6" : "w-5 h-5";

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        onClick={openDropdown}
        aria-label="Select speaker"
        className={circleClass(variant, true, false)}
      >
        <Volume2 className={iconSize} />
      </button>

      <DeviceNotch compact={false} onClick={openDropdown} />

      {open && (
        <DeviceList
          devices={devices}
          activeDeviceId={activeDeviceId}
          onSelect={handleSelect}
          side={dropSide}
          kind="audiooutput"
          variant={variant}
        />
      )}
    </div>
  );
}
