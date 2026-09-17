"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useClassroomFloatingWindow } from "@/hooks/use-classroom-floating-window";
import FlexiClassroom from "./flexi-classroom-client";
import {
  ClassroomPresentationContext,
  type ClassroomPersistence,
  type ClassroomPresentation,
} from "./classroom-presentation";
import { Button } from "@/components/ui/button";

interface ClassroomSession {
  roomName: string;
  isStudentView: boolean;
  classroomPath: string;
  uiPreviewEnabled: boolean;
}

const SessionOutletContext = createContext<{
  registerOutlet: (
    session: ClassroomSession,
    target: HTMLElement,
  ) => () => void;
  leaveSession: () => void;
  external: boolean;
  returnToClassroom: () => void;
} | null>(null);

const EMPTY_PERSISTENCE: ClassroomPersistence = {
  canPersist: false,
  needsFullView: false,
};

export function ClassroomSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [session, setSession] = useState<ClassroomSession | null>(null);
  const [outlet, setOutlet] = useState<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [persistence, setPersistence] = useState(EMPTY_PERSISTENCE);
  const [restoring, setRestoring] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const outletRef = useRef<HTMLElement | null>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<ClassroomSession | null>(null);
  const routeRequestRef = useRef<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("classroom");

  useEffect(() => {
    const container = document.createElement("div");
    container.className = "flex h-full min-h-0 w-full flex-col overflow-hidden";
    hostRef.current = container;
    setHost(container);
    return () => {
      container.remove();
      hostRef.current = null;
    };
  }, []);

  const restoreHost = useCallback(() => {
    const target = outletRef.current?.isConnected
      ? outletRef.current
      : floatingRef.current;
    if (target && hostRef.current) target.append(hostRef.current);
  }, []);

  const {
    externalWindow,
    nativeVideoActive,
    opening,
    error,
    floatingKind,
    openFloating,
    openWindow,
    close: closeWindow,
  } = useClassroomFloatingWindow({
    host,
    video,
    enabled: persistence.canPersist && !persistence.needsFullView,
    restoreHost,
  });

  const registerOutlet = useCallback(
    (next: ClassroomSession, target: HTMLElement) => {
      outletRef.current = target;
      setOutlet(target);
      setRestoring(false);
      setMinimized(false);
      routeRequestRef.current = null;
      const current = sessionRef.current;
      if (
        current?.roomName !== next.roomName ||
        current.isStudentView !== next.isStudentView ||
        current.uiPreviewEnabled !== next.uiPreviewEnabled
      ) {
        sessionRef.current = next;
        if (current?.roomName !== next.roomName)
          setPersistence(EMPTY_PERSISTENCE);
        setSession(next);
      }
      return () => {
        if (outletRef.current !== target) return;
        outletRef.current = null;
        setOutlet(null);
      };
    },
    [],
  );

  const reportPersistence = useCallback((next: ClassroomPersistence) => {
    setPersistence((current) =>
      current.canPersist === next.canPersist &&
      current.needsFullView === next.needsFullView
        ? current
        : next,
    );
  }, []);

  const returnToClassroom = useCallback(() => {
    setMinimized(false);
    closeWindow();
    window.focus();
    if (!session || pathname === session.classroomPath) return;
    if (routeRequestRef.current === session.classroomPath) return;
    routeRequestRef.current = session.classroomPath;
    setRestoring(true);
    router.push(session.classroomPath);
  }, [closeWindow, session, pathname, router]);

  const leaveSession = useCallback(() => {
    closeWindow();
    sessionRef.current = null;
    setSession(null);
    setPersistence(EMPTY_PERSISTENCE);
    setRestoring(false);
    setMinimized(false);
  }, [closeWindow]);

  useEffect(() => {
    closeWindow();
  }, [session?.roomName, closeWindow]);

  useLayoutEffect(() => {
    if (!host || externalWindow) return;
    if (minimized && floatingRef.current) floatingRef.current.append(host);
    else restoreHost();
  }, [host, outlet, externalWindow, minimized, restoreHost]);

  useEffect(() => {
    if (!persistence.canPersist) setMinimized(false);
    if (persistence.needsFullView) returnToClassroom();
    if (
      session &&
      !outlet &&
      !persistence.canPersist &&
      !persistence.needsFullView
    ) {
      sessionRef.current = null;
      setSession(null);
    }
  }, [session, outlet, persistence, returnToClassroom]);

  const compact = Boolean(
    externalWindow || minimized || (!outlet && !restoring),
  );
  const presentation = useMemo<ClassroomPresentation | null>(
    () =>
      session
        ? {
            mode: compact ? "compact" : "full",
            ownerWindow: externalWindow ?? undefined,
            classroomPath: session.classroomPath,
            uiPreviewEnabled: session.uiPreviewEnabled,
            enabled: persistence.canPersist && !persistence.needsFullView,
            external: Boolean(externalWindow),
            nativeVideoActive: nativeVideoActive,
            opening: opening,
            error: error,
            floatingKind,
            openFloating: () => {
              if (floatingKind === "internal") setMinimized(true);
              else void openFloating();
            },
            openWindow: openWindow,
            returnToClassroom,
            setVideoElement: setVideo,
            reportPersistence,
            leaveSession,
          }
        : null,
    [
      session,
      compact,
      persistence,
      externalWindow,
      nativeVideoActive,
      opening,
      error,
      floatingKind,
      openFloating,
      openWindow,
      returnToClassroom,
      reportPersistence,
      leaveSession,
    ],
  );
  const outletContext = useMemo(
    () => ({
      registerOutlet,
      leaveSession,
      external: Boolean(externalWindow),
      returnToClassroom,
    }),
    [registerOutlet, leaveSession, externalWindow, returnToClassroom],
  );

  return (
    <SessionOutletContext.Provider value={outletContext}>
      {children}
      <div
        ref={floatingRef}
        data-classroom-mini={session && (!outlet || minimized) ? "" : undefined}
        className={
          restoring
            ? "fixed inset-0 z-50 bg-card"
            : "fixed bottom-3 right-3 z-40 h-[min(400px,calc(100dvh-24px))] w-[min(480px,calc(100vw-24px))] overflow-hidden rounded-md border border-border bg-card shadow-xl"
        }
        hidden={
          !session || (Boolean(outlet) && !minimized) || Boolean(externalWindow)
        }
      />
      {host &&
        session &&
        presentation &&
        createPortal(
          <ClassroomPresentationContext.Provider value={presentation}>
            {error && (
              <p
                role="status"
                className="shrink-0 bg-muted px-3 py-2 text-xs text-muted-foreground"
              >
                {t("floatingWindowUnavailable")}
              </p>
            )}
            <div className="min-h-0 flex-1">
              <FlexiClassroom
                key={session.roomName}
                roomName={session.roomName}
                isStudentView={session.isStudentView}
              />
            </div>
          </ClassroomPresentationContext.Provider>,
          host,
        )}
    </SessionOutletContext.Provider>
  );
}

