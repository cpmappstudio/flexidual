import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { CourseTaskEditor } from "@/components/teaching/classes/course-task-editor";

const create = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: async () => "test-token" }),
}));
vi.mock("convex/react", () => ({
  useConvex: () => ({ query: vi.fn() }),
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "courseTasks:create" ? create : vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test.each([
  [
    "en",
    "This course is closed or its end date could not be determined. Assignments cannot be created or modified, and supporting materials cannot be added.",
  ],
  [
    "es",
    "Este curso está cerrado o no se pudo determinar su fecha de finalización. No se pueden crear ni modificar tareas ni añadir material de apoyo.",
  ],
  [
    "pt-BR",
    "Este curso está encerrado ou não foi possível determinar sua data de término. Não é possível criar ou modificar tarefas nem adicionar materiais de apoio.",
  ],
])(
  "explains a closed course without requiring attachments (%s)",
  async (locale, expected) => {
    const source = readFileSync(`messages/${locale}.json`, "utf8");
    const messages = JSON.parse(source);
    expect(source.match(/"courseClosedError"\s*:/g)).toHaveLength(1);
    create.mockRejectedValue(new ConvexError("COURSE_CLOSED"));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const onSaved = vi.fn();
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="UTC"
      >
        <CourseTaskEditor
          classId={"course" as Id<"classes">}
          materials={[]}
          timeZone="UTC"
          onClose={vi.fn()}
          onSaved={onSaved}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.change(document.querySelector("#task-title")!, {
      target: { value: "Essay" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: messages.courseTasks.publish }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(expected);
    expect(create).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByText(messages.courseTasks.inputMaterials)).toBeTruthy();
  },
);
