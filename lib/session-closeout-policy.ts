export interface SessionCloseoutSubmissionInput {
  closureStatus?: "pending" | "completed";
  canClose: boolean;
  isAttendanceComplete: boolean;
}

export function getSessionCloseoutSubmission(
  input: SessionCloseoutSubmissionInput,
) {
  const isReportSaved = input.closureStatus === "completed";
  return {
    canSubmit: isReportSaved || (input.canClose && input.isAttendanceComplete),
    shouldSaveReport: !isReportSaved,
  };
}