export function ClassroomSessionOutlet({
  roomName,
  isStudentView = false,
  isCompanion = false,
  classroomPath,
  uiPreviewEnabled = false,
}: {
  roomName: string;
  isStudentView?: boolean;
  isCompanion?: boolean;
  classroomPath: string;
  uiPreviewEnabled?: boolean;
}) {
  return isCompanion ? (
    <CompanionOutlet roomName={roomName} isStudentView={isStudentView} />
  ) : (
    <SessionOutlet
      session={{ roomName, isStudentView, classroomPath, uiPreviewEnabled }}
    />
  );
}

function CompanionOutlet({
  roomName,
  isStudentView,
}: {
  roomName: string;
  isStudentView: boolean;
}) {
  const leaveSession = useContext(SessionOutletContext)?.leaveSession;
  useLayoutEffect(() => {
    leaveSession?.();
  }, [leaveSession]);
  return (
    <FlexiClassroom
      roomName={roomName}
      isStudentView={isStudentView}
      isCompanion
    />
  );
}

function SessionOutlet({ session: descriptor }: { session: ClassroomSession }) {
  const context = useContext(SessionOutletContext);
  const register = context?.registerOutlet;
  const t = useTranslations("classroom");
  const targetRef = useRef<HTMLDivElement>(null);
  const { roomName, isStudentView, classroomPath, uiPreviewEnabled } =
    descriptor;
  const session = useMemo(
    () => ({ roomName, isStudentView, classroomPath, uiPreviewEnabled }),
    [roomName, isStudentView, classroomPath, uiPreviewEnabled],
  );

  useLayoutEffect(() => {
    if (register && targetRef.current)
      return register(session, targetRef.current);
  }, [register, session]);

  return register ? (
    <div ref={targetRef} className="h-full min-h-0 w-full">
      <div
        hidden={!context?.external}
        className="h-full items-center justify-center bg-card p-6 text-center"
      >
        {context?.external && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-muted-foreground">
              {t("classroomInFloatingWindow")}
            </p>
            <Button variant="outline" onClick={context.returnToClassroom}>
              {t("returnToClassroom")}
            </Button>
          </div>
        )}
      </div>
    </div>
  ) : (
    <FlexiClassroom roomName={roomName} isStudentView={isStudentView} />
  );
}
