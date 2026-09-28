import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, expect, test, vi } from "vitest";
import { PostHog } from "posthog-js";
import { PostHogSurveyPanel } from "@/components/posthog-survey-panel";
import { posthogConfig, getPosthogSurveyConfig } from "@/lib/posthog-config";
import { requestSurveyOpen } from "@/lib/survey-navigation";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

test("real SDK renders Spanish, retains a draft while minimized, and captures final completion", async () => {
  // Load the installed native survey renderer, with all transport intercepted.
  window.eval(
    readFileSync(
      createRequire(import.meta.url).resolve("posthog-js/dist/surveys.js"),
      "utf8",
    ),
  );
  vi.spyOn(PostHog.prototype, "_send_request").mockImplementation(() => {});
  vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Network disabled in test"),
  );
  const client = new PostHog();
  client.init("phc_test", {
    ...posthogConfig,
    ...getPosthogSurveyConfig("native-test"),
    advanced_enable_surveys: true,
    api_host: "https://us.i.posthog.com",
    override_display_language: "es",
  });
  client.opt_in_capturing({ captureEventName: false });
  client.identify("teacher-fixture", { role: "teacher" });
  client.register({
    $surveys: [
      {
        id: "native-test",
        name: "Test",
        type: "popover",
        start_date: "2026-01-01",
        schedule: "once",
        enable_partial_responses: true,
        questions: [
          {
            id: "question-0",
            type: "open",
            question: "What works well?",
            translations: {
              es: { question: "¿Qué funciona bien?", buttonText: "Siguiente" },
            },
          },
          {
            id: "question-1",
            type: "open",
            question: "What could we improve?",
            translations: {
              es: { question: "¿Qué podríamos mejorar?", buttonText: "Enviar" },
            },
          },
        ],
        appearance: {
          displayThankYouMessage: true,
          thankYouMessageHeader: "Thank you",
        },
        translations: { es: { thankYouMessageHeader: "¡Gracias!" } },
      },
    ],
  });
  const captured = vi.fn();
  client.on("eventCaptured", captured);
  const view = render(
    <PostHogSurveyPanel
      client={client}
      surveyId="native-test"
      userId="teacher-fixture"
      locale="es"
    />,
  );
  try {
    const first = await screen.findByRole("textbox", {
      name: "¿Qué funciona bien?",
    });
    expect(screen.queryByText(/Survey by/)).toBeNull();
    expect(screen.queryByText("←")).toBeNull();
    fireEvent.input(first, { target: { value: "Las clases" } });
    await waitFor(() =>
      expect((screen.getByText("→") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByText("→"));
    await screen.findByRole("textbox", { name: "¿Qué podríamos mejorar?" });
    fireEvent.click(screen.getByText("←"));
    const previous = await screen.findByRole("textbox", {
      name: "¿Qué funciona bien?",
    });
    expect((previous as HTMLTextAreaElement).value).toBe("Las clases");
    fireEvent.click(screen.getByText("→"));
    const input = await screen.findByRole("textbox", {
      name: "¿Qué podríamos mejorar?",
    });
    fireEvent.input(input, { target: { value: "Mejorar las imágenes" } });
    fireEvent.click(screen.getByRole("button", { name: "Minimizar encuesta" }));
    const launcher = screen.getByRole("button", { name: "Completar encuesta" });
    expect(launcher.textContent).toBe("");
    expect(launcher.querySelector("svg")).not.toBeNull();
    act(() => requestSurveyOpen("wrong-survey"));
    expect(screen.queryByRole("textbox")).toBeNull();
    act(() => requestSurveyOpen("native-test"));
    expect(screen.getByRole("textbox")).toBe(input);
    expect((input as HTMLTextAreaElement).value).toBe("Mejorar las imágenes");
    await waitFor(() =>
      expect((screen.getByText("Enviar") as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByText("Enviar"));
    await waitFor(() =>
      expect(captured).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "survey sent",
          properties: expect.objectContaining({
            $survey_completed: true,
            "$survey_response_question-1": "Mejorar las imágenes",
            $survey_language: "es",
          }),
        }),
      ),
    );
    expect(await screen.findByText("¡Gracias!")).toBeDefined();
    expect(
      captured.mock.calls.some(([event]) => event.event === "survey dismissed"),
    ).toBe(false);
  } finally {
    view.unmount();
    client.reset(true);
    await client.shutdown();
  }
});

