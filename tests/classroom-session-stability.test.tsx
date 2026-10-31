import { createElement, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => {
  const administrativeParticipant = {
    identity: "admin-clerk-id",
    isLocal: true,
    isScreenShareEnabled: false,
    metadata: JSON.stringify({
      role: "admin",
      convexUserId: "user-1",
      leadershipRole: "admin",
    }),
    name: "Administrative leader",
    getTrackPublication: vi.fn(() => undefined),
    publishData: vi.fn(async () => undefined),
    setCameraEnabled: vi.fn(async () => undefined),
    setMicrophoneEnabled: vi.fn(async () => undefined),
    setScreenShareEnabled: vi.fn(async () => undefined),
  };
  const studentParticipant = {
    identity: "student-clerk-id",
    isLocal: true,
    isScreenShareEnabled: false,
    metadata: JSON.stringify({ role: "student", convexUserId: "student-1" }),
    name: "Student",
    getTrackPublication: vi.fn(() => undefined),
    publishData: vi.fn(async () => undefined),
    setCameraEnabled: vi.fn(async () => undefined),
    setMicrophoneEnabled: vi.fn(async () => undefined),
    setScreenShareEnabled: vi.fn(async () => undefined),
  };
  const remoteAdministrativeParticipant = {
    ...administrativeParticipant,
    isLocal: false,
  };
  const remoteStudentParticipant = {
    ...studentParticipant,
    isLocal: false,
  };
  const leadership = {
    scheduleId: "schedule-1",
    closureStatus: undefined,
    leader: {
      userId: "user-1",
      participantIdentity: "admin-clerk-id",
      fullName: "Administrative leader",
      role: "admin",
      since: Date.UTC(2026, 8, 3, 13, 0),
    },
    pendingTransfer: null,
    latestTransferOutcome: null,
    viewer: {
      userId: "user-1",
      isLeader: true,
      isPrimaryTeacher: false,
      canClaim: false,
      canRecover: false,
      canTransfer: true,
      canAcceptTransfer: false,
      canTakeover: false,
    },
  };

  return {
    administrativeParticipant,
    backendCall: vi.fn<(args?: unknown) => Promise<unknown>>(async () => null),
    compactControls: false,
    extensionContext: null as {
      affectedStudentCount: number;
      effectiveEnd: number;
      hardEndsAt: number;
      proposedEnd: number;
      warningStartsAt: number;
      decisionEndsAt?: number;
    } | null,
    isExtensionLoading: false,
    isLeadershipLoading: false,
    recordingOperation: null as { pending: boolean; failed: boolean } | null,
    screenSharing: false,
    hideParticipantPanel: false,
    leadership: leadership as typeof leadership | null,
    initialLeadership: leadership,
    localParticipant: administrativeParticipant,
    participants: [administrativeParticipant],
    qrValue: "",
    remoteAdministrativeParticipant,
    remoteStudentParticipant,
    studentParticipant,
    room: {
      name: "physical-room-activation-1",
      state: "connected",
      isRecording: false,
      localParticipant: administrativeParticipant,
      disconnect: vi.fn(async () => undefined),
      off: vi.fn(),
      on: vi.fn(),
      startAudio: vi.fn(async () => undefined),
    },
  };
});

vi.mock("@/convex/_generated/api", () => ({
  api: {
    liveRoomLifecycle: { getRecordingOperation: "getRecordingOperation" },
    livekit: {
      endSession: "endSession",
      notifyRoomAdministratorLeft: "notifyRoomAdministratorLeft",
      setParticipantScreenSharePermission:
        "setParticipantScreenSharePermission",
      toggleRecording: "toggleRecording",
    },
    schedule: {
      acceptSessionLeadershipTransfer: "acceptSessionLeadershipTransfer",
      cancelSessionLeadershipTransfer: "cancelSessionLeadershipTransfer",
      claimSessionLeadership: "claimSessionLeadership",
      confirmLiveExtension: "confirmLiveExtension",
      getLiveExtensionContext: "getLiveExtensionContext",
      getSessionLeadership: "getSessionLeadership",
      getStudentExtensionContext: "getStudentExtensionContext",
      markLive: "markLive",
      recoverSessionLeadership: "recoverSessionLeadership",
      rejectSessionLeadershipTransfer: "rejectSessionLeadershipTransfer",
      requestSessionLeadershipTransfer: "requestSessionLeadershipTransfer",
      takeOverSessionLeadership: "takeOverSessionLeadership",
    },
    eventRoom: {
      acceptSessionLeadershipTransfer: "acceptSessionLeadershipTransfer",
      cancelSessionLeadershipTransfer: "cancelSessionLeadershipTransfer",
      claimSessionLeadership: "claimSessionLeadership",
      confirmLiveExtension: "confirmLiveExtension",
      getAttendeeExtensionContext: "getStudentExtensionContext",
      getLiveExtensionContext: "getLiveExtensionContext",
      getSessionLeadership: "getSessionLeadership",
      recoverSessionLeadership: "recoverSessionLeadership",
      rejectSessionLeadershipTransfer: "rejectSessionLeadershipTransfer",
      requestSessionLeadershipTransfer: "requestSessionLeadershipTransfer",
      start: "markLive",
      takeOverSessionLeadership: "takeOverSessionLeadership",
    },
  },
}));

