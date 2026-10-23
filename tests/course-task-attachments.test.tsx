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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  TaskAttachmentList,
  TaskFilePicker,
  TaskFileUploadStatus,
} from "@/components/teaching/classes/course-task-attachments";

const getToken = vi.hoisted(() => vi.fn().mockResolvedValue("test-token"));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "test-campus" }),
}));

vi.mock("@/components/teaching/classes/task-pdf-editor", () => ({
  TaskPdfEditor: ({
    fileId,
    initialEditing,
    onClose,
  }: {
    fileId: string;
    initialEditing?: boolean;
    onClose: () => void;
  }) => (
    <div
      data-testid="pdf-dialog"
      data-file={fileId}
      data-editing={String(initialEditing)}
    >
      <button onClick={onClose}>Close PDF</button>
    </div>
  ),
}));
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ src }: { src: string }) => (
      <div data-testid="pdf-viewer" data-src={src} />
    ),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: (value: number) => String(value) }),
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
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

test.each([
  ["notes.pdf", "application/pdf", "file-text"],
  [
    "essay.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "file-text",
  ],
  ["photo.jpg", "image/jpeg", "image"],
  ["diagram.png", "image/png", "image"],
  ["drawing.webp", "image/webp", "image"],
  [
    "slides.pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "presentation",
  ],
])(
  "%s uses the correct file icon in task attachments",
  (name, contentType, icon) => {
    const file = {
      id: name as Id<"courseTaskFiles">,
      name,
      contentType,
      size: 100,
    };
    const { rerender } = render(<TaskAttachmentList files={[file]} plain />);

    expect(
      screen
        .getByText(name)
        .closest("button")
        ?.querySelector(`.lucide-${icon}`),
    ).not.toBeNull();

    rerender(<TaskAttachmentList files={[file]} onRemove={vi.fn()} />);
    expect(
      screen
        .getByText(name)
        .closest("button")
        ?.querySelector(`.lucide-${icon}`),
    ).not.toBeNull();

    rerender(
      <TaskFilePicker
        files={[new File(["content"], name, { type: contentType })]}
        onChange={vi.fn()}
        maxFiles={20}
      />,
    );
    expect(
      screen.getByText(name).parentElement?.querySelector(`.lucide-${icon}`),
    ).not.toBeNull();
  },
);

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

