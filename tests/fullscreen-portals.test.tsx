import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

let fullscreenElement: Element | null;

beforeEach(() => {
  fullscreenElement = null;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
});

afterEach(() => {
  cleanup();
  fullscreenElement = null;
});

function LeaveDialog({ onMicrophone }: { onMicrophone: () => void }) {
  return (
    <>
      <button type="button" onClick={onMicrophone}>
        Micrófono
      </button>
      <AlertDialog>
        <AlertDialogTrigger>Salir</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Salir de la sala</AlertDialogTitle>
          <AlertDialogDescription>
            Confirma que deseas salir.
          </AlertDialogDescription>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

describe("fullscreen portals", () => {
  it("keeps the leave dialog and room actions inside the fullscreen surface", async () => {
    const fullscreenRoot = document.createElement("div");
    document.body.append(fullscreenRoot);
    const onMicrophone = vi.fn();

    const view = render(<LeaveDialog onMicrophone={onMicrophone} />, {
      container: fullscreenRoot,
    });
    fullscreenElement = fullscreenRoot;
    view.rerender(<LeaveDialog onMicrophone={onMicrophone} />);

    fireEvent.click(screen.getByRole("button", { name: "Salir" }));

    const dialog = screen.getByRole("alertdialog", {
      name: "Salir de la sala",
    });
    expect(fullscreenRoot.contains(dialog)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(document.body.style.pointerEvents).toBe(""));

    fireEvent.click(screen.getByRole("button", { name: "Micrófono" }));
    expect(onMicrophone).toHaveBeenCalledOnce();
  });

  it("preserves the default body portal outside fullscreen", () => {
    render(<LeaveDialog onMicrophone={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Salir" }));

    expect(
      document.body.contains(
        screen.getByRole("alertdialog", { name: "Salir de la sala" }),
      ),
    ).toBe(true);
  });
});
