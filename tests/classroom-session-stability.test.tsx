import { createElement, type ReactNode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
    backendCall: vi.fn(async () => null),
    extensionContext: null as {
      affectedStudentCount: number;
      effectiveEnd: number;
      hardEndsAt: number;
      proposedEnd: number;
      warningStartsAt: number;
    } | null,
    isExtensionLoading: false,
    isLeadershipLoading: false,
    leadership: leadership as typeof leadership | null,
    initialLeadership: leadership,
    localParticipant: administrativeParticipant,
    participants: [administrativeParticipant],
    remoteAdministrativeParticipant,
    studentParticipant,
    room: {
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
  },
}));

vi.mock("convex/react", () => ({
  useAction: () => testState.backendCall,
  useMutation: () => testState.backendCall,
  useQuery: (query: string) => {
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
  useLocalParticipant: () => ({
    localParticipant: testState.localParticipant,
  }),
  useParticipants: () => testState.participants,
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
vi.mock("qrcode.react", () => ({ QRCodeSVG: () => null }));

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
    isScreenSharingActive: false,
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
  ClassroomHeader: ({ action }: { action?: ReactNode }) =>
    createElement("header", null, action),
}));
vi.mock("@/components/classroom/classroom-stage", () => ({
  ClassroomScreenShareContent: () => null,
  ClassroomStage: ({ children }: { children: ReactNode }) =>
    createElement("main", null, children),
  ClassroomWhiteboardContent: () => null,
}));
vi.mock("@/components/classroom/classroom-participants-panel", () => ({
  ClassroomParticipantsPanel: ({ children }: { children?: ReactNode }) =>
    createElement("aside", null, children),
}));
vi.mock("@/components/classroom/classroom-action-bar", () => ({
  ClassroomActionBar: ({
    center,
    left,
    right,
  }: {
    center: ReactNode;
    left: ReactNode;
    right: ReactNode;
  }) => createElement("nav", null, left, center, right),
  ClassroomActionButton: () => null,
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
  }: {
    participant: { name?: string };
  }) => createElement("div", null, participant.name),
}));
vi.mock("@/components/classroom/device-toggle-button", () => ({
  DeviceToggleButton: () => null,
}));
vi.mock("@/components/classroom/draggable-classroom-pip", () => ({
  DraggableClassroomPip: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/components/classroom/end-class-button", () => ({
  EndClassButton: () => null,
}));
vi.mock("@/components/classroom/leave-class-button", () => ({
  LeaveClassButton: () => null,
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

const INITIAL_NOW = Date.UTC(2026, 8, 3, 14, 0);

function renderActiveClassroom(sessionNow = INITIAL_NOW) {
  return render(
    createElement(ActiveClassroomUI, {
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
    testState.isExtensionLoading = false;
    testState.isLeadershipLoading = false;
    testState.leadership = testState.initialLeadership;
    testState.localParticipant = testState.administrativeParticipant;
    testState.room.localParticipant = testState.administrativeParticipant;
    testState.participants = [testState.administrativeParticipant];
  });

  afterEach(() => cleanup());

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

  it("treats a confirmed null leadership result as authoritative", () => {
    const view = renderActiveClassroom();

    expect(screen.queryByText("classroom.waitingForTeacher")).toBeNull();

    testState.leadership = null;
    act(() => {
      view.rerender(
        createElement(ActiveClassroomUI, {
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
});
