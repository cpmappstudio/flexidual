import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useClassroomViewMode } from "@/components/classroom/use-classroom-view-mode";

describe("useClassroomViewMode", () => {
  it("shows chat in mosaic and restores participants on return", () => {
    const { result } = renderHook(useClassroomViewMode);

    act(() => result.current.changeViewMode("mosaic"));
    expect(result.current.panelTab).toBe("chat");

    act(() => result.current.changeViewMode("presenter"));
    expect(result.current.panelTab).toBe("participants");
  });

  it("preserves a tab explicitly selected during mosaic", () => {
    const { result } = renderHook(useClassroomViewMode);

    act(() => result.current.changeViewMode("mosaic"));
    act(() => result.current.changePanelTab("chat"));
    act(() => result.current.changeViewMode("presenter"));

    expect(result.current.panelTab).toBe("chat");
  });

  it("does not change a chat tab already selected before mosaic", () => {
    const { result } = renderHook(useClassroomViewMode);

    act(() => result.current.changePanelTab("chat"));
    act(() => result.current.changeViewMode("mosaic"));
    act(() => result.current.changeViewMode("presenter"));

    expect(result.current.panelTab).toBe("chat");
  });

  it.each(["presenter", "mosaic"] as const)(
    "restores %s after a temporary participant pin",
    (mode) => {
      const { result } = renderHook(useClassroomViewMode);
      act(() => result.current.changeViewMode(mode));
      act(() => result.current.focusPinnedParticipant());
      expect(result.current.viewMode).toBe("presenter");

      act(() => result.current.restoreViewBeforePin());
      expect(result.current.viewMode).toBe(mode);
    },
  );

  it("keeps the original layout when the pinned participant is replaced", () => {
    const { result } = renderHook(useClassroomViewMode);
    act(() => result.current.changeViewMode("mosaic"));
    act(() => result.current.focusPinnedParticipant());
    act(() => result.current.focusPinnedParticipant());
    act(() => result.current.restoreViewBeforePin());

    expect(result.current.viewMode).toBe("mosaic");
  });

  it.each(["presenter", "mosaic"] as const)(
    "respects an explicit %s choice made after pinning",
    (mode) => {
      const { result } = renderHook(useClassroomViewMode);
      act(() => result.current.changeViewMode("mosaic"));
      act(() => result.current.focusPinnedParticipant());
      act(() => result.current.changeViewMode(mode));
      act(() => result.current.restoreViewBeforePin());

      expect(result.current.viewMode).toBe(mode);
    },
  );

  it("keeps newly shared content visible when a participant is unpinned", () => {
    const { result, rerender } = renderHook(
      ({ contentActive }) => useClassroomViewMode(contentActive),
      { initialProps: { contentActive: false } },
    );
    act(() => result.current.changeViewMode("mosaic"));
    act(() => result.current.focusPinnedParticipant());
    rerender({ contentActive: true });
    act(() => result.current.restoreViewBeforePin());

    expect(result.current.viewMode).toBe("presenter");
  });

  it("returns to the presenter when shared content starts without blocking a manual mosaic choice", () => {
    const { result, rerender } = renderHook(
      ({ contentActive }) => useClassroomViewMode(contentActive),
      { initialProps: { contentActive: false } },
    );

    act(() => result.current.changeViewMode("mosaic"));
    rerender({ contentActive: true });
    expect(result.current.viewMode).toBe("presenter");

    act(() => result.current.changeViewMode("mosaic"));
    expect(result.current.viewMode).toBe("mosaic");
    rerender({ contentActive: true });
    expect(result.current.viewMode).toBe("mosaic");
  });
});
