import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Carousel } from "@/components/ui/carousel";

const api = vi.hoisted(() => ({
  canScrollPrev: () => true,
  canScrollNext: () => true,
  scrollPrev: vi.fn(),
  scrollNext: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}));
vi.mock("embla-carousel-react", () => ({ default: () => [vi.fn(), api] }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test.each(["ArrowLeft", "ArrowRight"])(
  "carousel preserves %s for embedded answer controls and still handles card navigation",
  (key) => {
    render(
      <Carousel>
        <textarea aria-label="Written answer" />
        <input aria-label="Input" />
        <select aria-label="Select">
          <option>One</option>
        </select>
        <div
          contentEditable
          suppressContentEditableWarning
          data-testid="editable"
        >
          Answer
        </div>
        <div role="radiogroup" aria-label="Options">
          <button role="radio" aria-checked="false">
            One
          </button>
        </div>
        <button>Activity card</button>
      </Carousel>,
    );
    for (const target of [
      screen.getByLabelText("Written answer"),
      screen.getByLabelText("Input"),
      screen.getByLabelText("Select"),
      screen.getByTestId("editable"),
      screen.getByRole("radio"),
    ]) {
      expect(fireEvent.keyDown(target, { key })).toBe(true);
      expect(api.scrollPrev).not.toHaveBeenCalled();
      expect(api.scrollNext).not.toHaveBeenCalled();
    }
    expect(
      fireEvent.keyDown(screen.getByRole("button", { name: "Activity card" }), {
        key,
      }),
    ).toBe(false);
    expect(
      key === "ArrowLeft" ? api.scrollPrev : api.scrollNext,
    ).toHaveBeenCalledOnce();
  },
);