vi.mock("convex/react", () => ({
  useAction: () => testState.backendCall,
  useMutation: () => testState.backendCall,
  useQuery: (query: string) => {
    if (query === "getRecordingOperation") return testState.recordingOperation;
    if (query === "getSessionLeadership") {
      return testState.isLeadershipLoading ? undefined : testState.leadership;
    }
    if (
      query === "getLiveExtensionContext" ||
      query === "getStudentExtensionContext"
    ) {
      return testState.isExtensionLoading
        ? undefined
        : testState.extensionContext;
    }
    return null;
  },
}));

vi.mock("@livekit/components-react", () => ({
  useIsRecording: () => testState.room.isRecording,
  useLocalParticipant: () => ({
    localParticipant: testState.localParticipant,
  }),
  useParticipants: () => testState.participants,
  useTracks: () => [],
  useRoomContext: () => testState.room,
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/classroom/room-1" }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("sonner", () => ({
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));
vi.mock("qrcode.react", async () => {
  const React = await import("react");
  return {
    QRCodeSVG: ({ value }: { value: string }) => {
      testState.qrValue = value;
      return React.createElement("div", { "data-testid": "companion-qr" });
    },
  };
});

vi.mock("@/components/classroom/use-classroom-layout-state", () => ({
  useClassroomStageViewport: () => ({
    handleZoom: vi.fn(),
    pan: { x: 0, y: 0 },
    stageRef: { current: null },
    startPanDrag: vi.fn(),
    zoom: 1,
  }),
  usePhoneLandscapeStageControls: () => ({
    isPhoneLandscape: false,
    showStageControls: vi.fn(),
    stageControlsVisible: true,
  }),
}));
vi.mock("@/components/classroom/use-classroom-media-tracks", () => ({
  useClassroomMediaTracks: () => ({
    activeScreenTrack: undefined,
    isScreenSharingActive: testState.screenSharing,
    isTeacherAudioOn: false,
    isTeacherVideoOn: false,
    screenTracks: [],
  }),
}));
vi.mock("@/components/classroom/use-classroom-ending-soon-notice", () => ({
  useClassroomEndingSoonNotice: ({
    isEndingSoon,
  }: {
    isEndingSoon: boolean;
  }) => ({
    dismissNotice: vi.fn(),
    shouldShowNotice: isEndingSoon,
  }),
}));

vi.mock("@/components/classroom/classroom-view", () => ({
  ClassroomView: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
  ClassroomViewControls: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/components/classroom/classroom-header", () => ({
  ClassroomHeader: ({
    action,
    isFinalizingRecording,
    isRecording,
    sessionAction,
  }: {
    action?: ReactNode;
    isFinalizingRecording?: boolean;
    isRecording: boolean;
    sessionAction?: ReactNode;
  }) =>
    createElement(
      "header",
      {
        "data-finalizing-recording": String(isFinalizingRecording),
        "data-recording": String(isRecording),
      },
      action,
      sessionAction,
    ),
}));
vi.mock("@/components/classroom/classroom-stage", () => ({
  ClassroomScreenShareContent: () => null,
  ClassroomStage: ({
    children,
    onViewModeChange,
    onUnpinParticipant,
    unpinParticipantLabel,
  }: {
    children: ReactNode;
    onViewModeChange?: (mode: "presenter" | "mosaic") => void;
    onUnpinParticipant?: () => void;
    unpinParticipantLabel?: string;
  }) =>
    createElement(
      "main",
      null,
      children,
      onUnpinParticipant &&
        createElement(
          "button",
          {
            onClick: onUnpinParticipant,
            "aria-label": unpinParticipantLabel,
          },
          "Unpin from stage",
        ),
      onViewModeChange &&
        createElement(
          "button",
          {
            onClick: () => onViewModeChange("mosaic"),
            "aria-label": "Switch to mosaic",
          },
          "Mosaic",
        ),
      onViewModeChange &&
        createElement(
          "button",
          {
            onClick: () => onViewModeChange("presenter"),
            "aria-label": "Switch to presenter",
          },
          "Presenter",
        ),
    ),
  ClassroomWhiteboardContent: ({ roomName }: { roomName: string }) =>
    createElement("div", {
      "data-testid": "classroom-whiteboard",
      "data-room-name": roomName,
    }),
}));
vi.mock("@/components/classroom/classroom-presenter-content", () => ({
  ClassroomPresenterContent: ({
    participant,
    waitingLabel,
  }: {
    participant?: { name?: string };
    waitingLabel: string;
  }) => createElement("div", null, participant?.name ?? waitingLabel),
}));
vi.mock("@/components/classroom/classroom-participants-panel", () => ({
  ClassroomParticipantsPanel: ({
    children,
    participants,
    viewMode,
  }: {
    children?: ReactNode;
    participants: { identity: string }[];
    viewMode?: string;
  }) =>
    testState.hideParticipantPanel
      ? null
      : createElement(
          "aside",
          {
            "data-participant-identities": participants
              .map(({ identity }) => identity)
              .join(","),
          },
          viewMode === "mosaic" ? null : children,
        ),
}));
vi.mock("@/components/classroom/classroom-action-bar", () => ({
  ClassroomActionBar: ({
    center,
    left,
    mobile,
    right,
  }: {
    center: ReactNode;
    left: ReactNode;
    mobile?: ReactNode;
    right: ReactNode;
  }) =>
    createElement(
      "nav",
      null,
      testState.compactControls && mobile ? mobile : [left, center, right],
    ),
  ClassroomActionButton: ({
    disabled,
    label,
    onClick,
    onPressedChange,
    title,
  }: {
    disabled?: boolean;
    label?: string;
    onClick?: () => void;
    onPressedChange?: () => void;
    title?: string;
  }) =>
    createElement(
      "button",
      {
        disabled,
        onClick: onPressedChange ?? onClick,
        title,
        "aria-label": label,
      },
      label,
    ),
}));
vi.mock("@/components/classroom/classroom-overlays", () => ({
  ClassroomEnableAudioOverlay: () => null,
  ClassroomEndingSoonNotice: ({ label }: { label: string }) =>
    createElement("div", null, label),
  ClassroomFullscreenPrompt: () => null,
}));
vi.mock("@/components/classroom/classroom-participant-tile", () => ({
  ClassroomParticipantTile: ({
    participant,
    isPinned,
    onPinnedChange,
    pinLabel,
    unpinLabel,
  }: {
    participant: { name?: string };
    isPinned?: boolean;
    onPinnedChange?: (isPinned: boolean) => void;
    pinLabel?: string;
    unpinLabel?: string;
  }) =>
    createElement(
      "div",
      null,
      participant.name,
      onPinnedChange &&
        createElement(
          "button",
          {
            "aria-label": isPinned ? unpinLabel : pinLabel,
            onClick: () => onPinnedChange(!isPinned),
          },
          isPinned ? "unpin" : "pin",
        ),
    ),
}));
vi.mock("@/components/classroom/device-toggle-button", () => ({
  DeviceToggleButton: () => null,
}));
vi.mock("@/components/classroom/draggable-classroom-pip", () => ({
  DraggableClassroomPip: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/components/classroom/end-class-button", () => ({
  EndClassButton: ({
    appearance,
    confirmBeforeEnd = true,
    onLeave,
    isEvent,
  }: {
    appearance?: string;
    confirmBeforeEnd?: boolean;
    onLeave?: () => void;
    isEvent?: boolean;
  }) =>
    appearance === "header"
      ? createElement("button", {
          "data-testid": "header-end-class-action",
          "data-combined": String(confirmBeforeEnd && Boolean(onLeave)),
        })
      : isEvent
        ? createElement("span", {
            "data-testid": "event-end-action",
            "data-confirm": String(confirmBeforeEnd),
          })
        : null,
}));
vi.mock("@/components/classroom/leave-class-button", () => ({
  LeaveClassButton: ({ appearance }: { appearance?: string }) =>
    appearance === "header"
      ? createElement("button", {
          "data-testid": "header-leave-class-action",
        })
      : null,
}));
vi.mock("@/components/classroom/fullscreen-button", () => ({
  FullscreenButtonCompact: () => null,
}));
vi.mock("@/components/classroom/session-closeout-dialog", () => ({
  SessionCloseoutDialog: () => null,
}));
vi.mock("@/components/classroom/classroom-ui-preview", () => ({
  ClassroomUiPreview: () => null,
}));

import { ActiveClassroomUI } from "@/components/classroom/active-classroom-ui";
import { StudentClassroomUI } from "@/components/classroom/student-classroom-ui";
import { toast } from "sonner";

const INITIAL_NOW = Date.UTC(2026, 8, 3, 14, 0);

function renderActiveClassroom(sessionNow = INITIAL_NOW) {
  return render(
    createElement(ActiveClassroomUI, {
      isCloseoutOpen: false,
      onRequestCloseout: vi.fn(),
      courseId: "class-1" as never,
      currentUserRole: "admin",
      roomName: "room-1",
      sessionNow,
      sessionIsLive: true,
      sessionTimeZone: "America/Bogota",
    }),
  );
}

function renderStudentClassroom(sessionNow = INITIAL_NOW) {
  testState.localParticipant = testState.studentParticipant;
  testState.room.localParticipant = testState.studentParticipant;
  testState.participants = [
    testState.studentParticipant,
    testState.remoteAdministrativeParticipant,
  ];

  return render(
    createElement(StudentClassroomUI, {
      courseId: "class-1" as never,
      roomName: "room-1",
      sessionNow,
    }),
  );
}

describe("classroom session stability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.extensionContext = null;
    testState.compactControls = false;
    testState.isExtensionLoading = false;
    testState.isLeadershipLoading = false;
    testState.recordingOperation = null;
    testState.screenSharing = false;
    testState.hideParticipantPanel = false;
    testState.leadership = testState.initialLeadership;
    testState.localParticipant = testState.administrativeParticipant;
    testState.room.isRecording = false;
    testState.room.state = "connected";
    testState.administrativeParticipant.isScreenShareEnabled = false;
    testState.studentParticipant.isScreenShareEnabled = false;
    testState.room.localParticipant = testState.administrativeParticipant;
    testState.participants = [testState.administrativeParticipant];
    testState.qrValue = "";
    testState.backendCall.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("requires confirmation for every event end control", () => {
    render(
      createElement(ActiveClassroomUI, {
        eventId: "event-1" as never,
        currentUserRole: "admin",
        roomName: "room-1",
        sessionNow: INITIAL_NOW,
        sessionIsLive: true,
        sessionTimeZone: "America/Bogota",
        isCloseoutOpen: false,
        onRequestCloseout: vi.fn(),
      }),
    );
    expect(screen.getAllByTestId("event-end-action").length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByTestId("event-end-action")
        .every((button) => button.getAttribute("data-confirm") === "true"),
    ).toBe(true);
  });

  it("lets session authorities share without granting new permissions", async () => {
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: vi.fn() } });
    renderActiveClassroom();
    fireEvent.click(
      screen.getAllByRole("button", { name: "classroom.shareScreen" })[0],
    );
    await waitFor(() =>
      expect(
        testState.administrativeParticipant.setScreenShareEnabled,
      ).toHaveBeenCalledWith(true, { audio: true }),
    );
    expect(
      testState.administrativeParticipant.publishData,
    ).not.toHaveBeenCalled();
    expect(testState.backendCall).not.toHaveBeenCalled();
  });

  it("requires authority approval and a second student click before capture", async () => {
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: vi.fn() } });
    renderStudentClassroom();
    fireEvent.click(
      screen.getAllByRole("button", { name: "classroom.shareScreen" })[0],
    );
    await waitFor(() =>
      expect(testState.studentParticipant.publishData).toHaveBeenCalled(),
    );
    expect(
      testState.studentParticipant.setScreenShareEnabled,
    ).not.toHaveBeenCalled();
    const handleData = testState.room.on.mock.calls.find(
      ([event]) => event === "dataReceived",
    )?.[1];
    const grant = new TextEncoder().encode(
      JSON.stringify({ type: "ALLOW_SHARE" }),
    );
    act(() => handleData(grant, testState.remoteStudentParticipant));
    expect(
      testState.studentParticipant.setScreenShareEnabled,
    ).not.toHaveBeenCalled();
    act(() => handleData(grant, testState.remoteAdministrativeParticipant));
    expect(
      testState.studentParticipant.setScreenShareEnabled,
    ).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getAllByRole("button", { name: "classroom.shareScreen" })[0],
    );
    await waitFor(() =>
      expect(
        testState.studentParticipant.setScreenShareEnabled,
      ).toHaveBeenCalledWith(true, { audio: true }),
    );
    expect(testState.backendCall).not.toHaveBeenCalled();
  });

  it.each(["staff", "student"])(
    "honors authority stop messages, but ignores student stop messages (%s)",
    async (view) => {
      testState.administrativeParticipant.isScreenShareEnabled = true;
      testState.studentParticipant.isScreenShareEnabled = true;
      if (view === "student") renderStudentClassroom();
      else renderActiveClassroom();
      const handleData = testState.room.on.mock.calls.find(
        ([event]) => event === "dataReceived",
      )?.[1];
      const stop = new TextEncoder().encode(
        JSON.stringify({ type: "STOP_SHARE" }),
      );
      act(() => handleData(stop, testState.remoteStudentParticipant));
      expect(
        testState.localParticipant.setScreenShareEnabled,
      ).not.toHaveBeenCalled();
      act(() => handleData(stop, testState.remoteAdministrativeParticipant));
      await waitFor(() =>
        expect(
          testState.localParticipant.setScreenShareEnabled,
        ).toHaveBeenCalledWith(false, { audio: true }),
      );
    },
  );

  it.each(["staff", "student"])(
    "does not attempt capture on unsupported browsers (%s)",
    (view) => {
      vi.stubGlobal("navigator", { mediaDevices: {} });
      if (view === "student") renderStudentClassroom();
      else renderActiveClassroom();
      fireEvent.click(
        screen.getAllByRole("button", { name: "classroom.shareScreen" })[0],
      );
      expect(
        testState.localParticipant.setScreenShareEnabled,
      ).not.toHaveBeenCalled();
      expect(testState.localParticipant.publishData).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        "classroom.screenShareNotSupported",
      );
    },
  );

  it("keeps recording start disabled while the durable operation is pending", () => {
    testState.recordingOperation = { pending: true, failed: false };
    renderActiveClassroom();
    expect(
      (screen.getAllByTitle("classroom.startRecording")[0] as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("surfaces a failed recording operation without a polling timer", () => {
    testState.recordingOperation = { pending: false, failed: true };
    renderActiveClassroom();
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "classroom.recordingError",
    );
  });

  it("offers leave or end class only to the room leader in the compact header", () => {
    renderActiveClassroom();

    expect(screen.getByTestId("header-end-class-action").dataset.combined).toBe(
      "true",
    );
    expect(screen.queryByTestId("header-leave-class-action")).toBeNull();
  });

  it("offers only leave to other participants in the compact header", () => {
    testState.leadership = {
      ...testState.initialLeadership,
      viewer: {
        ...testState.initialLeadership.viewer,
        isLeader: false,
      },
    };

    renderActiveClassroom();

    expect(screen.getByTestId("header-leave-class-action")).toBeTruthy();
    expect(screen.queryByTestId("header-end-class-action")).toBeNull();
  });

  it("opens the companion QR dialog from compact more actions", async () => {
    testState.compactControls = true;
    renderActiveClassroom();

    fireEvent.click(
      screen.getByRole("button", { name: "classroom.moreActions" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "classroom.connectDevice" }),
    );

    await waitFor(() =>
      expect(screen.getByText("classroom.connectTablet")).toBeTruthy(),
    );
    const displayedUrl =
      "http://localhost:3000/classroom/room-1?companion=true";
    expect(screen.getByText(displayedUrl)).toBeTruthy();
    expect(testState.qrValue).toBe(displayedUrl);
  });

  it("sounds one chime per extension decision, not on countdown updates", async () => {
    const oscillator = vi.fn(() => ({
      connect: vi.fn(),
      frequency: { value: 0 },
      type: "sine",
      start: vi.fn(),
      stop: vi.fn(),
    }));
    vi.stubGlobal(
      "AudioContext",
      class {
        state = "running";
        currentTime = 0;
        destination = {};
        resume = vi.fn(async () => {});
        close = vi.fn(async () => {});
        createOscillator = oscillator;
        createGain = () => ({
          connect: vi.fn(),
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
        });
      },
    );
    testState.extensionContext = {
      affectedStudentCount: 0,
      effectiveEnd: INITIAL_NOW,
      proposedEnd: INITIAL_NOW + 600_000,
      warningStartsAt: INITIAL_NOW - 120_000,
      hardEndsAt: INITIAL_NOW + 3_600_000,
      decisionEndsAt: INITIAL_NOW + 300_000,
    };
    const view = renderActiveClassroom();
    await waitFor(() => expect(oscillator).toHaveBeenCalledTimes(3));
    view.rerender(
      createElement(ActiveClassroomUI, {
        courseId: "class-1" as never,
        currentUserRole: "admin",
        roomName: "room-1",
        sessionNow: INITIAL_NOW + 1_000,
        sessionIsLive: true,
        sessionTimeZone: "America/Bogota",
        isCloseoutOpen: false,
        onRequestCloseout: vi.fn(),
      }),
    );
    expect(oscillator).toHaveBeenCalledTimes(3);
    testState.extensionContext = {
      ...testState.extensionContext,
      decisionEndsAt: INITIAL_NOW + 900_000,
    };
    view.rerender(
      createElement(ActiveClassroomUI, {
        courseId: "class-1" as never,
        currentUserRole: "admin",
        roomName: "room-1",
        sessionNow: INITIAL_NOW + 600_000,
        sessionIsLive: true,
        sessionTimeZone: "America/Bogota",
        isCloseoutOpen: false,
        onRequestCloseout: vi.fn(),
      }),
    );
    await waitFor(() => expect(oscillator).toHaveBeenCalledTimes(6));
  });

  it("keeps the administrative leader visible during a 15-second query transition", async () => {
    const view = renderActiveClassroom();

    expect(screen.queryByText("classroom.waitingForTeacher")).toBeNull();
    await waitFor(() => {
      expect(testState.localParticipant.setCameraEnabled).toHaveBeenCalledTimes(
        1,
      );
    });
    expect(
      testState.localParticipant.setMicrophoneEnabled,
    ).toHaveBeenCalledTimes(1);

    testState.isLeadershipLoading = true;
    view.rerender(
      createElement(ActiveClassroomUI, {
        isCloseoutOpen: false,
        onRequestCloseout: vi.fn(),
        courseId: "class-1" as never,
        currentUserRole: "admin",
        roomName: "room-1",
        sessionNow: INITIAL_NOW + 15_000,
        sessionIsLive: true,
        sessionTimeZone: "America/Bogota",
      }),
    );

    expect(screen.queryByText("classroom.waitingForTeacher")).toBeNull();
    expect(testState.localParticipant.setCameraEnabled).toHaveBeenCalledTimes(
      1,
    );
    expect(
      testState.localParticipant.setMicrophoneEnabled,
    ).toHaveBeenCalledTimes(1);
  });

  it("does not restart camera or microphone when staff changes classroom views", async () => {
    renderActiveClassroom();
    await waitFor(() => {
      expect(testState.localParticipant.setCameraEnabled).toHaveBeenCalledTimes(
        1,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Switch to mosaic" }));
    expect(
      screen.getByRole("region", { name: "classroom.mosaicView" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to presenter" }),
    );

    expect(
      screen.queryByRole("region", { name: "classroom.mosaicView" }),
    ).toBeNull();
    expect(testState.localParticipant.setCameraEnabled).toHaveBeenCalledTimes(
      1,
    );
    expect(
      testState.localParticipant.setMicrophoneEnabled,
    ).toHaveBeenCalledTimes(1);
  });

  it("leaves event staff camera and microphone off on entry", () => {
    render(
      createElement(ActiveClassroomUI, {
        isCloseoutOpen: false,
        onRequestCloseout: vi.fn(),
        eventId: "event-1" as never,
        currentUserRole: "admin",
        roomName: "event-room-1",
        sessionNow: INITIAL_NOW,
        sessionIsLive: true,
        sessionTimeZone: "America/Bogota",
      }),
    );

    expect(testState.localParticipant.setCameraEnabled).not.toHaveBeenCalled();
    expect(
      testState.localParticipant.setMicrophoneEnabled,
    ).not.toHaveBeenCalled();
  });

  it("leaves event student camera and microphone off on entry", () => {
    testState.localParticipant = testState.studentParticipant;
    testState.room.localParticipant = testState.studentParticipant;
    testState.participants = [
      testState.studentParticipant,
      testState.remoteAdministrativeParticipant,
    ];
    render(
      createElement(StudentClassroomUI, {
        eventId: "event-1" as never,
        roomName: "event-room-1",
        sessionNow: INITIAL_NOW,
      }),
    );

    expect(
      testState.studentParticipant.setCameraEnabled,
    ).not.toHaveBeenCalled();
    expect(
      testState.studentParticipant.setMicrophoneEnabled,
    ).not.toHaveBeenCalled();
  });

  it("does not restart camera or microphone when a student changes classroom views", async () => {
    renderStudentClassroom();
    await waitFor(() => {
      expect(
        testState.studentParticipant.setCameraEnabled,
      ).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Switch to mosaic" }));
    expect(
      screen.getByRole("region", { name: "classroom.mosaicView" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to presenter" }),
    );

    expect(
      screen.queryByRole("region", { name: "classroom.mosaicView" }),
    ).toBeNull();
    expect(testState.studentParticipant.setCameraEnabled).toHaveBeenCalledTimes(
      1,
    );
    expect(
      testState.studentParticipant.setMicrophoneEnabled,
    ).toHaveBeenCalledTimes(1);
  });

  it("returns to presenter when screen sharing begins during mosaic", () => {
    const view = renderActiveClassroom();
    fireEvent.click(screen.getByRole("button", { name: "Switch to mosaic" }));
    expect(
      screen.getByRole("region", { name: "classroom.mosaicView" }),
    ).toBeTruthy();

    testState.screenSharing = true;
    view.rerender(
      createElement(ActiveClassroomUI, {
        isCloseoutOpen: false,
        onRequestCloseout: vi.fn(),
        courseId: "class-1" as never,
        currentUserRole: "admin",
        roomName: "room-1",
        sessionNow: INITIAL_NOW,
        sessionIsLive: true,
        sessionTimeZone: "America/Bogota",
      }),
    );

    expect(
      screen.queryByRole("region", { name: "classroom.mosaicView" }),
    ).toBeNull();
  });

  it.each(["staff", "student"])(
    "keeps administrative observers hidden from the %s mosaic and roster",
    (experience) => {
      if (experience === "staff") {
        testState.participants = [
          testState.administrativeParticipant,
          testState.remoteStudentParticipant,
        ];
        renderActiveClassroom();
      } else {
        renderStudentClassroom();
      }
      const observers = ["admin", "superadmin", "principal"].map((role) => ({
        ...testState.remoteAdministrativeParticipant,
        identity: `observer-${role}`,
        name: `Observer ${role}`,
        metadata: JSON.stringify({ role, convexUserId: `observer-${role}` }),
      }));
      testState.participants = [...testState.participants, ...observers];

      fireEvent.click(screen.getByRole("button", { name: "Switch to mosaic" }));
      const mosaic = screen.getByRole("region", {
        name: "classroom.mosaicView",
      });
      expect(within(mosaic).getByText("Student")).toBeTruthy();
      expect(within(mosaic).getByText("Administrative leader")).toBeTruthy();
      for (const observer of observers) {
        expect(screen.queryByText(observer.name)).toBeNull();
      }
      expect(
        screen
          .getByRole("complementary")
          .getAttribute("data-participant-identities"),
      ).toBe("admin-clerk-id,student-clerk-id");
      if (experience === "student") {
        expect(within(mosaic).queryByRole("button")).toBeNull();
      }
    },
  );

  it("hides the local administrative observer while the teacher leads the mosaic", () => {
    const teacher = {
      ...testState.remoteAdministrativeParticipant,
      identity: "teacher-clerk-id",
      name: "Teacher",
      metadata: JSON.stringify({ role: "teacher", convexUserId: "teacher-1" }),
    };
    testState.leadership = {
      ...testState.initialLeadership,
      leader: {
        ...testState.initialLeadership.leader,
        participantIdentity: teacher.identity,
        role: "teacher",
      },
      viewer: { ...testState.initialLeadership.viewer, isLeader: false },
    };
    testState.participants = [
      testState.administrativeParticipant,
      teacher,
      testState.remoteStudentParticipant,
    ];
    renderActiveClassroom();
    fireEvent.click(screen.getByRole("button", { name: "Switch to mosaic" }));

    const mosaic = screen.getByRole("region", { name: "classroom.mosaicView" });
    expect(within(mosaic).getByText("Teacher")).toBeTruthy();
    expect(within(mosaic).getByText("Student")).toBeTruthy();
    expect(within(mosaic).queryByText("Administrative leader")).toBeNull();
    expect(
      screen
        .getByRole("complementary")
        .getAttribute("data-participant-identities"),
    ).toBe("student-clerk-id,teacher-clerk-id");
  });

  it("pins a student from mosaic using the existing presenter selection", () => {
    testState.participants = [
      testState.administrativeParticipant,
      testState.remoteStudentParticipant,
    ];
    renderActiveClassroom();
    fireEvent.click(screen.getByRole("button", { name: "Switch to mosaic" }));
    const mosaic = screen.getByRole("region", { name: "classroom.mosaicView" });
    expect(within(mosaic).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(
      within(mosaic).getByRole("button", { name: "classroom.pinParticipant" }),
    );

    expect(
      screen.queryByRole("region", { name: "classroom.mosaicView" }),
    ).toBeNull();
    expect(within(screen.getByRole("main")).getByText("Student")).toBeTruthy();
    expect(
      within(screen.getByRole("complementary")).getByRole("button", {
        name: "classroom.unpinParticipant",
      }),
    ).toBeTruthy();

    fireEvent.click(
      within(screen.getByRole("complementary")).getByRole("button", {
        name: "classroom.unpinParticipant",
      }),
    );
    expect(
      screen.getByRole("region", { name: "classroom.mosaicView" }),
    ).toBeTruthy();
  });

  it("clears the pin and its return layout when mosaic is selected manually", () => {
    testState.participants = [
      testState.administrativeParticipant,
      testState.remoteStudentParticipant,
    ];
    renderActiveClassroom();
    fireEvent.click(screen.getByRole("button", { name: "Switch to mosaic" }));
    fireEvent.click(
      within(
        screen.getByRole("region", { name: "classroom.mosaicView" }),
      ).getByRole("button", { name: "classroom.pinParticipant" }),
    );
    expect(within(screen.getByRole("main")).getByText("Student")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Switch to mosaic" }));
    expect(
      screen.getByRole("region", { name: "classroom.mosaicView" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "classroom.unpinParticipant" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to presenter" }),
    );
    expect(
      within(screen.getByRole("main")).getByText("Administrative leader"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "classroom.pinParticipant" }),
    );
    fireEvent.click(
      within(screen.getByRole("main")).getByRole("button", {
        name: "classroom.unpinParticipant",
      }),
    );
    expect(
      screen.queryByRole("region", { name: "classroom.mosaicView" }),
    ).toBeNull();
    expect(
      within(screen.getByRole("main")).getByText("Administrative leader"),
    ).toBeTruthy();
  });

  it("can unpin from the main stage when participant cards are unavailable", () => {
    testState.hideParticipantPanel = true;
    testState.participants = [
      testState.administrativeParticipant,
      testState.remoteStudentParticipant,
    ];
    renderActiveClassroom();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(
      within(screen.getByRole("main")).queryByRole("button", {
        name: "classroom.unpinParticipant",
      }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Switch to mosaic" }));
    fireEvent.click(
      within(
        screen.getByRole("region", { name: "classroom.mosaicView" }),
      ).getByRole("button", { name: "classroom.pinParticipant" }),
    );

    fireEvent.click(
      within(screen.getByRole("main")).getByRole("button", {
        name: "classroom.unpinParticipant",
      }),
    );
    expect(
      screen.getByRole("region", { name: "classroom.mosaicView" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "classroom.unpinParticipant" }),
    ).toBeNull();
  });

  it("returns to mosaic when the temporarily pinned participant leaves", () => {
    testState.participants = [
      testState.administrativeParticipant,
      testState.remoteStudentParticipant,
    ];
    const view = renderActiveClassroom();
    fireEvent.click(screen.getByRole("button", { name: "Switch to mosaic" }));
    fireEvent.click(
      within(
        screen.getByRole("region", { name: "classroom.mosaicView" }),
      ).getByRole("button", { name: "classroom.pinParticipant" }),
    );
    expect(within(screen.getByRole("main")).getByText("Student")).toBeTruthy();

    testState.participants = [testState.administrativeParticipant];
    view.rerender(
      createElement(ActiveClassroomUI, {
        isCloseoutOpen: false,
        onRequestCloseout: vi.fn(),
        courseId: "class-1" as never,
        currentUserRole: "admin",
        roomName: "room-1",
        sessionNow: INITIAL_NOW,
        sessionIsLive: true,
        sessionTimeZone: "America/Bogota",
      }),
    );

    expect(
      screen.getByRole("region", { name: "classroom.mosaicView" }),
    ).toBeTruthy();
    expect(screen.queryByText("Student")).toBeNull();
  });

  it("lets staff pin a student to the main stage and unpin them", () => {
    testState.participants = [
      testState.administrativeParticipant,
      testState.remoteStudentParticipant,
    ];
    renderActiveClassroom();

    const stage = screen.getByRole("main");
    expect(within(stage).getByText("Administrative leader")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "classroom.pinParticipant" }),
    );
    expect(within(stage).getByText("Student")).toBeTruthy();

    fireEvent.click(
      within(screen.getByRole("complementary")).getByRole("button", {
        name: "classroom.unpinParticipant",
      }),
    );
    expect(within(stage).getByText("Administrative leader")).toBeTruthy();
  });

  it("keeps the administrative leader visible to students during the same transition", () => {
    const view = renderStudentClassroom();

    expect(screen.queryByText("classroom.waitingForTeacher")).toBeNull();

    testState.isLeadershipLoading = true;
    act(() => {
      view.rerender(
        createElement(StudentClassroomUI, {
          courseId: "class-1" as never,
          roomName: "room-1",
          sessionNow: INITIAL_NOW + 15_000,
        }),
      );
    });

    expect(screen.queryByText("classroom.waitingForTeacher")).toBeNull();
  });

  it("uses the academic room name for the student whiteboard", () => {
    renderStudentClassroom();
    const dataHandler = testState.room.on.mock.calls.find(
      ([event]) => event === "dataReceived",
    )?.[1];

    act(() => {
      dataHandler?.(
        new TextEncoder().encode(
          JSON.stringify({ type: "WHITEBOARD_STATE", active: true }),
        ),
        testState.remoteAdministrativeParticipant,
      );
    });

    expect(
      screen.getByTestId("classroom-whiteboard").getAttribute("data-room-name"),
    ).toBe("room-1");
  });

  it("treats a confirmed null leadership result as authoritative", () => {
    const view = renderActiveClassroom();

    expect(screen.queryByText("classroom.waitingForTeacher")).toBeNull();

    testState.leadership = null;
    act(() => {
      view.rerender(
        createElement(ActiveClassroomUI, {
          isCloseoutOpen: false,
          onRequestCloseout: vi.fn(),
          courseId: "class-1" as never,
          currentUserRole: "admin",
          roomName: "room-1",
          sessionNow: INITIAL_NOW + 1_000,
          sessionIsLive: true,
          sessionTimeZone: "America/Bogota",
        }),
      );
    });

    expect(screen.getByText("classroom.waitingForTeacher")).toBeTruthy();
  });

  it("does not retain leadership when the room scope changes", () => {
    const view = renderActiveClassroom();

    testState.isLeadershipLoading = true;
    act(() => {
      view.rerender(
        createElement(ActiveClassroomUI, {
          isCloseoutOpen: false,
          onRequestCloseout: vi.fn(),
          courseId: "class-2" as never,
          currentUserRole: "admin",
          roomName: "room-2",
          sessionNow: INITIAL_NOW,
          sessionIsLive: true,
          sessionTimeZone: "America/Bogota",
        }),
      );
    });

    expect(screen.getByText("classroom.waitingForTeacher")).toBeTruthy();
  });

  it("shows the initial waiting state and replaces it when leadership first loads", () => {
    testState.isLeadershipLoading = true;
    const view = renderStudentClassroom();

    expect(screen.getByText("classroom.waitingForTeacher")).toBeTruthy();

    testState.isLeadershipLoading = false;
    act(() => {
      view.rerender(
        createElement(StudentClassroomUI, {
          courseId: "class-1" as never,
          roomName: "room-1",
          sessionNow: INITIAL_NOW,
        }),
      );
    });

    expect(screen.queryByText("classroom.waitingForTeacher")).toBeNull();
  });

  it("keeps the staff extension notice during a query transition", () => {
    testState.extensionContext = {
      affectedStudentCount: 0,
      effectiveEnd: INITIAL_NOW + 5 * 60_000,
      hardEndsAt: INITIAL_NOW + 60 * 60_000,
      proposedEnd: INITIAL_NOW + 15 * 60_000,
      warningStartsAt: INITIAL_NOW - 5 * 60_000,
    };
    const view = renderActiveClassroom();

    expect(screen.getByText("classroom.classEndingSoon")).toBeTruthy();

    testState.isExtensionLoading = true;
    act(() => {
      view.rerender(
        createElement(ActiveClassroomUI, {
          isCloseoutOpen: false,
          onRequestCloseout: vi.fn(),
          courseId: "class-1" as never,
          currentUserRole: "admin",
          roomName: "room-1",
          sessionNow: INITIAL_NOW + 15_000,
          sessionIsLive: true,
          sessionTimeZone: "America/Bogota",
        }),
      );
    });

    expect(screen.getByText("classroom.classEndingSoon")).toBeTruthy();
  });

  it("keeps the student extension notice during a query transition", () => {
    testState.extensionContext = {
      affectedStudentCount: 0,
      effectiveEnd: INITIAL_NOW + 5 * 60_000,
      hardEndsAt: INITIAL_NOW + 60 * 60_000,
      proposedEnd: INITIAL_NOW + 15 * 60_000,
      warningStartsAt: INITIAL_NOW - 5 * 60_000,
    };
    const view = renderStudentClassroom();

    expect(screen.getByText("classroom.studentClassEndingSoon")).toBeTruthy();

    testState.isExtensionLoading = true;
    act(() => {
      view.rerender(
        createElement(StudentClassroomUI, {
          courseId: "class-1" as never,
          roomName: "room-1",
          sessionNow: INITIAL_NOW + 15_000,
        }),
      );
    });

    expect(screen.getByText("classroom.studentClassEndingSoon")).toBeTruthy();
  });

  it("removes the extension notice when Convex confirms null", () => {
    testState.extensionContext = {
      affectedStudentCount: 0,
      effectiveEnd: INITIAL_NOW + 5 * 60_000,
      hardEndsAt: INITIAL_NOW + 60 * 60_000,
      proposedEnd: INITIAL_NOW + 15 * 60_000,
      warningStartsAt: INITIAL_NOW - 5 * 60_000,
    };
    const view = renderActiveClassroom();

    expect(screen.getByText("classroom.classEndingSoon")).toBeTruthy();

    testState.extensionContext = null;
    act(() => {
      view.rerender(
        createElement(ActiveClassroomUI, {
          isCloseoutOpen: false,
          onRequestCloseout: vi.fn(),
          courseId: "class-1" as never,
          currentUserRole: "admin",
          roomName: "room-1",
          sessionNow: INITIAL_NOW + 1_000,
          sessionIsLive: true,
          sessionTimeZone: "America/Bogota",
        }),
      );
    });

    expect(screen.queryByText("classroom.classEndingSoon")).toBeNull();
  });

  it("keeps the stop action pending until LiveKit confirms recording ended", async () => {
    testState.room.isRecording = true;
    testState.backendCall.mockImplementation(async (args?: unknown) => {
      if (
        typeof args === "object" &&
        args !== null &&
        "start" in args &&
        args.start === false
      ) {
        return { success: true, message: "Recording stop requested" };
      }
      return null;
    });
    const view = renderActiveClassroom();

    expect(screen.getByRole("banner").getAttribute("data-recording")).toBe(
      "true",
    );
    fireEvent.click(screen.getAllByTitle("classroom.stopRecording")[0]);

    await waitFor(() => {
      expect(testState.backendCall).toHaveBeenCalledWith({
        roomName: "room-1",
        start: false,
      });
      expect(vi.mocked(toast.info)).toHaveBeenCalledWith(
        "classroom.recordingStopping",
      );
    });
    expect(
      (
        screen.getAllByTitle(
          "classroom.recordingStopping",
        )[0] as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByRole("banner").getAttribute("data-recording")).toBe(
      "false",
    );
    expect(
      screen.getByRole("banner").getAttribute("data-finalizing-recording"),
    ).toBe("true");
    expect(vi.mocked(toast.success)).not.toHaveBeenCalledWith(
      "classroom.recordingStopped",
    );

    testState.room.isRecording = false;
    act(() => {
      view.rerender(
        createElement(ActiveClassroomUI, {
          isCloseoutOpen: false,
          onRequestCloseout: vi.fn(),
          courseId: "class-1" as never,
          currentUserRole: "admin",
          roomName: "room-1",
          sessionNow: INITIAL_NOW + 1_000,
          sessionIsLive: true,
          sessionTimeZone: "America/Bogota",
        }),
      );
    });

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
        "classroom.recordingStopped",
      );
    });
    expect(screen.queryByTitle("classroom.recordingStopping")).toBeNull();
    expect(
      (screen.getAllByTitle("classroom.startRecording")[0] as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