test("read-only attachments emphasize long file names without repeating their extension", () => {
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
  expect(screen.queryByText("PDF")).toBeNull();
  expect(
    screen.getByRole("button", { name: `preview: ${file.name}` }),
  ).not.toBeNull();
  expect(
    screen.getByRole("button", { name: `download: ${file.name}` }),
  ).not.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test("read-only file cards align the action slot for previewable and download-only files", () => {
  const files = [
    {
      id: "preview-file" as Id<"courseTaskFiles">,
      name: "notes.pdf",
      contentType: "application/pdf",
      size: 100,
    },
    {
      id: "download-file" as Id<"courseTaskFiles">,
      name: "slides.pptx",
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      size: 100,
    },
  ];
  render(<TaskAttachmentList files={files} plain />);

  const previewName = screen.getByRole("button", {
    name: "notes.pdf · preview",
  });
  const preview = screen.getByRole("button", { name: "preview: notes.pdf" });
  const previewDownload = screen.getByRole("button", {
    name: "download: notes.pdf",
  });
  const officeDownload = screen.getByRole("button", {
    name: "download: slides.pptx",
  });
  const previewCard = preview.parentElement;
  const officeCard = officeDownload.parentElement;

  expect(previewCard?.classList.contains("grid")).toBe(true);
  expect(previewCard?.classList.contains("w-full")).toBe(true);
  expect(previewCard?.classList.contains("rounded-xl")).toBe(true);
  expect(officeCard?.className).toBe(previewCard?.className);
  expect(previewName.parentElement).toBe(previewCard);
  expect(officeDownload.classList.contains("col-span-3")).toBe(true);
  expect(preview.querySelector(".lucide-eye")).not.toBeNull();
  expect(officeDownload.querySelector(".lucide-eye")).toBeNull();
  expect(preview.className).toBe(previewDownload.className);
  expect(preview.classList.contains("size-11")).toBe(true);
  expect(preview.getAttribute("data-variant")).toBe(
    previewDownload.getAttribute("data-variant"),
  );
  expect(preview.getAttribute("data-size")).toBe(
    previewDownload.getAttribute("data-size"),
  );
  expect(preview.nextElementSibling).toBe(previewDownload);
  expect(
    officeDownload
      .querySelector(".lucide-download")
      ?.parentElement?.classList.contains("size-11"),
  ).toBe(true);
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
    const previewButton = screen.getByRole("button", {
      name: `preview: ${name}`,
    });
    fireEvent.click(previewButton.querySelector(".lucide-eye")!);
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

test.each([false, true])(
  "Office files retain download-only behavior in compact=%s",
  async (compact) => {
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
    render(<TaskAttachmentList files={[file]} plain compact={compact} />);

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
  },
);

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

test("only current teacher PDFs expose a correction button that opens the shared dialog directly in edit mode", () => {
  const files = [
    {
      id: "pdf" as Id<"courseTaskFiles">,
      name: "work.pdf",
      contentType: "application/pdf",
      size: 10,
    },
    {
      id: "image" as Id<"courseTaskFiles">,
      name: "photo.png",
      contentType: "image/png",
      size: 10,
    },
  ];
  const view = render(
    <TaskAttachmentList files={files} plain submission editPdfs />,
  );
  const edit = screen.getByRole("button", {
    name: "pdfCorrection.edit: work.pdf",
  });
  const name = screen.getByRole("button", { name: "work.pdf · preview" });
  expect(within(name.parentElement!).getAllByRole("button")).toHaveLength(2);
  expect(
    screen.queryByRole("button", { name: "preview: work.pdf" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "download: work.pdf" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "preview: photo.png" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "download: photo.png" }),
  ).toBeTruthy();
  fireEvent.click(edit);
  expect(screen.getByTestId("pdf-dialog").getAttribute("data-editing")).toBe(
    "true",
  );
  expect(screen.getByTestId("pdf-dialog").getAttribute("data-file")).toBe(
    "pdf",
  );
  expect(
    screen.queryByRole("button", { name: "pdfCorrection.edit: photo.png" }),
  ).toBeNull();
  fireEvent.click(screen.getByText("Close PDF"));
  view.rerender(<TaskAttachmentList files={files} plain submission />);
  expect(
    screen.queryByRole("button", { name: "pdfCorrection.edit: work.pdf" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "preview: work.pdf" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "download: work.pdf" }),
  ).toBeTruthy();
});

test("an open submission preview reloads a replaced binary and closes when the file is removed", async () => {
  const file = {
    id: "file" as Id<"courseTaskFiles">,
    name: "work.pdf",
    contentType: "application/pdf",
    size: 10,
    version: "original",
  };
  vi.spyOn(URL, "createObjectURL")
    .mockReturnValueOnce("blob:original")
    .mockReturnValueOnce("blob:corrected");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.mocked(fetch).mockResolvedValue(new Response(new Blob(["%PDF-1.4"])));
  const view = render(<TaskAttachmentList files={[file]} plain submission />);
  fireEvent.click(screen.getByRole("button", { name: "preview: work.pdf" }));
  await waitFor(() =>
    expect(screen.getByTestId("pdf-viewer").getAttribute("data-src")).toBe(
      "blob:original",
    ),
  );
  vi.mocked(fetch).mockResolvedValue(
    new Response(new Blob(["%PDF-1.4 corrected"])),
  );
  view.rerender(
    <TaskAttachmentList
      files={[{ ...file, version: "corrected" }]}
      plain
      submission
    />,
  );
  await waitFor(() =>
    expect(screen.getByTestId("pdf-viewer").getAttribute("data-src")).toBe(
      "blob:corrected",
    ),
  );
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:original");
  view.rerender(<TaskAttachmentList files={[]} plain submission />);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("preview and direct correction open the same dialog in their respective modes", () => {
  const files = [
    {
      id: "pdf" as Id<"courseTaskFiles">,
      name: "work.pdf",
      contentType: "application/pdf",
      size: 10,
    },
  ];
  const view = render(
    <TaskAttachmentList files={files} plain submission editPdfs />,
  );
  fireEvent.click(screen.getByRole("button", { name: "work.pdf · preview" }));
  expect(screen.getByTestId("pdf-dialog").getAttribute("data-editing")).toBe(
    "false",
  );
  fireEvent.click(screen.getByText("Close PDF"));
  fireEvent.click(
    screen.getByRole("button", { name: "pdfCorrection.edit: work.pdf" }),
  );
  expect(screen.getByTestId("pdf-dialog").getAttribute("data-editing")).toBe(
    "true",
  );
  view.rerender(<TaskAttachmentList files={[]} plain submission editPdfs />);
  expect(screen.getByTestId("pdf-dialog")).toBeTruthy();
});

test.each([
  ["answer.pdf", "application/pdf"],
  ["photo.png", "image/png"],
])(
  "compact student files expose preview and download consistently, keeping downloading inside the viewer: %s",
  async (name, contentType) => {
    const file = {
      id: "file" as Id<"courseTaskFiles">,
      name,
      contentType,
      size: 100,
      correctedAt: contentType === "application/pdf" ? 1_000 : undefined,
    };
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:student-file");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickDownload = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(
        new Response(new Blob(["content"], { type: contentType })),
      ),
    );
    render(<TaskAttachmentList files={[file]} plain submission compact />);
    const preview = screen.getByRole("button", { name: `${name} · preview` });
    expect(screen.getAllByRole("button")).toHaveLength(3);
    const previewIcon = screen.getByRole("button", {
      name: `preview: ${name}`,
    });
    const downloadIcon = screen.getByRole("button", {
      name: `download: ${name}`,
    });
    expect(previewIcon.nextElementSibling).toBe(downloadIcon);
    expect(previewIcon.classList.contains("size-11")).toBe(true);
    expect(downloadIcon.classList.contains("size-11")).toBe(true);
    if (contentType === "application/pdf")
      expect(screen.getByText("correctedAt")).toBeTruthy();
    fireEvent.click(contentType === "application/pdf" ? preview : previewIcon);
    const dialog = await screen.findByRole("dialog", { name });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(
      within(dialog).getByRole("button", { name: `download: ${name}` }),
    );
    await waitFor(() => expect(clickDownload).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("button", { name: /^pdfCorrection.edit/ }),
    ).toBeNull();
  },
);

test("compact files can download directly without opening a preview", async () => {
  const file = {
    id: "pdf" as Id<"courseTaskFiles">,
    name: "work.pdf",
    contentType: "application/pdf",
    size: 100,
  };
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:direct-download");
  const clickDownload = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  vi.mocked(fetch).mockResolvedValue(new Response(new Blob(["%PDF-1.4"])));
  render(<TaskAttachmentList files={[file]} plain submission compact />);
  fireEvent.click(screen.getByRole("button", { name: "download: work.pdf" }));
  await waitFor(() => expect(clickDownload).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("file action help appears on keyboard focus and Escape dismisses only the tooltip", async () => {
  const onOpenChange = vi.fn();
  const file = {
    id: "pdf" as Id<"courseTaskFiles">,
    name: "work.pdf",
    contentType: "application/pdf",
    size: 100,
  };
  render(
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined}>
        <SheetTitle>Review</SheetTitle>
        <TaskAttachmentList files={[file]} plain submission compact />
      </SheetContent>
    </Sheet>,
  );
  const preview = screen.getByRole("button", { name: "preview: work.pdf" });
  act(() => preview.focus());
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip.textContent).toBe("preview");
  fireEvent.keyDown(preview, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  expect(screen.getByRole("dialog", { name: "Review" })).toBeTruthy();
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
