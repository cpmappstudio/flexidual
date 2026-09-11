import { ClassroomRecordingPreview } from "@/components/classroom/classroom-recording-preview";
import { notFound } from "next/navigation";

const PREVIEW_SCENES = new Set(["presenter", "screen-share", "whiteboard"]);
const PREVIEW_STUDENT_COUNTS = new Set([0, 1, 4, 8, 10]);

interface RecordingPreviewPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RecordingPreviewPage({
  searchParams,
}: RecordingPreviewPageProps) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = await searchParams;
  const requestedScene =
    typeof params.scene === "string" ? params.scene : undefined;
  const requestedStudentCount =
    typeof params.students === "string" ? Number(params.students) : undefined;

  return (
    <ClassroomRecordingPreview
      initialScene={
        requestedScene && PREVIEW_SCENES.has(requestedScene)
          ? (requestedScene as "presenter" | "screen-share" | "whiteboard")
          : undefined
      }
      initialStudentCount={
        requestedStudentCount !== undefined &&
        PREVIEW_STUDENT_COUNTS.has(requestedStudentCount)
          ? requestedStudentCount
          : undefined
      }
      initialTeacherVideoOn={params.camera !== "off"}
    />
  );
}
