"use client";

import * as React from "react";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
  FileText,
  Upload,

  Video,
  MonitorPlay
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TeacherDialog } from "@/components/teaching/upload-lesson-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Helper for navigation
function useLaunchClass() {
  const router = useRouter();
  const locale = useLocale();

  return (curriculumCode: string | undefined, curriculumId: string, groupCode?: string) => {
    // Construct room name: CODE-GROUP (Default to 'A' if no group)
    const code = curriculumCode || curriculumId;
    const group = groupCode || 'A';
    const roomName = `${code}-${group}`;
    
    router.push(`/${locale}/classroom/${encodeURIComponent(roomName)}`);
  };
}

// Componente de tabla de lecciones para cada curriculum
function LessonsTable({ teacherId }: { teacherId: string }) {
  const [expandedCurriculum, setExpandedCurriculum] = useState<string | null>(null);
  const [selectedGradeByCurriculum, setSelectedGradeByCurriculum] = useState<Record<string, string>>({});
  const [expandedQuarter, setExpandedQuarter] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  
  const launchClass = useLaunchClass(); // Custom hook for launch logic

  // Obtener progreso detallado del profesor
  const assignmentsWithProgress = useQuery(
    api.progress.getTeacherAssignmentsWithProgress,
    { teacherId: teacherId as Id<"users">, isActive: true }
  );

  // Expandir el primer curriculum y primer quarter por defecto
  React.useEffect(() => {
    if (!hasInitialized && assignmentsWithProgress && assignmentsWithProgress.length > 0) {
      const firstAssignment = assignmentsWithProgress[0];
      setExpandedCurriculum(firstAssignment._id);

      // Inicializar el primer grade para cada curriculum
      const initialGrades: Record<string, string> = {};
      assignmentsWithProgress.forEach(assignment => {
        const firstGrade = assignment.assignedGrades?.[0];
        if (firstGrade) {
          initialGrades[assignment._id] = firstGrade;
        }
      });
      setSelectedGradeByCurriculum(initialGrades);

      setExpandedQuarter(`${firstAssignment._id}-Q1`);
      setHasInitialized(true);
    }
  }, [assignmentsWithProgress, hasInitialized]);

  // Avoid unused variable warning
  React.useEffect(() => {
    // progressByQuarter is part of assignment data structure
    void assignmentsWithProgress;
  }, [assignmentsWithProgress]);

  // Obtener lecciones detalladas cuando se expande un currículum
  const selectedAssignment = assignmentsWithProgress?.find(a => a._id === expandedCurriculum);
  const assignmentLessonProgress = useQuery(
    api.progress.getAssignmentLessonProgress,
    selectedAssignment ? { assignmentId: selectedAssignment._id } : "skip"
  );

  if (!assignmentsWithProgress) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">Loading your courses...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (assignmentsWithProgress.length === 0) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              No courses assigned yet. Please contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "in_progress":
        return "In Progress";
      case "not_started":
        return "Pending";
      default:
        return "Pending";
    }
  };

  return (
    <div className="space-y-6">
      {assignmentsWithProgress.map((assignment) => {
        const totalProgress = assignment.progressSummary?.progressPercentage || 0;
        const isExpanded = expandedCurriculum === assignment._id;
        const lessons = isExpanded && assignmentLessonProgress ? assignmentLessonProgress.lessons : [];
        const assignedGroups = assignmentLessonProgress?.assignedGroupCodes || [];

        return (
          <Card key={assignment._id} className="border-border/60 bg-card shadow-sm hover:shadow-md transition-shadow py-0">
            <Collapsible
              open={isExpanded}
              onOpenChange={() =>
                setExpandedCurriculum(
                  isExpanded ? null : assignment._id,
                )
              }
            >
              <div className="flex items-center w-full pr-4">
                <CollapsibleTrigger asChild className="flex-1">
                  <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-3 px-2 sm:py-5 sm:px-6">
                    <div className="flex items-center justify-between gap-2 sm:gap-4">
                      <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                        <div className="bg-blue-100 p-1.5 sm:p-3 rounded-lg flex-shrink-0">
                          <BookOpen className="w-4 h-4 sm:w-6 sm:h-6 text-blue-900" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 mb-1.5 sm:mb-2">
                            <CardTitle className="text-sm sm:text-lg font-semibold text-foreground truncate">
                              {assignment.curriculumName}
                            </CardTitle>
                            {assignment.curriculumCode && (
                              <Badge variant="secondary" className="text-xs w-fit">{assignment.curriculumCode}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 sm:gap-4 max-w-xs">
                            <Progress value={totalProgress} className="bg-gray-200 [&>div]:bg-deep-koamaru flex-1 h-2" />
                            <span className="text-xs sm:text-sm font-medium text-muted-foreground">{totalProgress}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                {/* === LAUNCH BUTTON AREA === */}
                <div className="flex items-center gap-3">
                  {assignedGroups.length > 1 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white shadow-sm gap-2">
                          <Video className="w-4 h-4" />
                          <span className="hidden sm:inline">Launch Class</span>
                          <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {assignedGroups.map((group: string) => (
                          <DropdownMenuItem 
                            key={group}
                            onClick={(e) => {
                                e.stopPropagation();
                                const groupSuffix = group.includes('-') ? group.split('-')[1] : group;
                                launchClass(assignment.curriculumCode, assignment.curriculumId, groupSuffix);
                            }}
                          >
                            <MonitorPlay className="w-4 h-4 mr-2" />
                            Launch Group {group}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Button 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        // If single group, try to extract group code or default to 'A'
                        const group = assignedGroups[0] ? (assignedGroups[0].includes('-') ? assignedGroups[0].split('-')[1] : assignedGroups[0]) : 'A';
                        launchClass(assignment.curriculumCode, assignment.curriculumId, group);
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white shadow-sm gap-2"
                    >
                      <Video className="w-4 h-4" />
                      <span className="hidden sm:inline">Launch Class</span>
                    </Button>
                  )}

                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>

              <CollapsibleContent>
                <CardContent className="py-3 px-2 sm:py-5 sm:px-6">
                  <div className="border-t border-border/60 pt-2 sm:pt-6">
                    {/* Grade Tabs - Only show if teacher has multiple grades assigned */}
                    {assignment.assignedGrades && assignment.assignedGrades.length > 1 && (
                      <Tabs
                        value={selectedGradeByCurriculum[assignment._id] || assignment.assignedGrades[0]}
                        onValueChange={(value) => {
                          setSelectedGradeByCurriculum(prev => ({
                            ...prev,
                            [assignment._id]: value
                          }));
                        }}
                        className="mb-3 sm:mb-6"
                      >
                        <TabsList>
                          {assignment.assignedGrades.map((gradeCode) => {
                            // Get grade name from campus data if available
                            const gradeName = assignmentLessonProgress?.grades?.find(
                              (g: { id: string; name: string; code: string; level: number }) => g.code === gradeCode
                            )?.name || gradeCode;

                            return (
                              <TabsTrigger key={gradeCode} value={gradeCode}>
                                {gradeName}
                              </TabsTrigger>
                            );
                          })}
                        </TabsList>
                      </Tabs>
                    )}

                    {/* Quarters Timeline */}
                    <div className="grid grid-cols-4 gap-2 sm:gap-6 mb-3 sm:mb-6">
                      {[1, 2, 3, 4].slice(0, assignment.numberOfQuarters).map((quarterNum) => {
                        // Get selected grade
                        const selectedGrade = selectedGradeByCurriculum[assignment._id] || assignment.assignedGrades?.[0];

                        // Filter lessons for this quarter and grade
                        const lessonsInQuarter = lessons.filter((l: Record<string, unknown>) => {
                          if (l.quarter !== quarterNum) return false;

                          // If teacher has multiple grades, filter by selected grade
                          if (assignment.assignedGrades && assignment.assignedGrades.length > 1 && selectedGrade) {
                            if (l.gradeCodes && Array.isArray(l.gradeCodes) && l.gradeCodes.length > 0) {
                              return (l.gradeCodes as string[]).includes(selectedGrade);
                            }
                            if (l.gradeCode) {
                              return l.gradeCode === selectedGrade;
                            }
                          }

                          return true;
                        });

                        // Calculate progress based on filtered lessons with incremental completion
                        const total = lessonsInQuarter.length;
                        let totalCompletionScore = 0;

                        // Sum up the completion percentage of each lesson
                        lessonsInQuarter.forEach((l: Record<string, unknown>) => {
                          const multipleGrades = assignment.assignedGrades && assignment.assignedGrades.length > 1;

                          if (multipleGrades && selectedGrade && assignmentLessonProgress?.assignedGroupCodes) {
                            // Filter groups for selected grade
                            const groupsForSelectedGrade = assignmentLessonProgress.assignedGroupCodes.filter(
                              (groupCode: string) => groupCode.startsWith(selectedGrade + "-")
                            );

                            // Count completed groups for this grade
                            const completedGroupsForGrade = Array.isArray(l.progressByGrade)
                              ? l.progressByGrade.filter((p: Record<string, unknown>) =>
                                groupsForSelectedGrade.includes(p.groupCode as string || '') &&
                                (p.evidenceDocumentStorageId || p.evidencePhotoStorageId)
                              ).length
                              : 0;

                            // Calculate percentage for this lesson
                            const lessonCompletionPercentage = groupsForSelectedGrade.length > 0
                              ? (completedGroupsForGrade / groupsForSelectedGrade.length) * 100
                              : 0;

                            totalCompletionScore += lessonCompletionPercentage;
                          } else {
                            // Use overall completion percentage from backend
                            totalCompletionScore += (typeof l.completionPercentage === 'number' ? l.completionPercentage : 0);
                          }
                        });

                        // Average completion across all lessons in quarter
                        const quarterProgress = total > 0
                          ? Math.round(totalCompletionScore / total)
                          : 0;
                        const quarterKey = `${assignment._id}-Q${quarterNum}`;
                        const isQuarterExpanded = expandedQuarter === quarterKey;

                        return (
                          <Card
                            key={quarterNum}
                            className={`cursor-pointer py-0 border-border/60 shadow-sm hover:shadow-md transition-all ${isQuarterExpanded
                              ? "bg-deep-koamaru text-white border-deep-koamaru"
                              : "bg-card hover:bg-accent/50"
                              }`}
                            onClick={() =>
                              setExpandedQuarter(
                                isQuarterExpanded ? null : quarterKey,
                              )
                            }
                          >
                            <CardHeader className="py-2 px-2 sm:p-4">
                              <div className="text-center mb-1">
                                <CardTitle className="text-xs sm:text-base font-semibold">
                                  Q{quarterNum}
                                </CardTitle>
                              </div>
                              <Progress
                                value={quarterProgress}
                                className={`mb-1 h-1 sm:h-2 ${isQuarterExpanded
                                  ? "bg-white/20 [&>div]:bg-white"
                                  : quarterProgress === 100
                                    ? "bg-gray-200 [&>div]:bg-green-700"
                                    : "bg-gray-200 [&>div]:bg-deep-koamaru"
                                  }`}
                              />
                              <CardDescription className={`text-center text-[9px] sm:text-xs ${isQuarterExpanded ? "text-white/90" : "text-muted-foreground"
                                }`}>
                                {total} lesson{total !== 1 ? 's' : ''}
                              </CardDescription>
                            </CardHeader>
                          </Card>
                        );
                      })}
                    </div>

                    {/* Lessons List */}
                    {!assignmentLessonProgress && isExpanded && (
                      <p className="text-center text-muted-foreground py-4">Loading lessons...</p>
                    )}

                    {[1, 2, 3, 4].slice(0, assignment.numberOfQuarters).map((quarterNum) => {
                      const quarterKey = `${assignment._id}-Q${quarterNum}`;
                      if (expandedQuarter !== quarterKey) return null;

                      // Get selected grade for this curriculum
                      const selectedGrade = selectedGradeByCurriculum[assignment._id] || assignment.assignedGrades?.[0];

                      // Filter lessons by quarter and selected grade
                      const lessonsByQuarter = lessons.filter((l: Record<string, unknown>) => {
                        if (l.quarter !== quarterNum) return false;

                        // If teacher has multiple grades, filter by selected grade
                        if (assignment.assignedGrades && assignment.assignedGrades.length > 1 && selectedGrade) {
                          // Check if lesson applies to the selected grade
                          if (l.gradeCodes && Array.isArray(l.gradeCodes) && l.gradeCodes.length > 0) {
                            return (l.gradeCodes as string[]).includes(selectedGrade);
                          }
                          // Legacy single grade support
                          if (l.gradeCode) {
                            return l.gradeCode === selectedGrade;
                          }
                        }

                        return true;
                      });

                      return (
                        <Card key={quarterNum} className="bg-accent/20  py-0 shadow-sm ">
                          {/* <CardHeader className="py-3 px-2 sm:py-4 sm:px-3">
                            <CardTitle className="text-sm sm:text-lg font-semibold flex items-center flex-wrap gap-2">
                              <Badge className="bg-deep-koamaru text-xs sm:text-sm">Q{quarterNum}</Badge>
                              <span className="text-xs sm:text-base">Lessons</span>
                            </CardTitle>
                          </CardHeader> */}
                          <CardContent className="py-0 rounded-none pb-3 px-0 sm:pb-6">
                            {lessonsByQuarter.length === 0 ? (
                              <p className="text-center text-muted-foreground py-6 sm:py-8 text-xs sm:text-sm">
                                No lessons in this quarter
                              </p>
                            ) : (
                              <div className="space-y-2 sm:space-y-3">
                                {lessonsByQuarter.map((lessonData) => (
                                  <Card
                                    key={lessonData.lessonId}
                                    className="border-border/60 bg-card mx-0 rounded-none shadow-sm py-0"
                                  >
                                    <CardContent className="py-3 px-2 sm:py-4 sm:px-4">
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                                        <div
                                          className="flex items-start sm:items-center gap-2 sm:gap-4 flex-1 min-w-0"
                                        >
                                          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                                            <Badge
                                              variant="secondary"
                                              className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-sm"
                                            >
                                              {lessonData.orderInQuarter}
                                            </Badge>
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <h4 className="font-medium text-xs sm:text-base text-foreground truncate">
                                                {lessonData.title}
                                              </h4>
                                              {lessonData.totalGrades > 1 && (
                                                <Badge
                                                  variant={lessonData.completionPercentage === 100 ? "default" : lessonData.completionPercentage > 0 ? "secondary" : "outline"}
                                                  className="text-[9px] sm:text-xs"
                                                >
                                                  {lessonData.completionPercentage}%
                                                </Badge>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1 flex-wrap">
                                              <p className="text-[10px] sm:text-sm text-bold">
                                                {getStatusText(lessonData.overallStatus || lessonData.progress?.status || "not_started")}
                                              </p>
                                              {/* Show groups for the selected grade */}
                                              {assignmentLessonProgress?.assignedGroupCodes && (
                                                <div className="flex items-center gap-1 flex-wrap">
                                                  {(() => {
                                                    // Get selected grade
                                                    const selectedGrade = selectedGradeByCurriculum[assignment._id] || assignment.assignedGrades?.[0];

                                                    // Filter groups that belong to the selected grade
                                                    const groupsForSelectedGrade = assignmentLessonProgress.assignedGroupCodes.filter(
                                                      (groupCode: string) => groupCode.startsWith(selectedGrade + "-")
                                                    );

                                                    return groupsForSelectedGrade.map((groupCode: string) => {
                                                      // Extract group number from code (e.g., "01-1" -> "1")
                                                      const groupNumber = groupCode.split('-')[1];

                                                      // Check if this group has evidence
                                                      const hasEvidence = lessonData.progressByGrade?.find((p: Record<string, unknown>) =>
                                                        p.groupCode === groupCode && (p.evidenceDocumentStorageId || p.evidencePhotoStorageId)
                                                      );

                                                      return (
                                                        <Badge
                                                          key={groupCode}
                                                          variant={hasEvidence ? "default" : "outline"}
                                                          className={`text-[9px] sm:text-xs h-4 sm:h-5 px-1 sm:px-1.5 ${hasEvidence 
                                                            ? "bg-green-700 hover:bg-green-700 text-white border-green-700" 
                                                            : "bg-red-200 hover:bg-red-200 text-red-900 border-red-300"}`}
                                                        >
                                                          Group {groupNumber}
                                                          {hasEvidence && " ✓"}
                                                        </Badge>
                                                      );
                                                    });
                                                  })()}
                                                </div>
                                              )}
                                            </div>
                                            {/* Lesson description */}
                                            {lessonData.description && (
                                              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2 line-clamp-2">
                                                {lessonData.description}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 pl-8 sm:pl-0">
                                          <div className="flex items-center gap-1 sm:gap-2 text-muted-foreground">
                                            <FileText className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                                            <span className="text-[10px] sm:text-sm font-medium whitespace-nowrap">
                                              {(() => {
                                                if (!assignmentLessonProgress?.assignedGroupCodes) {
                                                  return lessonData.progress?.evidencePhotoStorageId || lessonData.progress?.evidenceDocumentStorageId
                                                    ? 'Evidence uploaded'
                                                    : 'No evidence';
                                                }

                                                // Get selected grade
                                                const selectedGrade = selectedGradeByCurriculum[assignment._id] || assignment.assignedGrades?.[0];

                                                // Filter groups for selected grade
                                                const groupsForSelectedGrade = assignmentLessonProgress.assignedGroupCodes.filter(
                                                  (groupCode: string) => groupCode.startsWith(selectedGrade + "-")
                                                );

                                                // Count evidence for these groups
                                                const evidenceCount = Array.isArray(lessonData.progressByGrade)
                                                  ? lessonData.progressByGrade.filter((p: Record<string, unknown>) =>
                                                    groupsForSelectedGrade.includes(p.groupCode as string || '') && (p.evidenceDocumentStorageId || p.evidencePhotoStorageId)
                                                  ).length
                                                  : 0;

                                                return evidenceCount > 0
                                                  ? `${evidenceCount}/${groupsForSelectedGrade.length} evidence`
                                                  : 'No evidence';
                                              })()}
                                            </span>
                                          </div>
                                          <TeacherDialog
                                            lesson={{
                                              id: lessonData.lessonId,
                                              title: lessonData.title
                                            }}
                                            assignmentId={assignment._id}
                                            selectedGrade={selectedGrade}
                                            trigger={
                                              <Button size="sm" className="bg-deep-koamaru hover:bg-deep-koamaru/90 h-7 sm:h-9 text-[10px] sm:text-sm px-2 sm:px-3">
                                                <Upload className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                                                <span className="hidden sm:inline">Attach</span>
                                              </Button>
                                            }
                                          />
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}


export default function TeachingPage() {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">My Courses</h2>
            <p className="text-muted-foreground mt-1">
              View your assigned curriculums and lessons
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">My Courses</h2>
            <p className="text-muted-foreground mt-1">
              View your assigned curriculums and lessons
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              Please sign in to view your courses.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">My Courses</h2>
          <p className="text-muted-foreground mt-1">
            Manage curriculums and launch live classrooms.
          </p>
        </div>
      </div>

      <LessonsTable teacherId={user._id} />
    </div>
  );
}

