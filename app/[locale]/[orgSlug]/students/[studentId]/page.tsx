import StudentHubPage from "@/components/dashboards/student-hub-page";

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;

  return <StudentHubPage studentId={studentId} />;
}
