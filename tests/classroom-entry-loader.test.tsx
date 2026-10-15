import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassroomEntryLoader } from "@/components/classroom/classroom-entry-loader";

const state = vi.hoisted(() => ({ reducedMotion: false }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => state.reducedMotion,
}));

beforeEach(() => {
  state.reducedMotion = false;
});
afterEach(cleanup);

describe("ClassroomEntryLoader", () => {
  it("preserves the scene while the connection message changes", () => {
    const view = render(
      <ClassroomEntryLoader
        onComplete={vi.fn()}
        label="Comprobando la clase"
      />,
    );
    const planet = view.container.querySelector(
      'img[src="/flexidual-planet.svg"]',
    );
    const rocket = view.container.querySelector('img[src="/rocket.svg"]');
    expect(planet).not.toBeNull();
    expect(rocket).not.toBeNull();
    expect(screen.getByRole("img", { name: "Flexidual" }).textContent).toBe(
      "FLEXIDUAL",
    );

    view.rerender(
      <ClassroomEntryLoader onComplete={vi.fn()} label="Entrando a clase" />,
    );
    expect(screen.getByRole("status").textContent).toBe("Entrando a clase");
    expect(
      view.container.querySelector('img[src="/flexidual-planet.svg"]'),
    ).toBe(planet);
    expect(view.container.querySelector('img[src="/rocket.svg"]')).toBe(rocket);
  });

  it("keeps the planet, astronaut and brand without flight for reduced motion", () => {
    state.reducedMotion = true;
    const view = render(
      <ClassroomEntryLoader onComplete={vi.fn()} label="Entrando a clase" />,
    );
    expect(view.container.querySelector('img[src="/rocket.svg"]')).toBeNull();
    expect(
      view.container.querySelector('img[src="/flexidual-planet.svg"]'),
    ).not.toBeNull();
    expect(
      view.container.querySelector('img[src="/astronaut/takeoffdiagonal.svg"]'),
    ).not.toBeNull();
    expect(screen.getByRole("img", { name: "Flexidual" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Entrando a clase");
  });
});
