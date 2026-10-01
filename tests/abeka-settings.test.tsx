import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { IntegrationSettings } from "@/components/settings/integration-settings";
import AbekaIntegrationPage from "@/app/[locale]/[orgSlug]/settings/integrations/abeka/page";
import type { ComponentProps } from "react";
import { AbekaLoginProbe } from "@/components/settings/abeka-login-probe";
import { AbekaSyncSchedule } from "@/components/settings/abeka-sync-schedule";
import type { Id } from "@/convex/_generated/dataModel";
import InstitutionSettingsPage from "@/app/[locale]/[orgSlug]/settings/page";
import messages from "@/messages/es.json";

const mocks = vi.hoisted(() => ({
  admin: true,
  institution: {
    _id: "school",
    name: "Test School",
    slug: "test",
    timeZone: "America/Bogota",
    isActive: true,
  },
  query: vi.fn(),
  mutate: vi.fn(),
  getToken: vi.fn(),
  fetch: vi.fn(),
  paginated: vi.fn(),
  error: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => mocks.router,
  Link: ({ children, ...props }: ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@/hooks/use-settings-context", () => ({
  useSettingsContext: () => ({
    context: {
      canViewInstitutionSettings: true,
      canManageInstitution: mocks.admin,
      institution: mocks.institution,
    },
    isLoading: false,
    basePath: "/school/settings",
  }),
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: mocks.getToken }),
}));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) =>
    mocks.query(getFunctionName(ref), args),
  useMutation: () => mocks.mutate,
  usePaginatedQuery: (
    ref: Parameters<typeof getFunctionName>[0],
    args: unknown,
  ) =>
    args === "skip"
      ? { results: [], status: "LoadingFirstPage" }
      : mocks.paginated(getFunctionName(ref), args),
}));

beforeEach(() => {
  mocks.admin = true;
  mocks.router.push.mockReset();
  mocks.router.replace.mockReset();
  mocks.query.mockReset().mockReturnValue({ connection: null, run: null });
  mocks.mutate.mockReset();
  mocks.error.mockReset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  mocks.paginated
    .mockReset()
    .mockReturnValue({ results: [], status: "Exhausted" });
  mocks.getToken.mockReset().mockResolvedValue("fake-token");
  mocks.fetch
    .mockReset()
    .mockResolvedValue(new Response("{}", { status: 202 }));
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const renderSettings = (content = <AbekaIntegrationPage />) =>
  render(
    <NextIntlClientProvider
      locale="es"
      messages={messages}
      timeZone="America/Bogota"
    >
      {content}
    </NextIntlClientProvider>,
  );

const scheduleProps = {
  schoolId: "school" as Id<"schools">,
  schedule: {
    mode: "weekly" as const,
    time: "08:00",
    weekday: 1,
    stopAtPeriodEnd: true,
  },
  timeZone: "America/Bogota",
  period: { name: "2026", endDate: "2026-12-15" },
  nextSyncAt: Date.parse("2026-09-28T13:00Z"),
  disabled: false,
};

test("schedule editor displays institution zone, next date and checked academic limit without fetching Abeka", () => {
  renderSettings(
    <dl>
      <AbekaSyncSchedule {...scheduleProps} />
    </dl>,
  );
  const t = messages.settings.integrations;
  expect(screen.getByRole("combobox", { name: `${t.nextSync}:` })).toBeTruthy();
  expect(
    screen
      .getByRole("checkbox", { name: t.schedule.stopAtPeriodEnd })
      .getAttribute("data-state"),
  ).toBe("checked");
  expect(screen.getByText(/America\/Bogota/)).toBeTruthy();
  expect(screen.getByText(/^Fin del período: .* · 2026$/)).toBeTruthy();
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

test("schedule modes autosave and manual hides time, academic limit and next-date note", async () => {
  mocks.mutate.mockResolvedValue(null);
  renderSettings(
    <dl>
      <AbekaSyncSchedule {...scheduleProps} />
    </dl>,
  );
  const t = messages.settings.integrations;
  fireEvent.keyDown(screen.getByRole("combobox", { name: `${t.nextSync}:` }), {
    key: "ArrowDown",
  });
  fireEvent.click(
    await screen.findByRole("option", { name: t.schedule.manual }),
  );
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenCalledWith({
      schoolId: "school",
      schedule: { ...scheduleProps.schedule, mode: "manual" },
    }),
  );
  expect(screen.queryByLabelText(t.schedule.time)).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByText(/America\/Bogota/)).toBeNull();
  expect(screen.getByText(t.schedule.manualNote)).toBeTruthy();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

test("weekday mode has no weekday selector; time saves on blur and errors restore server settings", async () => {
  mocks.mutate.mockRejectedValue(new Error("failed"));
  renderSettings(
    <dl>
      <AbekaSyncSchedule
        {...scheduleProps}
        schedule={{ ...scheduleProps.schedule, mode: "weekdays" }}
      />
    </dl>,
  );
  const t = messages.settings.integrations;
  expect(screen.queryByRole("combobox", { name: t.schedule.day })).toBeNull();
  const time = screen.getByLabelText(t.schedule.time) as HTMLInputElement;
  fireEvent.change(time, { target: { value: "09:30" } });
  expect(mocks.mutate).not.toHaveBeenCalled();
  fireEvent.blur(time);
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(t.actionError));
  expect(time.value).toBe("08:00");
  expect(mocks.mutate).toHaveBeenCalledWith({
    schoolId: "school",
    schedule: { ...scheduleProps.schedule, mode: "weekdays", time: "09:30" },
  });
});

test("academic limit can be disabled and missing period explains the pause", async () => {
  mocks.mutate.mockResolvedValue(null);
  renderSettings(
    <dl>
      <AbekaSyncSchedule
        {...scheduleProps}
        period={null}
        nextSyncAt={undefined}
      />
    </dl>,
  );
  const t = messages.settings.integrations;
  expect(screen.getByText(t.schedule.noPeriod)).toBeTruthy();
  fireEvent.click(
    screen.getByRole("checkbox", { name: t.schedule.stopAtPeriodEnd }),
  );
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenCalledWith({
      schoolId: "school",
      schedule: { ...scheduleProps.schedule, stopAtPeriodEnd: false },
    }),
  );
});

test("experimental login clears inputs, submits only once, and does not invoke connection mutations", async () => {
  mocks.fetch.mockResolvedValue(
    Response.json({ verified: true, externalSchoolName: "Example School" }),
  );
  renderSettings(<AbekaLoginProbe schoolId={"school" as Id<"schools">} />);
  const t = messages.settings.integrations.loginProbe;
  fireEvent.click(screen.getByRole("button", { name: t.title }));
  const username = screen.getByLabelText(t.username) as HTMLInputElement;
  const password = screen.getByLabelText(t.password) as HTMLInputElement;
  expect(password.type).toBe("password");
  expect(password.closest("form")?.classList.contains("ph-no-capture")).toBe(
    true,
  );
  fireEvent.change(username, { target: { value: "example" } });
  fireEvent.change(password, { target: { value: "not-real" } });
  fireEvent.submit(password.closest("form")!);
  fireEvent.submit(password.closest("form")!);
  expect(username.value).toBe("");
  expect(password.value).toBe("");
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("Example School"),
  );
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.fetch.mock.calls[0][0]).toContain(
    "/abeka-login-probe?schoolId=school",
  );
  expect(mocks.mutate).not.toHaveBeenCalled();
});

