import { NextRequest } from "next/server";
import { expect, test, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
}));

vi.mock("next-intl/middleware", () => ({
  default: () => vi.fn(),
}));

import middleware from "@/middleware";

test("an unauthenticated companion URL survives the redirect to sign-in", async () => {
  const request = new NextRequest(
    "https://app.example/es/school/classroom/live-room?companion=true",
  );
  const runMiddleware = middleware as unknown as (
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
