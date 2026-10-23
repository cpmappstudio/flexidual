import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Nunito: () => ({ variable: "nunito" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
}));
vi.mock("@/components/error-tracking-bootstrap", () => ({
  ErrorTrackingBootstrap: () => null,
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
import RootLayout from "@/app/layout";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("the root layout leaves history and unload untouched, including landing fragments and Back/Forward", async () => {
  window.history.replaceState({ __NA: true, tree: [] }, "", "/");
  const push = window.history.pushState;
  const replace = window.history.replaceState;
  const addListener = vi.spyOn(window, "addEventListener");
  const errors: string[] = [];
  const onError = (event: ErrorEvent) => {
    errors.push(event.message);
    event.preventDefault();
  };
  window.addEventListener("error", onError);
  const popstate = vi.fn();
  window.addEventListener("popstate", popstate);
  try {
    const view = render(
      <RootLayout>
        <a href="#features">Features</a>
        <section id="features">Features section</section>
      </RootLayout>,
      { container: document },
    );
    expect.soft(window.history.pushState).toBe(push);
    expect.soft(window.history.replaceState).toBe(replace);
    expect
      .soft(addListener.mock.calls.filter(([type]) => type === "beforeunload"))
      .toHaveLength(0);
    fireEvent.click(document.querySelector("a")!);
    await waitFor(() => expect(popstate).toHaveBeenCalledTimes(1));
    expect(window.location.hash).toBe("#features");
    window.history.back();
    await waitFor(() => expect(popstate).toHaveBeenCalledTimes(2));
    expect(window.location.hash).toBe("");
    window.history.forward();
    await waitFor(() => expect(popstate).toHaveBeenCalledTimes(3));
    expect(window.location.hash).toBe("#features");
    expect.soft(errors).toEqual([]);
    view.unmount();
    expect.soft(window.history.pushState).toBe(push);
    expect.soft(window.history.replaceState).toBe(replace);
    const exit = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(exit);
    expect(exit.defaultPrevented).toBe(false);
  } finally {
    window.removeEventListener("error", onError);
    window.removeEventListener("popstate", popstate);
  }
});