test("login probe renders only allowlisted diagnostic codes, never arbitrary provider details", async () => {
  const t = messages.settings.integrations.loginProbe;
  for (const diagnostic of [
    "CREDENTIAL_RESPONSE_403_HTML",
    "private-cookie-or-provider-body",
  ]) {
    mocks.fetch.mockResolvedValue(
      Response.json(
        { error: "INTERACTION_REQUIRED", diagnostic },
        { status: 400 },
      ),
    );
    renderSettings(<AbekaLoginProbe schoolId={"school" as Id<"schools">} />);
    fireEvent.click(screen.getByRole("button", { name: t.title }));
    const password = screen.getByLabelText(t.password);
    fireEvent.change(screen.getByLabelText(t.username), {
      target: { value: "example" },
    });
    fireEvent.change(password, { target: { value: "not-real" } });
    fireEvent.submit(password.closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        t.errors.INTERACTION_REQUIRED,
      ),
    );
    if (diagnostic.startsWith("CREDENTIAL"))
      expect(screen.getByRole("status").textContent).toContain(diagnostic);
    else
      expect(screen.getByRole("status").textContent).not.toContain(diagnostic);
    cleanup();
  }
});

test("non-admins cannot render or subscribe to integration data", () => {
  mocks.admin = false;
  renderSettings();
  expect(
    screen.queryByRole("heading", {
      name: messages.settings.integrations.title,
    }),
  ).toBeNull();
  expect(mocks.query).not.toHaveBeenCalled();
});

test("General places integrations directly after institution details with consistent section headings", () => {
  renderSettings(<InstitutionSettingsPage />);
  const headings = screen.getAllByRole("heading", { level: 2 });
  expect(headings.map((heading) => heading.textContent)).toEqual([
    messages.settings.institutionSettings.title,
    messages.settings.integrations.title,
  ]);
  for (const heading of headings) {
    expect(heading.classList.contains("text-xl")).toBe(true);
    expect(heading.classList.contains("font-semibold")).toBe(true);
  }
});

test("institution save action shares the title row and still submits its associated form", async () => {
  renderSettings(<InstitutionSettingsPage />);
  const save = screen.getByRole("button", {
    name: messages.settings.institutionSettings.save,
  }) as HTMLButtonElement;
  const title = screen.getByRole("heading", {
    name: messages.settings.institutionSettings.title,
  });
  expect(save.parentElement).toBe(title.parentElement);
  expect(save.disabled).toBe(true);
  const name = screen.getByLabelText(
    messages.settings.institutionSettings.name,
  );
  expect(save.form).toBe(name.closest("form"));
  fireEvent.change(name, { target: { value: "Updated School" } });
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenCalledWith({
      id: "school",
      name: "Updated School",
      timeZone: "America/Bogota",
    }),
  );
});

test("read-only institution settings do not expose the save action", () => {
  mocks.admin = false;
  renderSettings(<InstitutionSettingsPage />);
  expect(
    screen.queryByRole("button", {
      name: messages.settings.institutionSettings.save,
    }),
  ).toBeNull();
});

test("General offers a circular connect action instead of navigation when disconnected", () => {
  renderSettings(<IntegrationSettings />);
  const logo = screen.getByRole("img", { name: "Abeka" });
  const item = logo.closest('[data-slot="item"]');
  expect(item?.getAttribute("data-variant")).toBe("outline");
  expect(logo.closest('[data-slot="item-media"]')).not.toBeNull();
  expect(logo.classList.contains("grayscale")).toBe(true);
  expect(logo.classList.contains("opacity-40")).toBe(true);
  const connect = screen.getByRole("button", {
    name: messages.settings.integrations.connect,
  });
  expect(connect.classList.contains("rounded-full")).toBe(true);
  expect(screen.queryByRole("link")).toBeNull();
  expect(connect.closest('[data-slot="item-actions"]')).not.toBeNull();
  expect(connect.textContent).toBe("");
  expect(screen.queryByRole("button", { name: "Desconectar" })).toBeNull();
  expect(mocks.paginated).not.toHaveBeenCalled();
});

