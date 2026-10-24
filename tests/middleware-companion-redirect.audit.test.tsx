import { NextRequest, NextResponse } from "next/server";
import { expect, test, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
}));

vi.mock("next-intl/middleware", () => ({
  default: () => () => NextResponse.next(),
}));

import proxy from "@/proxy";

test("an unauthenticated companion URL survives the redirect to sign-in", async () => {
  const request = new NextRequest(
    "https://app.example/es/school/classroom/live-room?companion=true",
  );
  const runMiddleware = proxy as unknown as (
    auth: () => Promise<{ userId: null }>,
    request: NextRequest,
  ) => Promise<Response>;

  const response = await runMiddleware(async () => ({ userId: null }), request);
  const location = new URL(response.headers.get("location")!);

  expect(location.pathname).toBe("/es/sign-in");
  expect(location.searchParams.get("redirect_url")).toBe(
    "/es/school/classroom/live-room?companion=true",
  );
});

test.each([
  ["teacher", "/students", true],
  ["teacher", "/students/student-id", true],
  ["teacher", "/professors", false],
  ["tutor", "/students/student-id", false],
  ["student", "/students", false],
  ["admin", "/students/student-id", true],
  ["principal", "/professors", true],
])("%s access to %s is %s", async (role, path, allowed) => {
  const request = new NextRequest(`https://app.example/en/campus${path}`);
  const run = proxy as unknown as (
    auth: () => Promise<unknown>,
    request: NextRequest,
  ) => Promise<Response>;
  const response = await run(
    async () => ({
      userId: "viewer",
      sessionClaims: { metadata: { roles: { campus: role } } },
    }),
    request,
  );
  expect(response.headers.has("location")).toBe(!allowed);
  if (!allowed)
    expect(new URL(response.headers.get("location")!).pathname).toBe(
      "/en/campus",
    );
});

test.each([
  "/api/whiteboard-image",
  "/api/livekit/token",
  "/recording",
  "/en/sign-in",
])(
  "proxy preserves the existing public routing contract for %s",
  async (path) => {
    const auth = vi
      .fn()
      .mockRejectedValue(new Error("must not request a session"));
    const run = proxy as unknown as (
      authenticate: () => Promise<unknown>,
      request: NextRequest,
    ) => Promise<Response>;
    const response = await run(
      auth,
      new NextRequest(`https://app.example${path}`),
    );
    expect(auth).not.toHaveBeenCalled();
    expect(response.headers.has("location")).toBe(false);
  },
);
