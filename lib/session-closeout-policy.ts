export interface SessionCloseoutSubmissionInput {
  closureStatus?: "pending" | "completed";
  canClose: boolean;
  selectedLessonCount: number;
  isAttendanceComplete: boolean;
}

export function getSessionCloseoutSubmission(
  input: SessionCloseoutSubmissionInput,
) {
  const isReportSaved = input.closureStatus === "completed";
  return {
    canSubmit:
      isReportSaved ||
      (input.canClose &&
        input.selectedLessonCount > 0 &&
        input.isAttendanceComplete),
    shouldSaveReport: !isReportSaved,
  };
}