test("General remains a summary when connected and never loads the student table", () => {
  mocks.query.mockReturnValue({
    hasCredentials: true,
    connection: { status: "connected", confirmed: true },
    run: null,
  });
  renderSettings(<IntegrationSettings />);
  expect(
    screen.getByRole("link", {
      name: messages.settings.integrations.detail.open,
    }),
  ).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  expect(
    screen.queryByRole("button", {
      name: messages.settings.integrations.credentials.replace,
    }),
  ).toBeNull();
  expect(mocks.paginated).not.toHaveBeenCalled();
  expect(mocks.router.push).not.toHaveBeenCalled();
});

test.each([null, { status: "disconnected", confirmed: true }])(
  "direct integration access redirects to General without subscribing to tables: %j",
  (connection) => {
    mocks.query.mockReturnValue({ connection, run: null });
    renderSettings();
    expect(mocks.router.replace).toHaveBeenCalledWith("/school/settings");
    expect(screen.queryByRole("heading", { name: "Abeka" })).toBeNull();
    expect(mocks.paginated).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  },
);

test("route waits for status and reacts to disconnection from another tab", () => {
  mocks.query.mockReturnValue(undefined);
  const view = renderSettings();
  expect(mocks.router.replace).not.toHaveBeenCalled();
  mocks.query.mockReturnValue({
    connection: { status: "connected", confirmed: false },
    run: null,
  });
  const page = (
    <NextIntlClientProvider
      locale="es"
      messages={messages}
      timeZone="America/Bogota"
    >
      <AbekaIntegrationPage />
    </NextIntlClientProvider>
  );
  view.rerender(page);
  expect(screen.getByRole("heading", { name: "Abeka" })).toBeTruthy();
  mocks.query.mockReturnValue({
    connection: { status: "disconnected", confirmed: true },
    run: null,
  });
  view.rerender(
    <NextIntlClientProvider
      locale="es"
      messages={messages}
      timeZone="America/Bogota"
    >
      <AbekaIntegrationPage />
    </NextIntlClientProvider>,
  );
  expect(mocks.router.replace).toHaveBeenCalledWith("/school/settings");
  expect(screen.queryByRole("heading", { name: "Abeka" })).toBeNull();
});

test.each(["connecting", "needs_confirmation", "needs_reconnect", "error"])(
  "setup and recovery remain accessible: %s",
  (status) => {
    mocks.query.mockReturnValue({
      connection: { status, confirmed: false },
      run: null,
    });
    renderSettings();
    expect(screen.getByRole("heading", { name: "Abeka" })).toBeTruthy();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  },
);

test("Abeka page has a General backlink, detailed information and existing management actions", () => {
  mocks.query.mockReturnValue({
    hasCredentials: true,
    connection: { status: "connected", confirmed: true },
    run: null,
  });
  renderSettings();
  const t = messages.settings.integrations;
  expect(screen.queryByRole("link", { name: "Volver a General" })).toBeNull();
  expect(screen.getByRole("heading", { name: t.detail.title })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: t.credentials.replace }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: t.updateData })).toBeTruthy();
  expect(screen.queryByRole("button", { name: t.syncNow })).toBeNull();
  expect(screen.getByRole("table")).toBeTruthy();
});

test("Abeka header presents its logo, ordered icon actions and keyboard tooltips without an Item", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  mocks.query.mockReturnValue({
    hasCredentials: true,
    connection: { status: "connected", confirmed: true },
    run: null,
  });
  renderSettings();
  const t = messages.settings.integrations;
  const title = screen.getByRole("heading", { name: "Abeka" });
  const logo = screen.getByRole("img", { name: "Abeka" });
  expect(logo.parentElement).toBe(title.parentElement);
  expect(logo.closest('[data-slot="item"]')).toBeNull();
  const actions = screen.getByRole("group", { name: t.actions });
  expect(actions.parentElement).toBe(title.parentElement?.parentElement);
  const buttons = within(actions).getAllByRole("button");
  expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
    t.updateData,
    t.disconnect,
    t.credentials.replace,
  ]);
  for (const button of buttons) {
    expect(button.textContent).toBe("");
    fireEvent.focus(button);
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      button.getAttribute("aria-label"),
    );
    fireEvent.blur(button);
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  }
  expect(mocks.mutate).not.toHaveBeenCalled();
});

test("connection metadata and the single update action stay in the header", () => {
  mocks.query.mockReturnValue({
    hasCredentials: true,
    connection: {
      status: "connected",
      confirmed: true,
      externalSchoolName: "Example Academy",
      externalSchoolId: "1234",
      lastSyncedAt: 1_790_300_000_000,
      nextSyncAt: 1_790_904_800_000,
    },
    run: null,
  });
  renderSettings();
  const t = messages.settings.integrations;
  const header = screen
    .getByRole("heading", { name: "Abeka" })
    .closest("header")!;
  expect(within(header).getByText("Example Academy · 1234")).toBeTruthy();
  const last = within(header).getByText(`${t.lastSync}:`).parentElement!;
  const next = within(header)
    .getByText(`${t.nextSync}:`)
    .closest("dt")!.parentElement!;
  expect(last.nextElementSibling).toBe(next);
  expect(last.querySelector("dd")?.textContent).not.toBe(t.never);
  expect(next.querySelector("dd")?.textContent).not.toBe(t.never);
  const about = within(header).getByRole("heading", { name: t.detail.title });
  expect(about.closest("summary")).not.toBeNull();
  expect(about.closest("details")?.open).toBe(false);
  expect(
    within(header).getByRole("button", { name: t.updateData }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: t.syncNow })).toBeNull();
});

