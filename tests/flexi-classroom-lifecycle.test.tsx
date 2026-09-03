import { createElement, StrictMode, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DisconnectReason } from "livekit-client";

type LiveKitRoomTestProps = {
  children?: ReactNode;
  token?: string;
  onDisconnected?: (reason?: number) => void | Promise<void>;
  onError?: (error: Error) => void;
};

const createSessionStatus = () => ({
  scheduleId: "schedule-1",
  status: "scheduled",
  isPrimaryTeacher: false,
  roomAdmin: true,
  isLive: true,
  leadershipRole: "admin" as string | null,
  start: Date.UTC(2026, 8, 2, 17, 0),
  timeZone: "America/Bogota",
});

const createScheduleDetails = (roomName = "room-1") => ({
  class: {
    _id: `class-${roomName}`,
    name: `Classroom ${roomName}`,
    curriculumIconKey: "test",
  },
});

const testState = vi.hoisted(() => ({
  roomLifecycle: {
    mounts: 0,
    unmounts: 0,
    mountedTokens: [] as Array<string | undefined>,
  },
  queryLifecycle: {
    loadingTransitions: 0,
    simulateMinuteLoading: false,
  },
  sessionStatus: undefined as
    | ReturnType<typeof createSessionStatus>
    | null
    | undefined,
  scheduleDetails: undefined as
    | ReturnType<typeof createScheduleDetails>
    | null
    | undefined,
  currentUser: {
    user: { _id: "user-1" } as { _id: string } | null | undefined,
    isLoading: false,
    isAuthenticated: true,
  },
  getToken: vi.fn(),
  logPresence: vi.fn(async () => null),
  translate: vi.fn((key: string) => key),
  searchParams: { get: () => null },
  fullscreen: {
    isFullscreen: false,
    isSupported: false,
    toggleFullscreen: vi.fn(),
  },
  router: {
    push: vi.fn(),
    back: vi.fn(),
  },
  liveKitProps: null as LiveKitRoomTestProps | null,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    livekit: {
      getToken: "getToken",
    },
    schedule: {
      getSessionStatus: "getSessionStatus",
      getWithDetails: "getWithDetails",
      logStudentPresence: "logStudentPresence",
    },
  },
}));

vi.mock("convex/react", async () => {
  const React = await import("react");

  return {
    useAction: () => testState.getToken,
    useMutation: () => testState.logPresence,
    useQuery: (query: string, args: unknown) => {
      const isSessionStatus = query === "getSessionStatus";

      if (!isSessionStatus) {
        return args === "skip" ? undefined : testState.scheduleDetails;
      }

      if (!testState.queryLifecycle.simulateMinuteLoading) {
        return testState.sessionStatus;
      }

      const queryKey =
        args && typeof args === "object" && "now" in args
          ? String((args as { now: number }).now)
          : query;
      const [result, setResult] = React.useState<unknown>(
        testState.sessionStatus,
      );
      const previousQueryKey = React.useRef(queryKey);

      React.useEffect(() => {
        if (previousQueryKey.current === queryKey) return;

        previousQueryKey.current = queryKey;
        testState.queryLifecycle.loadingTransitions += 1;
        setResult(undefined);

        const timer = window.setTimeout(
          () => setResult(testState.sessionStatus),
          25,
        );
        return () => window.clearTimeout(timer);
      }, [queryKey]);

      return result;
    },
  };
});

vi.mock("@livekit/components-react", async () => {
  const React = await import("react");

  return {
    LiveKitRoom: (props: LiveKitRoomTestProps) => {
      testState.liveKitProps = props;

      React.useEffect(() => {
        testState.roomLifecycle.mounts += 1;
        testState.roomLifecycle.mountedTokens.push(props.token);
        return () => {
          testState.roomLifecycle.unmounts += 1;
        };
      }, []);

      return React.createElement(
        "div",
        { "data-testid": "livekit-room" },
        props.children,
      );
    },
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "es", orgSlug: "school" }),
  useRouter: () => testState.router,
  useSearchParams: () => testState.searchParams,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => testState.translate,
}));

vi.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => testState.currentUser,
}));

vi.mock("@/hooks/use-fullscreen", () => ({
  useFullscreen: () => testState.fullscreen,
}));

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ setOpen: vi.fn() }),
}));

vi.mock("@/components/classroom/active-classroom-ui", () => ({
  ActiveClassroomUI: () => null,
}));

vi.mock("@/components/classroom/student-classroom-ui", () => ({
  StudentClassroomUI: () => null,
}));

vi.mock("@/components/classroom/companion-classroom-ui", () => ({
  CompanionClassroomUI: () => null,
}));

vi.mock("@/components/student/rocket-transition", () => ({
  ClassroomRocketLoader: () => null,
}));

