import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import {
  TaskAttachmentList,
  TaskFilePicker,
  TaskFileUploadStatus,
} from "@/components/teaching/classes/course-task-attachments";

const getToken = vi.hoisted(() => vi.fn().mockResolvedValue("test-token"));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("the attach control is visible without using the primary button treatment", () => {
  const { container } = render(
    <TaskFilePicker files={[]} onChange={vi.fn()} maxFiles={20} />,
  );
  const label = screen.getByText("addFiles");
  expect(label.classList.contains("bg-primary/5")).toBe(true);
  expect(label.classList.contains("border-primary/40")).toBe(true);
  expect(label.querySelector("svg")).not.toBeNull();
  expect(container.querySelector('input[type="file"]')).not.toBeNull();
});

test("long attachment names wrap within the file row", () => {
  const name = `${"very-long-assignment-filename-".repeat(8)}.pdf`;
  render(
    <TaskFilePicker
      files={[new File(["content"], name, { type: "application/pdf" })]}
      onChange={vi.fn()}
      maxFiles={20}
    />,
  );

  const filename = screen.getByText(name);
  expect(filename.classList.contains("break-all")).toBe(true);
  expect(filename.parentElement?.classList.contains("min-w-0")).toBe(true);
});

test("existing attachments share a row for preview, download and remove in the editor", () => {
  const file = {
    id: "file-id" as Id<"courseTaskFiles">,
    name: "long-existing-assignment-file-name.pdf",
    contentType: "application/pdf",
    size: 100,
  };
  const onRemove = vi.fn();
  const { rerender } = render(
    <TaskAttachmentList files={[file]} onRemove={onRemove} />,
  );

  const preview = screen.getByRole("button", {
    name: `preview: ${file.name}`,
  });
  const download = screen.getByRole("button", {
    name: `download: ${file.name}`,
  });
  const remove = screen.getByRole("button", { name: "removeFile" });
  expect(download.parentElement).toBe(remove.parentElement);
  expect(preview.parentElement).toBe(remove.parentElement);
  expect(screen.getByText(file.name).classList.contains("break-all")).toBe(
    true,
  );
  fireEvent.click(remove);
  expect(onRemove).toHaveBeenCalledWith(file.id);

  rerender(<TaskAttachmentList files={[file]} />);
  expect(screen.queryByRole("button", { name: "removeFile" })).toBeNull();
  expect(
    screen.getByRole("button", { name: `preview: ${file.name}` }),
  ).not.toBeNull();
});

test("read-only attachments emphasize the file name and show its format without overflowing", () => {
  const file = {
    id: "long-file" as Id<"courseTaskFiles">,
    name: `${"long-assignment-document-".repeat(8)}.pdf`,
    contentType: "application/pdf",
    size: 100,
  };
  render(<TaskAttachmentList files={[file]} plain />);

  const name = screen.getByText(file.name);
  expect(name.classList.contains("line-clamp-2")).toBe(true);
  expect(name.classList.contains("break-all")).toBe(true);
  expect(name.getAttribute("title")).toBe(file.name);
  expect(screen.getByText("PDF")).not.toBeNull();
  expect(
    screen.getByRole("button", { name: `preview: ${file.name}` }),
  ).not.toBeNull();
  expect(
    screen.getByRole("button", { name: `download: ${file.name}` }),
  ).not.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test.each([
  ["photo.png", "image/png", "img"],
  ["work.pdf", "application/pdf", "iframe"],
])(
  "%s previews through the authenticated request and releases its URL",
  async (name, contentType, element) => {
    const file = {
      id: "file-id" as Id<"courseTaskFiles">,
      name,
      contentType,
      size: 100,
    };
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:task-preview");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    vi.mocked(fetch).mockImplementation(
      async () => new Response(new Blob(["content"], { type: contentType })),
    );
    render(<TaskAttachmentList files={[file]} plain />);

    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `preview: ${name}` }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(getToken).toHaveBeenCalledWith({ template: "convex" });
    expect(vi.mocked(fetch).mock.calls[0][0].toString()).toContain(
      "/course-task-files?id=file-id",
    );
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      headers: { Authorization: "Bearer test-token" },
    });
    const preview =
      element === "iframe"
        ? document.querySelector("iframe")
        : screen.getByRole("img");
    expect(preview?.getAttribute("src")).toBe("blob:task-preview");
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: `download: ${name}`,
        }),
      );
    });
    expect(click).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(revoke).toHaveBeenCalledWith("blob:task-preview"),
    );
  },
);