test("student table uses shared pagination and searches the complete imported roster", async () => {
  mocks.query.mockImplementation((name) =>
    name === "abeka:status"
      ? {
          connection: { status: "connected", confirmed: true },
          run: null,
        }
      : [],
  );
  const rows = Array.from({ length: 26 }, (_, index) => ({
    _id: `student-${index}`,
    name: index === 25 ? "Provider Target" : `Other Student ${index}`,
    loginId: index === 25 ? "664680" : String(index),
    linkedName: index === 25 ? "Linked Target" : null,
    campusName: index === 25 ? "North Campus" : null,
    available: true,
  }));
  const loadMore = vi.fn();
  mocks.paginated.mockReturnValue({
    results: rows.slice(0, 25),
    status: "CanLoadMore",
    loadMore,
  });
  const view = renderSettings();
  await waitFor(() => expect(loadMore).toHaveBeenCalledWith(25));
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByRole("status")).toBeTruthy();
  expect(
    screen.getByRole("tab", {
      name: messages.settings.integrations.students,
    }).textContent,
  ).not.toContain("(");
  mocks.paginated.mockReturnValue({
    results: rows,
    status: "Exhausted",
    loadMore,
  });
  view.rerender(
    <NextIntlClientProvider
      locale="es"
      messages={messages}
      timeZone="America/Bogota"
    >
      <AbekaIntegrationPage />
    </NextIntlClientProvider>,
  );
  const t = messages.settings.integrations;
  expect(screen.queryByText(t.mappingExplanation)).toBeNull();
  expect(screen.getByRole("tab", { name: `${t.students}(26)` })).toBeTruthy();
  expect(screen.getByRole("table").getAttribute("data-slot")).toBe("table");
  const panel = screen.getByRole("tabpanel");
  expect(panel.classList.contains("min-w-0")).toBe(true);
  expect(
    panel.closest('[data-slot="tabs"]')?.classList.contains("grid-cols-1"),
  ).toBe(true);
  expect(panel.closest("section")?.classList.contains("grid-cols-1")).toBe(
    true,
  );
  expect(screen.getByRole("tablist").classList.contains("flex-wrap")).toBe(
    true,
  );
  expect(
    screen
      .getByRole("table")
      .parentElement?.classList.contains("overflow-x-auto"),
  ).toBe(true);
  expect(screen.queryByText("Provider Target")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  expect(screen.getByText("Provider Target")).toBeTruthy();
  const search = screen.getByPlaceholderText(t.searchStudents);
  // No empty actions wrapper may reserve a gap at the right of the search bar.
  expect(
    search.closest('[data-slot="input-group"]')?.parentElement?.children.length,
  ).toBe(1);
  for (const term of [
    "provider target",
    "LINKED TARGET",
    "664680",
    "north campus",
  ]) {
    fireEvent.change(search, { target: { value: term } });
    expect(screen.getByRole("tab", { name: `${t.students}(1)` })).toBeTruthy();
    expect(screen.getByText("Provider Target")).toBeTruthy();
    expect(screen.queryByText("Other Student 0")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Go to previous page",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  }
  fireEvent.change(search, { target: { value: "no match" } });
  expect(screen.getByRole("tab", { name: `${t.students}(0)` })).toBeTruthy();
  expect(screen.getByText(messages.common.noResults)).toBeTruthy();
  fireEvent.change(search, { target: { value: "" } });
  expect(screen.getByRole("tab", { name: `${t.students}(26)` })).toBeTruthy();
  expect(screen.getByText("Other Student 0")).toBeTruthy();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.mutate).not.toHaveBeenCalled();
});

test("course tab selects institutional curriculums without a campus and refreshes only on demand", async () => {
  const t = messages.settings.integrations;
  mocks.query.mockImplementation((name) =>
    name === "abeka:status"
      ? {
          connection: {
            status: "connected",
            confirmed: true,
            curriculumLinksMigratedAt: 1,
          },
          run: null,
        }
      : name === "campuses:listForInstitutionSettings"
        ? [{ _id: "north", name: "North", isActive: true }]
        : undefined,
  );
  mocks.paginated.mockImplementation((name) => ({
    results:
      name === "abekaCurriculumLinks:courses"
        ? [
            {
              _id: "english",
              subjectId: "5298",
              name: "English 12",
              available: true,
              totalLessons: 170,
              links: [],
            },
          ]
        : name === "abekaCurriculumLinks:candidates"
          ? [{ id: "curriculum", name: "English A", code: "ENG" }]
          : [],
    status: "Exhausted",
  }));
  mocks.mutate.mockResolvedValue(null);
  renderSettings();
  expect(
    mocks.paginated.mock.calls.some(
      ([name]) => name === "abekaCurriculumLinks:courses",
    ),
  ).toBe(false);
  fireEvent.mouseDown(screen.getByRole("tab", { name: t.courses.title }), {
    button: 0,
    ctrlKey: false,
  });
  const course = await screen.findByRole("combobox", {
    name: `${t.courses.flexidual} · English 12`,
  });
  expect((course as HTMLInputElement).disabled).toBe(false);
  expect(
    screen.getByRole("tab", { name: `${t.courses.title}(1)` }),
  ).toBeTruthy();
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("combobox", { name: `${t.campus} · English 12` }),
  ).toBeNull();
  expect((course as HTMLInputElement).disabled).toBe(false);
  fireEvent.focus(course);
  fireEvent.keyDown(course, { key: "ArrowDown" });
  fireEvent.change(course, { target: { value: "English A" } });
  fireEvent.click(await screen.findByRole("option", { name: /English A/ }));
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenCalledWith({
      courseId: "english",
      curriculumId: "curriculum",
    }),
  );
  const search = screen.getByPlaceholderText(t.courses.search);
  fireEvent.change(search, { target: { value: "missing" } });
  expect(
    screen.getByRole("tab", { name: `${t.courses.title}(0)` }),
  ).toBeTruthy();
  const refreshButton = screen.getByRole("button", { name: t.courses.refresh });
  expect(refreshButton.getAttribute("aria-label")).toBe(t.courses.refresh);
  const refreshLabel = within(refreshButton).getByText(t.courses.refresh);
  expect(refreshLabel.classList.contains("hidden")).toBe(true);
  expect(refreshLabel.classList.contains("md:inline")).toBe(true);
  expect(screen.getByRole("tabpanel").classList.contains("min-w-0")).toBe(true);
  fireEvent.click(refreshButton);
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenCalledWith({ schoolId: "school" }),
  );
  expect(mocks.fetch).not.toHaveBeenCalled();
});

