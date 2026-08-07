import { describe, expect, test } from "vitest";
import { deriveClassType } from "./classType";

describe("deriveClassType", () => {
  test("marks every course containing a live session as standard", () => {
    expect(deriveClassType(["ignitia", "live"])).toBe("standard");
    expect(deriveClassType([undefined])).toBe("standard");
  });

  test("keeps external-only courses out of the live catalog", () => {
    expect(deriveClassType(["ignitia", "ignitia"])).toBe("ignitia");
    expect(deriveClassType(["abeka"])).toBe("abeka");
    expect(deriveClassType(["ignitia", "abeka"])).toBeUndefined();
    expect(deriveClassType([])).toBeUndefined();
  });
});