test("minimizing preserves the native form, only completion removes the entry, and accounts are isolated", () => {
  let ready = () => {};
  let capture: (event: {
    event: string;
    properties: Record<string, unknown>;
  }) => void = () => {};
  const sdk = {
    on: vi.fn((_name, callback) => {
      capture = callback;
      return vi.fn();
    }),
    onFeatureFlags: vi.fn((callback) => {
      ready = callback;
      return vi.fn();
    }),
    onSurveysLoaded: vi.fn(() => vi.fn()),
    getSurveys: vi.fn((callback) => callback([{ id: "test", questions: [] }])),
    surveys: {
      canRenderSurvey: vi.fn(() => ({ visible: true })),
      renderSurvey: vi.fn((_survey, selector) => {
        const input = document.createElement("textarea");
        input.setAttribute("aria-label", "Answer");
        document.querySelector(selector)!.append(input);
      }),
    },
    cancelPendingSurvey: vi.fn(),
  };
  const client = sdk as unknown as PostHog;
  const view = render(
    <PostHogSurveyPanel
      client={client}
      surveyId="test"
      userId="teacher-1"
      locale="es"
    />,
  );
  act(() => ready());
  const input = screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: "Mi opinión" } });
  fireEvent.click(screen.getByRole("button", { name: "Minimizar encuesta" }));
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Completar encuesta" }));
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input.value).toBe("Mi opinión");
  act(() => ready());
  expect(sdk.surveys.renderSurvey).toHaveBeenCalledOnce();
  act(() =>
    capture({
      event: "survey sent",
      properties: { $survey_id: "test", $survey_completed: false },
    }),
  );
  expect(screen.getByRole("textbox")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Minimizar encuesta" }));
  view.unmount();
  const resumed = render(
    <PostHogSurveyPanel
      client={client}
      surveyId="test"
      userId="teacher-1"
      locale="es"
    />,
  );
  act(() => ready());
  expect(
    screen.getByRole("button", { name: "Completar encuesta" }),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Completar encuesta" }));
  act(() =>
    capture({
      event: "survey sent",
      properties: { $survey_id: "test", $survey_completed: true },
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(screen.queryByRole("complementary")).toBeNull();
  resumed.unmount();
  const completed = render(
    <PostHogSurveyPanel
      client={client}
      surveyId="test"
      userId="teacher-1"
      locale="en"
    />,
  );
  act(() => ready());
  expect(screen.queryByRole("complementary")).toBeNull();
  completed.unmount();
  render(
    <PostHogSurveyPanel
      client={client}
      surveyId="test"
      userId="teacher-2"
      locale="en"
    />,
  );
  act(() => ready());
  expect(screen.getByRole("button", { name: "Minimize survey" })).toBeDefined();
});

test("does not override audience or page restrictions", () => {
  let ready = () => {};
  const survey = {
    id: "test",
    conditions: {
      url: "https://www.flexidual.com/",
      urlMatchType: "icontains",
    },
  };
  const sdk = {
    on: () => () => {},
    onFeatureFlags: (callback: () => void) => {
      ready = callback;
      return () => {};
    },
    onSurveysLoaded: () => () => {},
    getSurveys: (callback: (surveys: unknown[]) => void) => callback([survey]),
    surveys: {
      canRenderSurvey: vi.fn(() => ({ visible: false })),
      renderSurvey: vi.fn(),
    },
    cancelPendingSurvey: vi.fn(),
  };
  render(
    <PostHogSurveyPanel
      client={sdk as unknown as PostHog}
      surveyId="test"
      userId="teacher"
      locale="en"
    />,
  );
  act(() => ready());
  expect(sdk.surveys.renderSurvey).not.toHaveBeenCalled();
  survey.conditions.url = "http://localhost";
  act(() => ready());
  expect(sdk.surveys.canRenderSurvey).toHaveBeenCalled();
  expect(sdk.surveys.renderSurvey).not.toHaveBeenCalled();
});
