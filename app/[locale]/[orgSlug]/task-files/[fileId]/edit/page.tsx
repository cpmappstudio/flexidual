import { TaskPdfEditor } from "@/components/teaching/classes/task-pdf-editor";

export default async function TaskPdfEditorPage({
  params,
}: {
  params: Promise<{ fileId: string }>;
}) {
  const { fileId } = await params;
  return <TaskPdfEditor key={fileId} fileId={fileId} />;
}
