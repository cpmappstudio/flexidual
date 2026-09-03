import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassroomLayoutControls } from "@/components/classroom/classroom-layout";

describe("ClassroomLayoutControls", () => {
  it("does not mount the standard controls in phone landscape", () => {
    render(
      <ClassroomLayoutControls isPhoneLandscape>
        <span>standard media controls</span>
      </ClassroomLayoutControls>,
    );

    expect(screen.queryByText("standard media controls")).toBeNull();
  });
});
