import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import LocaleLayout from "@/app/[locale]/layout";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  reset: vi.fn(),
  shutdown: vi.fn(),
}));

// Keep the actual layout, ConvexClientProvider, PostHogBootstrap and next-intl
// provider/hook. Only replace external services, not the context under test.
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ isLoaded: true, userId: "teacher-test" }),
}));
vi.mock("convex/react", () => ({ ConvexReactClient: class {} }));
vi.mock("convex/react-clerk", () => ({
  ConvexProviderWithClerk: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/presence/presence-tracker", () => ({
  PresenceTracker: () => null,
}));
vi.mock("@/components/providers/alert-provider", () => ({
  AlertProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/hooks/use-staff-access", () => ({
  useStaffAccess: () => ({ access: { role: "teacher" }, isLoading: false }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/cpca-main/catalog",
  notFound: () => {
    throw new Error("Unexpected notFound");
  },
}));
vi.mock("next-intl/server", () => ({
  getMessages: async () => ({}),
  setRequestLocale: vi.fn(),
}));
vi.mock("posthog-js", () => ({
  PostHog: class {
    constructor() {
      return sdk;
    }
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_TEST_SURVEY_ID", "");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

test.each(["en", "es"])(
  "the real locale layout supplies %s to PostHog without crashing",
  async (locale) => {
    const layout = await LocaleLayout({
      params: Promise.resolve({ locale }),
      children: <main>App remains available</main>,
    });
    render(layout);
    expect(screen.getByText("App remains available")).toBeDefined();
    await waitFor(() =>
      expect(sdk.init).toHaveBeenCalledWith(
        "phc_test",
        expect.objectContaining({ override_display_language: locale }),
      ),
    );
    expect(sdk.init).toHaveBeenCalledOnce();
  },
);
