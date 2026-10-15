import { useEffect } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassroomEntryTransition } from "@/components/classroom/classroom-entry-transition";

const state = vi.hoisted(() => ({ reducedMotion: false }));

vi.mock("@/components/classroom/classroom-entry-loader", () => ({
  ClassroomEntryLoader: ({ onComplete }: { onComplete: () => void }) => (
    <button onClick={onComplete}>Finish entrance</button>
  ),
}));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => state.reducedMotion,
}));
afterEach(() => {
  cleanup();
  state.reducedMotion = false;
});

describe("ClassroomEntryTransition", () => {
  it("reveals reduced-motion entry immediately and does not replay when the preference changes", async () => {
    state.reducedMotion = true;
    const node = (loading: boolean) => (
      <ClassroomEntryTransition enabled loading={loading} label="Entering">
        <p>Room</p>
      </ClassroomEntryTransition>
    );
    const view = render(node(true));
    expect(
      screen.getByRole("button", { name: "Finish entrance" }),
    ).toBeTruthy();
    view.rerender(node(false));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Finish entrance" }),
      ).toBeNull(),
    );
    state.reducedMotion = false;
    view.rerender(node(false));
    expect(
      screen.queryByRole("button", { name: "Finish entrance" }),
    ).toBeNull();
  });

  it.each([true, false])(
    "requires both connection and animation without remounting the room (connection first: %s)",
    async (connectionFirst) => {
      const mount = vi.fn();
      const unmount = vi.fn();
      function Room() {
        useEffect(() => {
          mount();
          return unmount;
        }, []);
        return <p>Room</p>;
      }
      const node = (loading: boolean) => (
        <ClassroomEntryTransition enabled loading={loading} label="Entering">
          <Room />
        </ClassroomEntryTransition>
      );
      const view = render(node(true));
      const room = screen.getByText("Room");
      if (connectionFirst) view.rerender(node(false));
      else
        fireEvent.click(
          screen.getByRole("button", { name: "Finish entrance" }),
        );
      expect(
        screen.getByRole("button", { name: "Finish entrance" }),
      ).toBeTruthy();
      expect(room.closest("[inert]")).not.toBeNull();
      if (connectionFirst)
        fireEvent.click(
          screen.getByRole("button", { name: "Finish entrance" }),
        );
      else view.rerender(node(false));
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "Finish entrance" }),
        ).toBeNull(),
      );
      expect(room.closest("[inert]")).toBeNull();
      expect(mount).toHaveBeenCalledOnce();
      expect(unmount).not.toHaveBeenCalled();
    },
  );

  it("discards a completed scene on error so a quick retry can finish", async () => {
    const node = (enabled: boolean, loading: boolean) => (
      <ClassroomEntryTransition
        enabled={enabled}
        loading={loading}
        label="Entering"
      >
        <p>Room</p>
      </ClassroomEntryTransition>
    );
    const view = render(node(true, true));
    const firstScene = screen.getByRole("button", { name: "Finish entrance" });
    fireEvent.click(firstScene);
    view.rerender(node(false, true));
    expect(
      screen.queryByRole("button", { name: "Finish entrance" }),
    ).toBeNull();
    view.rerender(node(true, false));
    const retryScene = screen.getByRole("button", { name: "Finish entrance" });
    expect(retryScene).not.toBe(firstScene);
    fireEvent.click(retryScene);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Finish entrance" }),
      ).toBeNull(),
    );
  });

  it("interrupts entrance for errors and starts a fresh sequence on retry", async () => {
    const node = (enabled: boolean, loading: boolean) => (
      <ClassroomEntryTransition
        enabled={enabled}
        loading={loading}
        label="Entering"
      >
        <p>Content</p>
      </ClassroomEntryTransition>
    );
    const view = render(node(true, true));
    view.rerender(node(false, false));
    expect(
      screen.queryByRole("button", { name: "Finish entrance" }),
    ).toBeNull();
    view.rerender(node(true, false));
    expect(
      screen.getByRole("button", { name: "Finish entrance" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finish entrance" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Finish entrance" }),
      ).toBeNull(),
    );
    view.rerender(node(true, true));
    view.rerender(node(true, false));
    expect(
      screen.getByRole("button", { name: "Finish entrance" }),
    ).toBeTruthy();
  });
});
