import { useRef, type ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/es.json";
import {
  ClassroomPresentationContext,
  type ClassroomPresentation,
} from "@/components/classroom/classroom-presentation";
import {
  ClassroomStage,
  ClassroomStageSurface,
  ClassroomScreenShareContent,
  ClassroomWhiteboardContent,
} from "@/components/classroom/classroom-stage";
import { useClassroomStageViewport } from "@/components/classroom/use-classroom-layout-state";

vi.mock("@/components/classroom/shared-whiteboard", () => ({
  SharedWhiteboard: () => null,
}));
vi.mock("@livekit/components-react", () => ({ VideoTrack: () => null }));

afterEach(cleanup);

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

function makePresentation(
  overrides: Partial<ClassroomPresentation> = {},
): ClassroomPresentation {
  return {
    mode: "full",
    classroomPath: "/es/school/classroom/room-1",
    uiPreviewEnabled: false,
    enabled: true,
    external: false,
    nativeVideoActive: false,
    opening: false,
    error: false,
    floatingKind: "document",
    openFloating: vi.fn(),
    openWindow: vi.fn(),
    returnToClassroom: vi.fn(),
    setVideoElement: vi.fn(),
    reportPersistence: vi.fn(),
    leaveSession: vi.fn(),
    ...overrides,
  };
}

function View({
  presentation,
  whiteboard = false,
  share = true,
  phone = false,
  onFullscreen = vi.fn(),
  onFollow = vi.fn(),
}: {
  presentation: ClassroomPresentation;
  whiteboard?: boolean;
  share?: boolean;
  phone?: boolean;
  onFullscreen?: () => void;
  onFollow?: () => void;
}) {
  const { zoom, pan, stageRef, handleZoom, startPanDrag } =
    useClassroomStageViewport();
  return (
    <Intl>
      <ClassroomPresentationContext.Provider value={presentation}>
        <ClassroomStage
          stageRef={stageRef}
          phoneControls={<button>Micrófono</button>}
          isPhoneLandscape={phone}
          stageControlsVisible={false}
          onRevealControls={() => undefined}
          zoom={zoom}
          onZoom={handleZoom}
          contentActive={share || whiteboard}
          isWhiteboardActive={whiteboard}
          followViewport
          onToggleFollowViewport={onFollow}
          followingLabel="Siguiendo al profesor"
          unlockedLabel="Vista libre"
          isFullscreen={false}
          onToggleFullscreen={
            presentation.mode === "full" && !presentation.nativeVideoActive
              ? onFullscreen
              : undefined
          }
          enterFullscreenLabel="Pantalla completa"
          exitFullscreenLabel="Salir de pantalla completa"
        >
          <ClassroomScreenShareContent
            previewContent={
              <input aria-label="Contenido compartido" defaultValue="" />
            }
            zoom={zoom}
            pan={pan}
            onRevealControls={() => undefined}
            onStartPan={startPanDrag}
            loadingLabel="Cargando"
          />
        </ClassroomStage>
      </ClassroomPresentationContext.Provider>
    </Intl>
  );
}

describe("classroom display controls", () => {
  it.each([false, true])(
    "offers one popup action and one restore action when video PiP is unavailable (error: %s)",
    (error) => {
      const presentation = makePresentation({
        mode: "compact",
        floatingKind: "window",
        error,
      });
      render(<View presentation={presentation} />);
      fireEvent.click(
        screen.getByRole("button", { name: "Visualización de la sala" }),
      );
      expect(
        screen.getAllByRole("button", { name: "Abrir sala completa" }),
      ).toHaveLength(1);
      expect(
        screen.queryByRole("button", { name: "Abrir ventana flotante" }),
      ).toBeNull();
      fireEvent.click(
        screen.getByRole("button", { name: "Abrir la sala en otra ventana" }),
      );
      expect(presentation.openWindow).toHaveBeenCalledOnce();
      expect(presentation.openFloating).not.toHaveBeenCalled();
    },
  );

  it("restores the same whiteboard before interacting in an external window without intercepting normal classroom input", () => {
    const presentation = makePresentation({ mode: "compact", external: true });
    const pointerDown = vi.fn();
    const node = (external: boolean) => (
      <ClassroomPresentationContext.Provider
        value={{ ...presentation, external }}
      >
        <ClassroomWhiteboardContent
          roomName="room-1"
          followViewport={false}
          previewContent={
            <input
              aria-label="Whiteboard content"
              defaultValue="Preserved board"
              onPointerDown={pointerDown}
            />
          }
        />
      </ClassroomPresentationContext.Provider>
    );
    const view = render(node(true));
    const board = screen.getByLabelText("Whiteboard content");
    fireEvent.pointerDown(board);
    expect(presentation.returnToClassroom).toHaveBeenCalledOnce();
    expect(pointerDown).not.toHaveBeenCalled();
    view.rerender(node(false));
    expect(screen.getByLabelText("Whiteboard content")).toBe(board);
    expect((board as HTMLInputElement).value).toBe("Preserved board");
    fireEvent.pointerDown(board);
    expect(pointerDown).toHaveBeenCalledOnce();
    expect(presentation.returnToClassroom).toHaveBeenCalledOnce();
  });

  function openControls() {
    fireEvent.click(
      screen.getByRole("button", { name: "Visualización de la sala" }),
    );
  }

  it("reveals controls on hover, preserves keyboard focus, and dismisses with Escape", () => {
    render(<View presentation={makePresentation()} />);
    const trigger = screen.getByRole("button", {
      name: "Visualización de la sala",
    });
    const controls = screen.getByRole("group", {
      name: "Visualización de la sala",
    });
    expect(screen.queryByRole("button", { name: "Acercar" })).toBeNull();
    fireEvent.pointerEnter(controls, { pointerType: "mouse" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerLeave(controls, { pointerType: "mouse" });
    expect(screen.queryByRole("button", { name: "Acercar" })).toBeNull();

    openControls();
    const zoom = screen.getByRole("button", { name: "Acercar" });
    zoom.focus();
    fireEvent.pointerLeave(controls, { pointerType: "mouse" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(zoom, { key: "Escape" });
    expect(trigger.ownerDocument.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Acercar" })).toBeNull();
  });

  it("supports touch toggling and dismisses when tapping outside", () => {
    render(<View presentation={makePresentation()} />);
    const controls = screen.getByRole("group", {
      name: "Visualización de la sala",
    });
    fireEvent.pointerEnter(controls, { pointerType: "touch" });
    expect(screen.queryByRole("button", { name: "Acercar" })).toBeNull();
    openControls();
    expect(screen.getByRole("button", { name: "Acercar" })).toBeTruthy();
    openControls();
    expect(screen.queryByRole("button", { name: "Acercar" })).toBeNull();
    openControls();
    fireEvent.pointerDown(screen.getByLabelText("Contenido compartido"));
    expect(screen.queryByRole("button", { name: "Acercar" })).toBeNull();
  });

  it("groups zoom, fullscreen and PiP while retaining the shared content and zoom across presentations", () => {
    const presentation = makePresentation();
    const fullscreen = vi.fn();
    const view = render(
      <View presentation={presentation} onFullscreen={fullscreen} />,
    );
    openControls();
    const content = screen.getByLabelText("Contenido compartido");
    fireEvent.change(content, { target: { value: "Estado conservado" } });
    const controls = screen.getByRole("group", {
      name: "Visualización de la sala",
    });
    expect(
      within(controls)
        .getByRole("button", { name: "Alejar" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(within(controls).getByRole("button", { name: "Acercar" }));
    expect(content.parentElement?.style.transform).toContain("scale(1.25)");
    fireEvent.click(
      within(controls).getByRole("button", { name: "Pantalla completa" }),
    );
    expect(fullscreen).toHaveBeenCalledOnce();
    fireEvent.click(
      within(controls).getByRole("button", { name: "Abrir ventana flotante" }),
    );
    expect(presentation.openFloating).toHaveBeenCalledOnce();

    const mini = makePresentation({ mode: "compact" });
    view.rerender(<View presentation={mini} />);
    expect(screen.getByLabelText("Contenido compartido")).toBe(content);
    expect((content as HTMLInputElement).value).toBe("Estado conservado");
    expect(screen.getByText("125%")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Pantalla completa" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir sala completa" }),
    );
    expect(mini.returnToClassroom).toHaveBeenCalledOnce();

    const external = makePresentation({ mode: "compact", external: true });
    view.rerender(<View presentation={external} />);
    expect(screen.getByLabelText("Contenido compartido")).toBe(content);
    expect(
      screen.getAllByRole("button", { name: "Abrir sala completa" }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Abrir ventana flotante" }),
    ).toBeNull();
    expect(
      screen.getAllByRole("group", { name: "Visualización de la sala" }),
    ).toHaveLength(1);
  });

  it("shows whiteboard follow controls instead of zoom when the whiteboard takes precedence", () => {
    const follow = vi.fn();
    render(
      <View presentation={makePresentation()} whiteboard onFollow={follow} />,
    );
    openControls();
    expect(
      screen.queryByRole("group", { name: "Zoom de la pantalla compartida" }),
    ).toBeNull();
    const button = screen.getByRole("button", {
      name: "Siguiendo al profesor",
    });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(follow).toHaveBeenCalledOnce();
  });

  it("keeps display actions together when the phone's media controls are hidden", () => {
    render(<View presentation={makePresentation()} phone />);
    openControls();
    const controls = screen.getByRole("group", {
      name: "Visualización de la sala",
    });
    expect(
      within(controls).getByRole("button", { name: "Acercar" }),
    ).toBeTruthy();
    expect(
      within(controls).getByRole("button", { name: "Pantalla completa" }),
    ).toBeTruthy();
    expect(
      within(controls).getByRole("button", { name: "Abrir ventana flotante" }),
    ).toBeTruthy();
  });

  it("offers one restore action while native video PiP is active", () => {
    render(
      <View
        presentation={makePresentation({
          mode: "compact",
          nativeVideoActive: true,
        })}
      />,
    );
    openControls();
    expect(
      screen.getAllByRole("button", { name: "Abrir sala completa" }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Abrir ventana flotante" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Pantalla completa" }),
    ).toBeNull();
  });

  it("offers only restore after Chrome's external PiP closes into the internal miniview", () => {
    const presentation = makePresentation({
      mode: "compact",
      floatingKind: "document",
      external: false,
    });
    render(<View presentation={presentation} />);
    openControls();
    expect(
      screen.getAllByRole("button", { name: "Abrir sala completa" }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Abrir ventana flotante" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir sala completa" }));
    expect(presentation.returnToClassroom).toHaveBeenCalledOnce();
    expect(presentation.openFloating).not.toHaveBeenCalled();
  });

  it("leaves the recording surface free of interactive display controls", () => {
    function Recording() {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <ClassroomStageSurface stageRef={ref}>
          <ClassroomScreenShareContent
            previewContent={<span>Grabación</span>}
            zoom={1}
            pan={{ x: 0, y: 0 }}
            onRevealControls={() => undefined}
            onStartPan={() => undefined}
            loadingLabel="Cargando"
          />
        </ClassroomStageSurface>
      );
    }
    render(<Recording />);
    expect(screen.getByText("Grabación")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("group")).toBeNull();
  });
});
