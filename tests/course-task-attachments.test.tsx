import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import {
  TaskAttachmentList,
  TaskFilePicker,
  TaskFileUploadStatus,
} from "@/components/teaching/classes/course-task-attachments";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(() => cleanup());

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

test("existing attachments share a row for download and remove in the editor", () => {
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

  const download = screen.getByRole("button", {
    name: `download: ${file.name}`,
  });
  const remove = screen.getByRole("button", { name: "removeFile" });
  expect(download.parentElement).toBe(remove.parentElement);
  expect(screen.getByText(file.name).classList.contains("break-all")).toBe(
    true,
  );
  fireEvent.click(remove);
  expect(onRemove).toHaveBeenCalledWith(file.id);

  rerender(<TaskAttachmentList files={[file]} />);
  expect(screen.queryByRole("button", { name: "removeFile" })).toBeNull();
  expect(
    screen.getByRole("button", { name: `download: ${file.name}` }),
  ).not.toBeNull();
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
