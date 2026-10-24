import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { StudentProfileHero } from "@/components/student/student-profile-hero";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/student/scroll-indicator", () => ({
  ScrollIndicator: () => null,
}));

const props = {
  student: { fullName: "Student", grade: "1", gradeName: "First grade" },
  stats: {
    activeCourses: 1,
    totalSessions: 2,
    attendanceRate: 100,
    completedSessions: 1,
  },
};
let requests: Array<(stream: MediaStream) => void>;
const getUserMedia = vi.fn();
beforeEach(() => {
  localStorage.clear();
  requests = [];
  getUserMedia
    .mockReset()
    .mockImplementation(
      () => new Promise<MediaStream>((resolve) => requests.push(resolve)),
    );
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function camera() {
  const stop = vi.fn();
  return {
    stop,
    stream: { getTracks: () => [{ stop }] } as unknown as MediaStream,
  };
}

test("late restored camera cannot bypass revoked access and preserves the saved preference", async () => {
  localStorage.setItem("flexidual_camera_on", "true");
  const view = render(<StudentProfileHero {...props} />);
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  view.rerender(<StudentProfileHero {...props} disableCamera />);
  const result = camera();
  await act(async () => requests[0](result.stream));
  expect(result.stop).toHaveBeenCalledTimes(1);
  expect(view.container.querySelector("video")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "turnOnCamera" }));
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("flexidual_camera_on")).toBe("true");
});

test("StrictMode releases discarded streams and unmount releases the adopted camera", async () => {
  localStorage.setItem("flexidual_camera_on", "true");
  const view = render(
    <StrictMode>
      <StudentProfileHero {...props} />
    </StrictMode>,
  );
  expect(requests).toHaveLength(2);
  const obsolete = camera();
  const current = camera();
  await act(async () => {
    requests[0](obsolete.stream);
    requests[1](current.stream);
  });
  expect(obsolete.stop).toHaveBeenCalledTimes(1);
  expect(current.stop).not.toHaveBeenCalled();
  expect(view.container.querySelector("video")?.srcObject).toBe(current.stream);
  view.unmount();
  expect(current.stop).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("flexidual_camera_on")).toBe("true");
});

test("a manual camera request resolving after unmount is released without changing preferences", async () => {
  const view = render(<StudentProfileHero {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "turnOnCamera" }));
  view.unmount();
  const late = camera();
  await act(async () => requests[0](late.stream));
  expect(late.stop).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("flexidual_camera_on")).toBeNull();
});
