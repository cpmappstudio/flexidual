import { StrictMode, useEffect } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useHydrated } from "@/hooks/use-hydrated";
import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";
import { PageTransition } from "@/components/ui/page-transition";
import {
  Carousel,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const state = vi.hoisted(() => ({
  pathname: "/first",
  prev: false,
  next: true,
  listeners: new Map<string, Set<() => void>>(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("embla-carousel-react", () => {
  const api = {
    canScrollPrev: () => state.prev,
    canScrollNext: () => state.next,
    scrollPrev: vi.fn(),
    scrollNext: vi.fn(),
    on(event: string, listener: () => void) {
      if (!state.listeners.has(event)) state.listeners.set(event, new Set());
      state.listeners.get(event)!.add(listener);
      return api;
    },
    off(event: string, listener: () => void) {
      state.listeners.get(event)?.delete(listener);
      return api;
    },
  };
  return { default: () => [() => {}, api] };
});

beforeEach(() => {
  state.pathname = "/first";
  state.prev = false;
  state.next = true;
  state.listeners.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("browser state hydrates from matching server HTML without an Effect setter", async () => {
  function BrowserState() {
    const hydrated = useHydrated();
    const zone = useBrowserTimeZone();
    return <p>{hydrated ? zone : "server"}</p>;
  }
  const container = document.createElement("div");
  document.body.append(container);
  container.innerHTML = renderToString(<BrowserState />);
  expect(container.textContent).toBe("server");
  const errors: unknown[] = [];
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, <BrowserState />, {
      onRecoverableError: (error) => errors.push(error),
    });
  });
  expect(container.textContent).toBe(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  expect(errors).toEqual([]);
  await act(async () => root.unmount());
  container.remove();
});

test("route transitions cancel stale timers, animate a return, and never remount page content", () => {
  vi.useFakeTimers();
  const mounted = vi.fn();
  const unmounted = vi.fn();
  function Content() {
    useEffect(() => {
      mounted();
      return unmounted;
    }, []);
    return <span>Page content</span>;
  }
  const view = render(
    <PageTransition>
      <Content />
    </PageTransition>,
  );
  const wrapper = () => screen.getByText("Page content").parentElement!;
  expect(wrapper().className).toContain("opacity-0");
  act(() => vi.advanceTimersByTime(50));
  expect(wrapper().className).toContain("opacity-100");
  state.pathname = "/second";
  view.rerender(
    <PageTransition>
      <Content />
    </PageTransition>,
  );
  act(() => vi.advanceTimersByTime(25));
  state.pathname = "/first";
  view.rerender(
    <PageTransition>
      <Content />
    </PageTransition>,
  );
  act(() => vi.advanceTimersByTime(25));
  expect(wrapper().className).toContain("opacity-0");
  act(() => vi.advanceTimersByTime(25));
  expect(wrapper().className).toContain("opacity-100");
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(unmounted).not.toHaveBeenCalled();
});

test("carousel reads the SDK snapshot and releases both subscriptions in StrictMode", () => {
  const view = render(
    <StrictMode>
      <Carousel>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </StrictMode>,
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Previous slide",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Next slide" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  expect(state.listeners.get("reInit")?.size).toBe(1);
  expect(state.listeners.get("select")?.size).toBe(1);
  act(() => {
    state.prev = true;
    state.next = false;
    state.listeners.get("reInit")?.forEach((notify) => notify());
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Previous slide",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(
    (screen.getByRole("button", { name: "Next slide" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  view.unmount();
  expect(state.listeners.get("reInit")?.size).toBe(0);
  expect(state.listeners.get("select")?.size).toBe(0);
});
