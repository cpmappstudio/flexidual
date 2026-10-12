import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useClassroomParticipantPagination } from "@/components/classroom/use-classroom-participant-pagination";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the participant page when mosaic temporarily hides the sidebar grid", () => {
  let size = { width: 192, height: 200 };
  let resize = () => {};
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => size.width,
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    () => size.height,
  );

  let pagination!: ReturnType<typeof useClassroomParticipantPagination>;
  function Grid() {
    pagination = useClassroomParticipantPagination(12);
    return <div ref={pagination.gridRef} />;
  }

  render(<Grid />);
  act(() => pagination.showNext());
  expect(pagination.startIndex).toBe(4);

  size = { width: 0, height: 0 };
  act(() => resize());
  size = { width: 192, height: 200 };
  act(() => resize());

  expect(pagination.startIndex).toBe(4);
});
