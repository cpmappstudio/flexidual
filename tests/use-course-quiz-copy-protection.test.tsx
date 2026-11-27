import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { useCourseQuizCopyProtection } from "@/hooks/use-course-quiz-copy-protection";

function Example({ enabled = true, show = true }) {
  const ref = useCourseQuizCopyProtection<HTMLDivElement>(enabled);
  return (
    <>
      <p>Contenido externo</p>
      {show && (
        <div ref={ref}>
          <p>Pregunta protegida</p>
          <span>Opción protegida</span>
          <textarea aria-label="Respuesta" defaultValue="Mi respuesta" />
        </div>
      )}
    </>
  );
}
function select(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
}
afterEach(() => {
  window.getSelection()?.removeAllRanges();
  cleanup();
});

test.each(["Pregunta protegida", "Opción protegida"])(
  "blocks document-level copying of protected text: %s",
  (text) => {
    render(<Example />);
    select(screen.getByText(text));
    expect(fireEvent.copy(document)).toBe(false);
  },
);

test("blocks a page-wide selection containing quiz content", () => {
  render(<Example />);
  select(document.body);
  expect(fireEvent.copy(document.body)).toBe(false);
});

test("allows copying unrelated text and copying without a selection", () => {
  render(<Example />);
  select(screen.getByText("Contenido externo"));
  expect(fireEvent.copy(document.body)).toBe(true);
  window.getSelection()!.removeAllRanges();
  expect(fireEvent.copy(document)).toBe(true);
});

test("keeps editing and copying the student's written response available", () => {
  render(<Example />);
  select(screen.getByText("Pregunta protegida"));
  const input = screen.getByRole<HTMLTextAreaElement>("textbox");
  input.focus();
  input.select();
  expect(fireEvent.copy(input)).toBe(true);
  expect(fireEvent.cut(input)).toBe(true);
  expect(fireEvent.paste(input)).toBe(true);
  fireEvent.change(input, { target: { value: "Respuesta editada" } });
  expect(input.value).toBe("Respuesta editada");
});

test("teacher content is copyable and changing audience removes the restriction", () => {
  const s = render(<Example />);
  select(screen.getByText("Pregunta protegida"));
  expect(fireEvent.copy(document)).toBe(false);
  s.rerender(<Example enabled={false} />);
  select(screen.getByText("Pregunta protegida"));
  expect(fireEvent.copy(document)).toBe(true);
});

test("protects content mounted after the initial screen", () => {
  const s = render(<Example show={false} />);
  s.rerender(<Example show />);
  select(screen.getByText("Pregunta protegida"));
  expect(fireEvent.copy(document)).toBe(false);
});
