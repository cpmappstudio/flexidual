"use client";

import dynamic from "next/dynamic";

const AdminDashboard = dynamic(() => import("./admin-dashboard"));
const StudentHubPage = dynamic(() => import("./student-hub-page"));

export function RoleDashboard({ student }: { student: boolean }) {
  return student ? <StudentHubPage /> : <AdminDashboard />;
}