test("Office files retain download-only behavior", async () => {
  const file = {
    id: "office-id" as Id<"courseTaskFiles">,
    name: "presentation.pptx",
    contentType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    size: 100,
  };
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:office");
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.mocked(fetch).mockResolvedValue(new Response(new Blob(["slides"])));
  render(<TaskAttachmentList files={[file]} plain />);

  expect(
    screen.queryByRole("button", { name: `preview: ${file.name}` }),
  ).toBeNull();
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: `download: ${file.name}` }),
    );
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("a failed preview can be retried without changing the attachment", async () => {
  const file = {
    id: "image-id" as Id<"courseTaskFiles">,
    name: "drawing.webp",
    contentType: "image/webp",
    size: 100,
  };
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:retry-image");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.mocked(fetch)
    .mockRejectedValueOnce(new TypeError("Network error"))
    .mockResolvedValueOnce(
      new Response(new Blob(["image"], { type: "image/webp" })),
    );
  render(<TaskAttachmentList files={[file]} plain />);

  fireEvent.click(
    screen.getByRole("button", { name: `preview: ${file.name}` }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("previewError"),
  );
  fireEvent.click(screen.getByRole("button", { name: "retryPreview" }));
  await waitFor(() =>
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      "blob:retry-image",
    ),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("PDFs fall back to download when the browser has no native viewer", () => {
  vi.stubGlobal("navigator", { ...navigator, pdfViewerEnabled: false });
  const file = {
    id: "pdf-id" as Id<"courseTaskFiles">,
    name: "homework.pdf",
    contentType: "application/pdf",
    size: 100,
  };
  render(<TaskAttachmentList files={[file]} plain />);

  fireEvent.click(
    screen.getByRole("button", { name: `preview: ${file.name}` }),
  );
  expect(screen.getByText("pdfPreviewUnavailable")).not.toBeNull();
  expect(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: `download: ${file.name}`,
    }),
  ).not.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test("closing a loading preview aborts the authenticated request", async () => {
  const file = {
    id: "image-id" as Id<"courseTaskFiles">,
    name: "drawing.jpg",
    contentType: "image/jpeg",
    size: 100,
  };
  vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
  render(<TaskAttachmentList files={[file]} plain />);

  fireEvent.click(
    screen.getByRole("button", { name: `preview: ${file.name}` }),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  expect(signal?.aborted).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(signal?.aborted).toBe(true);
});

test("file upload status shows activity before the first file completes", () => {
  render(<TaskFileUploadStatus completed={0} total={2} />);

  expect(screen.getByRole("status").textContent).toBe("uploadProgress");
  expect(
    screen.getByRole("progressbar").getAttribute("aria-valuenow"),
  ).toBeNull();
});

test("file upload status tracks completed files and shows final saving", () => {
  const { rerender } = render(<TaskFileUploadStatus completed={1} total={2} />);

  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
    "50",
  );

  rerender(<TaskFileUploadStatus completed={2} total={2} />);
  expect(screen.getByRole("status").textContent).toBe("finalizingUpload");
  expect(screen.queryByRole("progressbar")).toBeNull();
});

test("the assignment picker accepts DOCX and PPTX and rejects legacy formats", async () => {
  const onChange = vi.fn();
  const { container } = render(
    <TaskFilePicker files={[]} onChange={onChange} maxFiles={20} />,
  );
  const input = container.querySelector('input[type="file"]')!;
  fireEvent.change(input, {
    target: {
      files: [
        new File(["word"], "essay.docx"),
        new File(["slides"], "presentation.pptx"),
      ],
    },
  });
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  expect(onChange.mock.calls[0][0]).toHaveLength(2);
  fireEvent.change(input, {
    target: { files: [new File(["legacy"], "old.doc")] },
  });
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("invalidFileNamed"),
  );
  expect(onChange).toHaveBeenCalledTimes(1);
});

test("the assignment picker enforces the shared file count before upload", async () => {
  const onChange = vi.fn();
  const { container } = render(
    <TaskFilePicker files={[]} onChange={onChange} maxFiles={2} />,
  );
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: {
      files: [
        new File(["a"], "one.pdf"),
        new File(["b"], "two.pdf"),
        new File(["c"], "three.pdf"),
      ],
    },
  });
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("fileLimits"),
  );
  expect(onChange).not.toHaveBeenCalled();
});
