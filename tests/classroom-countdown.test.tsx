import { type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/es.json";
import { ClassroomCountdown } from "@/components/classroom/classroom-countdown";
import { ClassroomHeader } from "@/components/classroom/classroom-header";
import { ClassroomStage } from "@/components/classroom/classroom-stage";
import {
  ClassroomPresentationContext,
  type ClassroomPresentation,
} from "@/components/classroom/classroom-presentation";

vi.mock("@/components/classroom/shared-whiteboard", () => ({
  SharedWhiteboard: () => null,
}));
vi.mock("@livekit/components-react", () => ({ VideoTrack: () => null }));
import { useClassroomClock } from "@/components/classroom/use-classroom-clock";
import { getConfirmedExtensionEnd } from "@/lib/live-session-policy";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function Intl({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale="es"
      timeZone="America/Bogota"
      messages={messages}
    >
      {children}
    </NextIntlClientProvider>
  );
}

const END = Date.UTC(2026, 8, 17, 14, 30);

describe("classroom countdown", () => {
  it("derives remaining time from the deadline and catches up after a suspended tab", () => {
    const view = render(<ClassroomCountdown end={END} now={END - 90_001} />, {
      wrapper: Intl,
    });
    expect(screen.getByRole("timer").textContent).toContain("01:31");
    view.rerender(<ClassroomCountdown end={END} now={END - 20_000} />);
    expect(screen.getByRole("timer").textContent).toContain("00:20");
    view.unmount();
    render(<ClassroomCountdown end={END} now={END - 19_000} />, {
      wrapper: Intl,
    });
    expect(screen.getByRole("timer").textContent).toContain("00:19");
    expect(screen.getByRole("timer").getAttribute("aria-live")).toBe("off");
  });

  it("uses the confirmed extension deadline rather than restarting ten minutes", () => {
    const extensionEndsAt = getConfirmedExtensionEnd(END, END);
    const view = render(
      <ClassroomCountdown
        end={END}
        now={END + 120_000}
        extensionEndsAt={extensionEndsAt}
      />,
      { wrapper: Intl },
    );
    expect(
      screen.getByRole("timer", { name: "Extensión · Tiempo restante: 08:00" })
        .textContent,
    ).toContain("+08:00");
    view.rerender(
      <ClassroomCountdown
        end={END}
        now={END + 660_000}
        extensionEndsAt={getConfirmedExtensionEnd(extensionEndsAt, END)}
      />,
    );
    expect(screen.getByRole("timer").textContent).toContain("+09:00");
  });

  it("stays at zero while the existing session policy handles closure or extension", () => {
    const view = render(<ClassroomCountdown end={END} now={END + 1_000} />, {
      wrapper: Intl,
    });
    expect(
      screen.getByRole("timer", { name: "El tiempo de la clase ha finalizado" })
        .textContent,
    ).toContain("00:00");
    view.rerender(
      <ClassroomCountdown
        end={END}
        now={END + 2_000}
        extensionEndsAt={END + 600_000}
      />,
    );
    expect(screen.getByRole("timer").textContent).toContain("+09:58");
  });

  it.each([false, true])(
    "places the timer beside the room name (phone landscape: %s)",
    (isPhoneLandscape) => {
      render(
        <ClassroomHeader
          title="Algebra I"
          isActive
          activeLabel="En vivo"
          waitingLabel="Esperando"
          isRecording={false}
          isPhoneLandscape={isPhoneLandscape}
          isPanelOpen={false}
          openPanelLabel="Abrir panel"
          closePanelLabel="Cerrar panel"
          onPanelOpenChange={vi.fn()}
          countdown={<ClassroomCountdown end={END} now={END - 60_000} />}
        />,
        { wrapper: Intl },
      );
      const title = screen.getByText("Algebra I");
      const nameRow = isPhoneLandscape
        ? title.parentElement?.parentElement
        : title.parentElement;
      expect(nameRow?.querySelector('[role="timer"]')).toBe(
        screen.getByRole("timer"),
      );
      expect(screen.getByRole("timer").textContent).toContain("01:00");
    },
  );
});

it("shows the timer on the stage only when the floating view hides the header", () => {
  function View({ compact }: { compact: boolean }) {
    const countdown = <ClassroomCountdown end={END} now={END - 60_000} />;
    return (
      <Intl>
        <ClassroomPresentationContext.Provider
          value={
            { mode: compact ? "compact" : "full" } as ClassroomPresentation
          }
        >
          <ClassroomHeader
            title="Algebra I"
            isActive
            activeLabel="En vivo"
            waitingLabel="Esperando"
            isRecording={false}
            isPhoneLandscape={false}
            isPanelOpen={false}
            openPanelLabel="Abrir panel"
            closePanelLabel="Cerrar panel"
            onPanelOpenChange={vi.fn()}
            countdown={countdown}
          />
          <ClassroomStage
            stageRef={{ current: null }}
            phoneControls={null}
            isPhoneLandscape={false}
            stageControlsVisible={false}
            onRevealControls={vi.fn()}
            zoom={1}
            onZoom={vi.fn()}
            contentActive={false}
            isWhiteboardActive={false}
            followViewport={false}
            onToggleFollowViewport={vi.fn()}
            followingLabel="Siguiendo"
            unlockedLabel="Vista libre"
            isFullscreen={false}
            enterFullscreenLabel="Pantalla completa"
            exitFullscreenLabel="Salir"
            countdown={countdown}
          >
            <input aria-label="Contenido de la sala" defaultValue="" />
          </ClassroomStage>
        </ClassroomPresentationContext.Provider>
      </Intl>
    );
  }
  const view = render(<View compact={false} />);
  const content = screen.getByRole("textbox");
  fireEvent.change(content, { target: { value: "conservar" } });
  expect(screen.getAllByRole("timer")).toHaveLength(1);
  view.rerender(<View compact />);
  expect(screen.getAllByRole("timer")).toHaveLength(1);
  expect(screen.getByRole("timer").closest(".absolute")).not.toBeNull();
  expect(screen.getByRole("textbox")).toBe(content);
  expect((content as HTMLInputElement).value).toBe("conservar");
});

describe("shared classroom clock", () => {
  it("uses one timer, catches up on focus/visibility, and cleans up", () => {
    vi.useFakeTimers();
    vi.setSystemTime(END - 60_000);
    const view = renderHook(useClassroomClock);
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(1_000));
    expect(view.result.current).toBe(END - 59_000);
    vi.setSystemTime(END - 10_000);
    fireEvent.focus(window);
    expect(view.result.current).toBe(END - 10_000);
    vi.setSystemTime(END - 5_000);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(view.result.current).toBe(END - 5_000);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