import FlexiClassroom from "@/components/classroom/flexi-classroom";

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("FlexiClassroom LiveKit lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T18:00:00.000Z"));
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    vi.clearAllMocks();
    testState.roomLifecycle.mounts = 0;
    testState.roomLifecycle.unmounts = 0;
    testState.roomLifecycle.mountedTokens = [];
    testState.queryLifecycle.loadingTransitions = 0;
    testState.queryLifecycle.simulateMinuteLoading = false;
    testState.sessionStatus = createSessionStatus();
    testState.scheduleDetails = createScheduleDetails();
    testState.currentUser = {
      user: { _id: "user-1" },
      isLoading: false,
      isAuthenticated: true,
    };
    testState.getToken.mockImplementation(
      async ({ roomName }: { roomName: string }) => `token-${roomName}`,
    );
    testState.liveKitProps = null;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps one LiveKit room mounted across two minute query refreshes", async () => {
    testState.queryLifecycle.simulateMinuteLoading = true;
    render(
      createElement(FlexiClassroom, {
        roomName: "room-1",
        isStudentView: true,
      }),
    );

    await flushPromises();

    expect(screen.getByTestId("livekit-room")).toBeTruthy();
    expect(testState.roomLifecycle).toMatchObject({ mounts: 1, unmounts: 0 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_025);
    });

    expect(testState.queryLifecycle.loadingTransitions).toBe(1);
    expect(testState.roomLifecycle).toMatchObject({ mounts: 1, unmounts: 0 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_975);
    });

    expect(testState.queryLifecycle.loadingTransitions).toBe(2);
    expect(screen.getByTestId("livekit-room")).toBeTruthy();
    expect(testState.roomLifecycle).toMatchObject({ mounts: 1, unmounts: 0 });
    expect(testState.getToken).toHaveBeenCalledTimes(1);
  });

  it("keeps the room mounted while schedule details refresh", async () => {
    const view = render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    testState.scheduleDetails = undefined;
    view.rerender(createElement(FlexiClassroom, { roomName: "room-1" }));

    expect(screen.getByTestId("livekit-room")).toBeTruthy();
    expect(testState.roomLifecycle).toMatchObject({ mounts: 1, unmounts: 0 });
  });

  it("keeps the room mounted while the current user refreshes", async () => {
    const view = render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    testState.currentUser = {
      user: undefined,
      isLoading: true,
      isAuthenticated: true,
    };
    view.rerender(createElement(FlexiClassroom, { roomName: "room-1" }));

    expect(screen.getByTestId("livekit-room")).toBeTruthy();
    expect(testState.roomLifecycle).toMatchObject({ mounts: 1, unmounts: 0 });
  });

  it("does not request another token when the same user object is refreshed", async () => {
    const view = render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    testState.currentUser = {
      user: { _id: "user-1" },
      isLoading: false,
      isAuthenticated: true,
    };
    view.rerender(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    expect(testState.getToken).toHaveBeenCalledTimes(1);
  });

  it("requests a scoped token when the authenticated user changes", async () => {
    const view = render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    testState.currentUser = {
      user: { _id: "user-2" },
      isLoading: false,
      isAuthenticated: true,
    };
    view.rerender(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    expect(testState.getToken).toHaveBeenCalledTimes(2);
    expect(testState.roomLifecycle).toMatchObject({ mounts: 2, unmounts: 1 });
  });

  it("requests a scoped token when companion mode changes", async () => {
    const view = render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    view.rerender(
      createElement(FlexiClassroom, {
        roomName: "room-1",
        isCompanion: true,
      }),
    );
    await flushPromises();

    expect(testState.getToken).toHaveBeenNthCalledWith(1, {
      roomName: "room-1",
      isCompanion: false,
    });
    expect(testState.getToken).toHaveBeenNthCalledWith(2, {
      roomName: "room-1",
      isCompanion: true,
    });
    expect(testState.roomLifecycle).toMatchObject({ mounts: 2, unmounts: 1 });
  });

  it("unmounts the room after authentication is definitively revoked", async () => {
    const view = render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    testState.currentUser = {
      user: null,
      isLoading: false,
      isAuthenticated: false,
    };
    view.rerender(createElement(FlexiClassroom, { roomName: "room-1" }));

    expect(screen.queryByTestId("livekit-room")).toBeNull();
    expect(testState.roomLifecycle).toMatchObject({ mounts: 1, unmounts: 1 });
  });

  it("requests one token when React replays effects in development", async () => {
    render(
      createElement(
        StrictMode,
        null,
        createElement(FlexiClassroom, { roomName: "room-1" }),
      ),
    );
    await flushPromises();

    expect(testState.getToken).toHaveBeenCalledTimes(1);
  });

  it("recovers from an initial token error without reloading the page", async () => {
    testState.getToken.mockRejectedValueOnce(new Error("temporary failure"));
    render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    expect(screen.queryByTestId("livekit-room")).toBeNull();
    fireEvent.click(screen.getByText("classroom.tryAgain"));
    await flushPromises();

    expect(testState.getToken).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("livekit-room")).toBeTruthy();
  });

  it("keeps the room visible when LiveKit reports a connection error", async () => {
    render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    act(() => {
      testState.liveKitProps?.onError?.(new Error("network interruption"));
    });

    expect(screen.getByTestId("livekit-room")).toBeTruthy();
    expect(screen.getByText("classroom.tryAgain")).toBeTruthy();
    expect(testState.roomLifecycle).toMatchObject({ mounts: 1, unmounts: 0 });
  });

  it("retries with a fresh token without reloading the page", async () => {
    render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    act(() => {
      testState.liveKitProps?.onError?.(new Error("connection failed"));
    });
    fireEvent.click(screen.getByText("classroom.tryAgain"));
    await flushPromises();

    expect(testState.getToken).toHaveBeenCalledTimes(2);
    expect(testState.roomLifecycle).toMatchObject({ mounts: 2, unmounts: 1 });
    expect(screen.getByTestId("livekit-room")).toBeTruthy();
  });

  it("does not navigate away after an unexpected final disconnect", async () => {
    render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    await act(async () => {
      await testState.liveKitProps?.onDisconnected?.(0);
    });

    expect(testState.router.push).not.toHaveBeenCalled();
    expect(screen.getByTestId("livekit-room")).toBeTruthy();
    expect(screen.getByText("classroom.tryAgain")).toBeTruthy();
  });

  it("does not retry automatically when the same identity opens another tab", async () => {
    render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    await act(async () => {
      await testState.liveKitProps?.onDisconnected?.(
        DisconnectReason.DUPLICATE_IDENTITY,
      );
    });

    expect(testState.getToken).toHaveBeenCalledTimes(1);
    expect(testState.router.push).not.toHaveBeenCalled();
    expect(screen.getByText("classroom.duplicateSession")).toBeTruthy();
  });

  it("navigates after a client-initiated disconnect", async () => {
    render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    await act(async () => {
      await testState.liveKitProps?.onDisconnected?.(1);
    });

    expect(testState.router.push).toHaveBeenCalledWith("/es/school");
  });

  it("unmounts only after a confirmed terminal session state", async () => {
    const view = render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    testState.sessionStatus = {
      ...createSessionStatus(),
      status: "completed",
      isLive: false,
    };
    view.rerender(createElement(FlexiClassroom, { roomName: "room-1" }));

    expect(screen.queryByTestId("livekit-room")).toBeNull();
    expect(screen.getByText("classroom.classEnded")).toBeTruthy();
    expect(testState.roomLifecycle).toMatchObject({ mounts: 1, unmounts: 1 });
  });

  it("ignores a cleanup disconnect after a terminal state is confirmed", async () => {
    const view = render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();
    const disconnect = testState.liveKitProps?.onDisconnected;

    testState.sessionStatus = {
      ...createSessionStatus(),
      status: "completed",
      isLive: false,
    };
    view.rerender(createElement(FlexiClassroom, { roomName: "room-1" }));
    await act(async () => {
      await disconnect?.(1);
    });

    expect(testState.router.push).not.toHaveBeenCalled();
    expect(screen.getByText("classroom.classEnded")).toBeTruthy();
  });

  it("unmounts when Convex confirms that the room no longer exists", async () => {
    const view = render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    testState.sessionStatus = null;
    view.rerender(createElement(FlexiClassroom, { roomName: "room-1" }));

    expect(screen.queryByTestId("livekit-room")).toBeNull();
    expect(screen.getByText("classroom.notFound")).toBeTruthy();
    expect(testState.roomLifecycle).toMatchObject({ mounts: 1, unmounts: 1 });
  });

  it("does not reuse the previous room or token when roomName changes", async () => {
    const view = render(createElement(FlexiClassroom, { roomName: "room-1" }));
    await flushPromises();

    testState.sessionStatus = {
      ...createSessionStatus(),
      scheduleId: "schedule-2",
    };
    testState.scheduleDetails = createScheduleDetails("room-2");
    view.rerender(createElement(FlexiClassroom, { roomName: "room-2" }));
    await flushPromises();

    expect(testState.roomLifecycle).toMatchObject({ mounts: 2, unmounts: 1 });
    expect(testState.roomLifecycle.mountedTokens).toEqual([
      "token-room-1",
      "token-room-2",
    ]);
  });

  it("joins immediately when Convex changes a waiting session to live", async () => {
    testState.sessionStatus = {
      ...createSessionStatus(),
      roomAdmin: false,
      isLive: false,
      leadershipRole: null,
    };
    const view = render(
      createElement(FlexiClassroom, {
        roomName: "room-1",
        isStudentView: true,
      }),
    );

    expect(screen.queryByTestId("livekit-room")).toBeNull();
    expect(testState.getToken).not.toHaveBeenCalled();

    testState.sessionStatus = {
      ...createSessionStatus(),
      roomAdmin: false,
      isLive: true,
      leadershipRole: null,
    };
    view.rerender(
      createElement(FlexiClassroom, {
        roomName: "room-1",
        isStudentView: true,
      }),
    );
    await flushPromises();

    expect(screen.getByTestId("livekit-room")).toBeTruthy();
    expect(testState.getToken).toHaveBeenCalledTimes(1);
  });
});