test("curriculum selection stays locked until migration completes without triggering provider calls", async () => {
  const t = messages.settings.integrations;
  mocks.query.mockReturnValue({
    connection: { status: "connected", confirmed: true },
    run: null,
  });
  mocks.paginated.mockImplementation((name) => ({
    results:
      name === "abekaCurriculumLinks:courses"
        ? [
            {
              _id: "english",
              subjectId: "5298",
              name: "English 12",
              available: true,
              totalLessons: 170,
              links: [],
            },
          ]
        : [],
    status: "Exhausted",
  }));
  renderSettings();
  fireEvent.mouseDown(screen.getByRole("tab", { name: t.courses.title }), {
    button: 0,
    ctrlKey: false,
  });
  expect(await screen.findByText(t.courses.migrationPending)).toBeTruthy();
  const input = screen.getByRole("combobox", {
    name: `${t.courses.flexidual} · English 12`,
  });
  expect((input as HTMLInputElement).disabled).toBe(true);
  expect(
    mocks.paginated.mock.calls.some(
      ([name]) => name === "abekaCurriculumLinks:candidates",
    ),
  ).toBe(false);
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

test("curriculum chips preserve multiple links and remove only the chosen association", async () => {
  const t = messages.settings.integrations;
  mocks.query.mockImplementation((name) =>
    name === "abeka:status"
      ? {
          connection: {
            status: "connected",
            confirmed: true,
            curriculumLinksMigratedAt: 1,
          },
          run: null,
        }
      : name === "campuses:listForInstitutionSettings"
        ? [{ _id: "north", name: "North", isActive: true }]
        : undefined,
  );
  mocks.paginated.mockImplementation((name) => ({
    results:
      name === "abekaCurriculumLinks:courses"
        ? [
            {
              _id: "english",
              subjectId: "5298",
              name: "English 12",
              available: true,
              totalLessons: 170,
              links: [
                {
                  curriculumId: "north-curriculum",
                  name: "English North",
                  active: true,
                },
                {
                  curriculumId: "south-curriculum",
                  name: "English South",
                  active: false,
                },
              ],
            },
          ]
        : name === "abekaCurriculumLinks:candidates"
          ? [{ id: "new-curriculum", name: "English B", code: null }]
          : [],
    status: "Exhausted",
  }));
  const view = renderSettings();
  fireEvent.mouseDown(screen.getByRole("tab", { name: t.courses.title }), {
    button: 0,
    ctrlKey: false,
  });
  const input = await screen.findByRole("combobox", {
    name: `${t.courses.flexidual} · English 12`,
  });
  expect((input as HTMLInputElement).disabled).toBe(false);
  const chips = input.closest('[data-slot="combobox-chips"]')!;
  expect(within(chips as HTMLElement).getByText("English North")).toBeTruthy();
  expect(within(chips as HTMLElement).getByText("English South")).toBeTruthy();
  expect(mocks.mutate).not.toHaveBeenCalled();

  // Existing inactive links remain removable.
  mocks.mutate.mockRejectedValueOnce(new Error("save failed"));
  fireEvent.click(
    screen.getByRole("button", { name: `${t.unlink} · English South` }),
  );
  await waitFor(() =>
    expect(mocks.error).toHaveBeenCalledWith(t.courses.linkError),
  );
  expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith({
    courseId: "english",
    curriculumId: "south-curriculum",
    remove: true,
  });
  expect(screen.getByText("English North")).toBeTruthy();
  expect(screen.getByText("English South")).toBeTruthy();

  // Adding a curriculum must not remove existing links.
  mocks.mutate.mockReset().mockResolvedValue(null);
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.change(input, { target: { value: "English B" } });
  fireEvent.click(await screen.findByRole("option", { name: /English B/ }));
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith({
      courseId: "english",
      curriculumId: "new-curriculum",
    }),
  );
  expect(screen.getByText("English North")).toBeTruthy();
  expect(screen.getByText("English South")).toBeTruthy();
  expect(mocks.fetch).not.toHaveBeenCalled();
  view.unmount();
});

test("inline selectors save links and disable empty reports while preserving sync locks", async () => {
  const t = messages.settings.integrations;
  mocks.query.mockImplementation((name) =>
    name === "abeka:status"
      ? { connection: { status: "connected", confirmed: true }, run: null }
      : name === "campuses:listForInstitutionSettings"
        ? [{ _id: "campus", name: "North", isActive: true }]
        : [],
  );
  const student = {
    _id: "abeka-student",
    name: "Example Student",
    loginId: "42",
    linkedName: null,
    campusName: null,
    campusId: null,
    available: true,
  };
  mocks.paginated.mockImplementation((name) => ({
    results:
      name === "abeka:students"
        ? [student]
        : [
            {
              id: "flexidual-student",
              name: "Flexidual Student",
              username: "student",
            },
          ],
    status: "Exhausted",
  }));
  renderSettings();
  expect(screen.queryByRole("button", { name: t.link })).toBeNull();
  const studentSelector = () =>
    screen.getByRole("combobox", {
      name: `${t.flexidualStudent} · ${student.name}`,
    }) as HTMLButtonElement;
  const campusSelector = () =>
    screen.getByRole("combobox", {
      name: `${t.campus} · ${student.name}`,
    }) as HTMLButtonElement;
  expect(studentSelector().disabled).toBe(true);
  expect(mocks.paginated).not.toHaveBeenCalledWith(
    "abeka:studentCandidates",
    expect.anything(),
  );
  fireEvent.click(campusSelector());
  fireEvent.change(screen.getByPlaceholderText(messages.common.search), {
    target: { value: "North" },
  });
  fireEvent.click(screen.getByRole("option", { name: "North" }));
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(studentSelector().disabled).toBe(false);
  fireEvent.click(studentSelector());
  expect(mocks.paginated).toHaveBeenCalledWith("abeka:studentCandidates", {
    schoolId: "school",
    campusId: "campus",
  });
  fireEvent.change(screen.getByPlaceholderText(messages.common.search), {
    target: { value: "Flexidual Student" },
  });
  fireEvent.click(
    screen.getByRole("option", { name: "Flexidual Student · student" }),
  );
  await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
  expect(mocks.mutate).toHaveBeenCalledWith({
    studentId: "abeka-student",
    userId: "flexidual-student",
  });
  expect(
    (screen.getByRole("button", { name: t.report }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
  cleanup();
  mocks.query.mockImplementation((name) =>
    name === "abeka:status"
      ? {
          connection: { status: "connected", confirmed: true },
          run: { status: "running", studentsSynced: 0 },
        }
      : [],
  );
  renderSettings();
  expect(campusSelector().disabled).toBe(true);
  expect(
    (screen.getByRole("button", { name: t.report }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test("pending links highlight selectors and Update data until synchronization completes", async () => {
  const t = messages.settings.integrations;
  mocks.query.mockImplementation((name) =>
    name === "abeka:status"
      ? { connection: { confirmed: true, status: "connected" }, run: null }
      : name === "campuses:listForInstitutionSettings"
        ? [{ _id: "campus", name: "North", isActive: true }]
        : [],
  );
  const student = {
    _id: "abeka-student",
    name: "Provider Student",
    loginId: "42",
    userId: "user",
    linkedName: "Linked Student",
    campusId: "campus",
    campusName: "North",
    available: true,
    syncPending: true,
    hasProgress: false,
  };
  mocks.paginated.mockImplementation((name) => ({
    results: name === "abeka:students" ? [student] : [],
    status: "Exhausted",
  }));
  renderSettings();
  const update = screen.getByRole("button", { name: t.updateData });
  expect(update.className).toContain("bg-amber-50");
  expect(
    screen.getByRole("combobox", {
      name: `${t.flexidualStudent} · ${student.name}`,
    }).className,
  ).toContain("bg-amber-50");
  expect(
    screen.getByRole("combobox", { name: `${t.campus} · ${student.name}` })
      .className,
  ).toContain("bg-amber-50");
  expect(
    (screen.getByRole("button", { name: t.report }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.focus(
    screen.getByRole("combobox", {
      name: `${t.flexidualStudent} · ${student.name}`,
    }),
  );
  expect((await screen.findByRole("tooltip")).textContent).toBe(t.pendingSync);
  fireEvent.click(update);
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenCalledWith({ schoolId: "school" }),
  );
  // Remount simulates navigation/reload; the query remains the source of truth.
  cleanup();
  renderSettings();
  expect(
    screen.getByRole("button", { name: t.updateData }).className,
  ).toContain("bg-amber-50");
  cleanup();
  student.hasProgress = true;
  renderSettings();
  expect(
    (screen.getByRole("button", { name: t.report }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  expect(
    screen.getByRole("button", { name: t.updateData }).className,
  ).toContain("bg-amber-50");
  cleanup();
  student.syncPending = false;
  renderSettings();
  expect(
    screen.getByRole("button", { name: t.updateData }).className,
  ).not.toContain("bg-amber-50");
  expect(
    screen.getByRole("combobox", {
      name: `${t.flexidualStudent} · ${student.name}`,
    }).className,
  ).not.toContain("bg-amber-50");
  fireEvent.click(screen.getByRole("button", { name: t.report }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  cleanup();
  student.userId = "";
  renderSettings();
  expect(
    (screen.getByRole("button", { name: t.report }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test("campus edits preserve saved links on failure and explicit unlink remains available", async () => {
  const t = messages.settings.integrations;
  const student = {
    _id: "abeka-student",
    name: "Provider Student",
    loginId: "42",
    userId: "old-user",
    linkedName: "Saved Student",
    campusId: "north",
    campusName: "North",
    available: true,
  };
  mocks.query.mockImplementation((name) =>
    name === "abeka:status"
      ? { connection: { status: "connected", confirmed: true }, run: null }
      : [
          { _id: "north", name: "North", isActive: true },
          { _id: "south", name: "South", isActive: true },
        ],
  );
  mocks.paginated.mockImplementation((name, args) => ({
    results:
      name === "abeka:students"
        ? [student]
        : args.campusId === "south"
          ? [{ id: "new-user", name: "New Student", username: "new" }]
          : [{ id: "old-user", name: "Saved Student", username: "old" }],
    status: "Exhausted",
  }));
  let rejectSave!: (error: Error) => void;
  mocks.mutate.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectSave = reject;
      }),
  );
  renderSettings();
  const campus = () =>
    screen.getByRole("combobox", {
      name: `${t.campus} · ${student.name}`,
    }) as HTMLButtonElement;
  const user = () =>
    screen.getByRole("combobox", {
      name: `${t.flexidualStudent} · ${student.name}`,
    }) as HTMLButtonElement;
  expect(campus().textContent).toContain("North");
  expect(user().textContent).toContain("Saved Student");
  fireEvent.click(user());
  fireEvent.click(screen.getByRole("option", { name: "Saved Student · old" }));
  expect(mocks.mutate).not.toHaveBeenCalled();
  fireEvent.click(campus());
  fireEvent.click(screen.getByRole("option", { name: "South" }));
  expect(user().textContent).toContain(t.chooseStudent);
  expect(mocks.mutate).not.toHaveBeenCalled();
  fireEvent.click(user());
  expect(screen.queryByRole("option", { name: /Saved Student/ })).toBeNull();
  fireEvent.click(screen.getByRole("option", { name: "New Student · new" }));
  expect(user().disabled).toBe(true);
  expect(campus().disabled).toBe(true);
  expect(screen.getByRole("status", { name: t.loading })).toBeTruthy();
  rejectSave(new Error("ALREADY_LINKED"));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(t.linkError));
  await waitFor(() => expect(user().disabled).toBe(false));
  expect(campus().textContent).toContain("North");
  expect(user().textContent).toContain("Saved Student");
  fireEvent.click(user());
  fireEvent.click(screen.getByRole("option", { name: t.unlink }));
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenLastCalledWith({
      studentId: student._id,
      userId: null,
    }),
  );
  expect(mocks.mutate).toHaveBeenCalledTimes(2);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

test("campus candidates load in pages only while a selector is open", async () => {
  const t = messages.settings.integrations;
  mocks.query.mockImplementation((name) =>
    name === "abeka:status"
      ? { connection: { status: "connected", confirmed: true }, run: null }
      : [{ _id: "north", name: "North", isActive: true }],
  );
  const loadMore = vi.fn();
  let loaded = false;
  mocks.paginated.mockImplementation((name) =>
    name === "abeka:students"
      ? {
          results: [
            {
              _id: "abeka-student",
              name: "Provider Student",
              loginId: "42",
              campusId: "north",
              campusName: "North",
              available: true,
            },
          ],
          status: "Exhausted",
        }
      : {
          results: [{ id: "late-user", name: "Later Page", username: "late" }],
          status: loaded ? "Exhausted" : "CanLoadMore",
          loadMore,
        },
  );
  const view = renderSettings();
  expect(loadMore).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("combobox", {
      name: `${t.flexidualStudent} · Provider Student`,
    }),
  );
  await waitFor(() => expect(loadMore).toHaveBeenCalledWith(50));
  expect(
    screen.getByRole("status").querySelector("svg.animate-spin"),
  ).toBeTruthy();
  expect(
    screen.queryByRole("option", { name: "Later Page · late" }),
  ).toBeNull();
  loaded = true;
  view.rerender(
    <NextIntlClientProvider
      locale="es"
      messages={messages}
      timeZone="America/Bogota"
    >
      <AbekaIntegrationPage />
    </NextIntlClientProvider>,
  );
  expect(
    screen.getByRole("option", { name: "Later Page · late" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("option", { name: "Later Page · late" }));
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenCalledWith({
      studentId: "abeka-student",
      userId: "late-user",
    }),
  );
});

test("loading status and student pages use the shared spinner", () => {
  mocks.query.mockReturnValue(undefined);
  renderSettings();
  expect(
    screen.getByRole("status").querySelector("svg.animate-spin"),
  ).toBeTruthy();
  cleanup();
  mocks.query.mockReturnValue({
    connection: { status: "connected", confirmed: true },
    run: null,
  });
  mocks.paginated.mockReturnValue({ results: [], status: "LoadingFirstPage" });
  renderSettings();
  expect(
    screen.getByRole("status").querySelector("svg.animate-spin"),
  ).toBeTruthy();
});

test("a disconnected saved connection offers connect again, not session renewal", () => {
  mocks.query.mockReturnValue({
    connection: { status: "disconnected", confirmed: true },
    run: null,
  });
  renderSettings(<IntegrationSettings />);
  expect(screen.getByRole("button", { name: "Conectar Abeka" })).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "Abeka" }).classList.contains("grayscale"),
  ).toBe(true);
});

test("a connected integration restores the logo color and preserves manual synchronization", async () => {
  mocks.query.mockReturnValue({
    connection: { status: "connected", confirmed: true },
    run: null,
  });
  renderSettings();
  expect(
    screen.getByRole("img", { name: "Abeka" }).classList.contains("grayscale"),
  ).toBe(false);
  fireEvent.click(
    screen.getByRole("button", {
      name: messages.settings.integrations.updateData,
    }),
  );
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenCalledWith({ schoolId: "school" }),
  );
});

test("session entry is masked, cleared immediately and sent only to the authenticated Convex endpoint", async () => {
  renderSettings(<IntegrationSettings />);
  fireEvent.click(screen.getByRole("button", { name: "Conectar Abeka" }));
  const field = screen.getByLabelText(
    "Sesión de Abeka (valor de Cookie)",
  ) as HTMLInputElement;
  expect(field.type).toBe("password");
  expect(field.closest(".ph-no-capture")).not.toBeNull();
  fireEvent.change(field, { target: { value: "session=test-secret" } });
  fireEvent.submit(field.closest("form")!);
  expect(field.value).toBe("");
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  expect(mocks.fetch).toHaveBeenCalledWith(
    "https://example.convex.site/abeka-session?schoolId=school",
    expect.objectContaining({
      method: "POST",
      body: "session=test-secret",
      headers: {
        Authorization: "Bearer fake-token",
        "Content-Type": "text/plain",
      },
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByLabelText("Sesión de Abeka (valor de Cookie)"),
    ).toBeNull(),
  );
});

test("disconnect requires an explicit confirmation", async () => {
  mocks.query.mockReturnValue({
    connection: { status: "connected", confirmed: false },
    run: null,
  });
  renderSettings();
  fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
  expect(mocks.mutate).not.toHaveBeenCalled();
  const dialog = screen.getByRole("alertdialog", { name: "Desconectar" });
  expect(
    within(dialog).getByText(
      messages.settings.integrations.disconnectExplanation,
    ),
  ).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(mocks.mutate).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Desconectar" }),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Desconectar",
    }),
  );
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenCalledWith({ schoolId: "school" }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
});

test("disconnect keeps the alert dialog open while saving and after an error", async () => {
  mocks.query.mockReturnValue({
    connection: { status: "connected", confirmed: false },
    run: null,
  });
  let reject!: (error: Error) => void;
  mocks.mutate.mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  renderSettings();
  fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
  const dialog = screen.getByRole("alertdialog");
  const confirm = within(dialog).getByRole("button", { name: "Desconectar" });
  const cancel = within(dialog).getByRole("button", { name: "Cancelar" });
  fireEvent.click(confirm);
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  expect((cancel as HTMLButtonElement).disabled).toBe(true);
  expect(
    within(dialog).getByLabelText(messages.settings.integrations.loading),
  ).toBeTruthy();
  fireEvent.click(confirm);
  expect(mocks.mutate).toHaveBeenCalledTimes(1);
  reject(new Error("Test failure"));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  expect(screen.getByRole("alertdialog")).toBe(dialog);
  expect((confirm as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(cancel);
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

test("connect saves credentials through HTTP once, clears inputs and closes only on acceptance", async () => {
  const t = messages.settings.integrations;
  mocks.fetch.mockResolvedValue(
    Response.json({ accepted: true }, { status: 202 }),
  );
  const view = renderSettings(<IntegrationSettings />);
  fireEvent.click(screen.getByRole("button", { name: t.connect }));
  const username = screen.getByLabelText(
    t.loginProbe.username,
  ) as HTMLInputElement;
  const password = screen.getByLabelText(
    t.loginProbe.password,
  ) as HTMLInputElement;
  expect(password.type).toBe("password");
  expect(password.closest(".ph-no-capture")).not.toBeNull();
  fireEvent.change(username, { target: { value: "test-account" } });
  fireEvent.change(password, { target: { value: "not-real" } });
  fireEvent.submit(password.closest("form")!);
  fireEvent.submit(password.closest("form")!);
  expect(password.value).toBe("");
  expect(username.value).toBe("");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.fetch).toHaveBeenCalledWith(
    "https://example.convex.site/abeka-credentials?schoolId=school",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ username: "test-account", password: "not-real" }),
      headers: {
        Authorization: "Bearer fake-token",
        "Content-Type": "application/json",
      },
    }),
  );
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(mocks.router.push).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("button", { name: t.connect }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  mocks.query.mockReturnValue({
    connection: { status: "connecting", confirmed: false },
    run: { status: "running" },
  });
  view.rerender(
    <NextIntlClientProvider
      locale="es"
      messages={messages}
      timeZone="America/Bogota"
    >
      <IntegrationSettings />
    </NextIntlClientProvider>,
  );
  await waitFor(() =>
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith(
      "/school/settings/integrations/abeka",
    ),
  );
  expect(screen.getByRole("link", { name: t.detail.open })).toBeTruthy();
});

test("failed connection from General keeps the dialog open and does not navigate", async () => {
  const t = messages.settings.integrations;
  mocks.fetch.mockResolvedValue(
    Response.json({ error: "SIGN_IN_REJECTED" }, { status: 400 }),
  );
  renderSettings(<IntegrationSettings />);
  fireEvent.click(screen.getByRole("button", { name: t.connect }));
  const username = screen.getByLabelText(t.loginProbe.username);
  const password = screen.getByLabelText(t.loginProbe.password);
  fireEvent.change(username, { target: { value: "test-account" } });
  fireEvent.change(password, { target: { value: "not-real" } });
  fireEvent.submit(password.closest("form")!);
  expect(
    await screen.findByText(t.loginProbe.errors.SIGN_IN_REJECTED),
  ).toBeTruthy();
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(mocks.router.push).not.toHaveBeenCalled();
  expect(screen.queryByRole("link", { name: t.detail.open })).toBeNull();
});

test("update with stored credentials does not open or submit a password form", async () => {
  mocks.query.mockReturnValue({
    hasCredentials: true,
    connection: { status: "needs_reconnect", confirmed: true },
    run: null,
  });
  renderSettings();
  fireEvent.click(
    screen.getByRole("button", {
      name: messages.settings.integrations.updateData,
    }),
  );
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenCalledWith({ schoolId: "school" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

test("replace credentials offers empty fields and failed verification leaves the dialog open", async () => {
  const t = messages.settings.integrations;
  mocks.query.mockReturnValue({
    hasCredentials: true,
    connection: { status: "connected", confirmed: true },
    run: null,
  });
  mocks.fetch.mockResolvedValue(
    Response.json({ error: "SIGN_IN_REJECTED" }, { status: 400 }),
  );
  renderSettings();
  fireEvent.click(screen.getByRole("button", { name: t.credentials.replace }));
  const password = screen.getByLabelText(
    t.loginProbe.password,
  ) as HTMLInputElement;
  expect(password.value).toBe("");
  fireEvent.change(screen.getByLabelText(t.loginProbe.username), {
    target: { value: "test" },
  });
  fireEvent.change(password, { target: { value: "not-real" } });
  fireEvent.submit(password.closest("form")!);
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      t.loginProbe.errors.SIGN_IN_REJECTED,
    ),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(mocks.mutate).not.toHaveBeenCalled();
});
