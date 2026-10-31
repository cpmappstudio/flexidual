/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as abeka from "../abeka.js";
import type * as abekaActions from "../abekaActions.js";
import type * as abekaCatalog from "../abekaCatalog.js";
import type * as abekaCurriculumLinks from "../abekaCurriculumLinks.js";
import type * as abekaHttp from "../abekaHttp.js";
import type * as abekaSync from "../abekaSync.js";
import type * as abekaWorkflow from "../abekaWorkflow.js";
import type * as academicSettings from "../academicSettings.js";
import type * as broadcasts from "../broadcasts.js";
import type * as calendar from "../calendar.js";
import type * as calendarClosures from "../calendarClosures.js";
import type * as campuses from "../campuses.js";
import type * as classSessionVideoStorage from "../classSessionVideoStorage.js";
import type * as classSessionVideos from "../classSessionVideos.js";
import type * as classes from "../classes.js";
import type * as courseChatAttachmentHttp from "../courseChatAttachmentHttp.js";
import type * as courseChatAttachments from "../courseChatAttachments.js";
import type * as courseChatMessages from "../courseChatMessages.js";
import type * as courseChatNotifications from "../courseChatNotifications.js";
import type * as courseNotebook from "../courseNotebook.js";
import type * as courseNotebookFiles from "../courseNotebookFiles.js";
import type * as courseTaskCorrections from "../courseTaskCorrections.js";
import type * as courseTaskFileHttp from "../courseTaskFileHttp.js";
import type * as courseTaskFiles from "../courseTaskFiles.js";
import type * as courseTaskReminders from "../courseTaskReminders.js";
import type * as courseTaskSubmissions from "../courseTaskSubmissions.js";
import type * as courseTasks from "../courseTasks.js";
import type * as crons from "../crons.js";
import type * as curriculums from "../curriculums.js";
import type * as eventChangeNotifications from "../eventChangeNotifications.js";
import type * as eventChatAttachmentHttp from "../eventChatAttachmentHttp.js";
import type * as eventChatAttachments from "../eventChatAttachments.js";
import type * as eventChatContext from "../eventChatContext.js";
import type * as eventChatMessages from "../eventChatMessages.js";
import type * as eventChatNotifications from "../eventChatNotifications.js";
import type * as eventRecordingCleanup from "../eventRecordingCleanup.js";
import type * as eventRoom from "../eventRoom.js";
import type * as events from "../events.js";
import type * as grades from "../grades.js";
import type * as http from "../http.js";
import type * as lessons from "../lessons.js";
import type * as liveRoomLifecycle from "../liveRoomLifecycle.js";
import type * as livekit from "../livekit.js";
import type * as migration from "../migration.js";
import type * as model_abekaAccess from "../model/abekaAccess.js";
import type * as model_abekaProgressHistory from "../model/abekaProgressHistory.js";
import type * as model_abekaScheduling from "../model/abekaScheduling.js";
import type * as model_abekaStudentProgress from "../model/abekaStudentProgress.js";
import type * as model_abekaTransport from "../model/abekaTransport.js";
import type * as model_abekaValidators from "../model/abekaValidators.js";
import type * as model_broadcastAccess from "../model/broadcastAccess.js";
import type * as model_broadcastRateLimits from "../model/broadcastRateLimits.js";
import type * as model_calendarClosures from "../model/calendarClosures.js";
import type * as model_catalog from "../model/catalog.js";
import type * as model_chatAttachmentLimits from "../model/chatAttachmentLimits.js";
import type * as model_chatNotification from "../model/chatNotification.js";
import type * as model_chatSource from "../model/chatSource.js";
import type * as model_chatTarget from "../model/chatTarget.js";
import type * as model_classCancellationEvents from "../model/classCancellationEvents.js";
import type * as model_classSessionVideoFields from "../model/classSessionVideoFields.js";
import type * as model_classSessionVideos from "../model/classSessionVideos.js";
import type * as model_classType from "../model/classType.js";
import type * as model_courseAssignments from "../model/courseAssignments.js";
import type * as model_courseChatAccess from "../model/courseChatAccess.js";
import type * as model_courseChatAttachments from "../model/courseChatAttachments.js";
import type * as model_courseChatEvents from "../model/courseChatEvents.js";
import type * as model_courseNotebookAccess from "../model/courseNotebookAccess.js";
import type * as model_courseProgress from "../model/courseProgress.js";
import type * as model_courseSchedule from "../model/courseSchedule.js";
import type * as model_courseScheduleShares from "../model/courseScheduleShares.js";
import type * as model_courseTaskAccess from "../model/courseTaskAccess.js";
import type * as model_courseTaskFiles from "../model/courseTaskFiles.js";
import type * as model_courseTaskPublication from "../model/courseTaskPublication.js";
import type * as model_courseTaskRecipients from "../model/courseTaskRecipients.js";
import type * as model_courseTaskReminders from "../model/courseTaskReminders.js";
import type * as model_courseTaskUploadBody from "../model/courseTaskUploadBody.js";
import type * as model_curriculumIcons from "../model/curriculumIcons.js";
import type * as model_enrollments from "../model/enrollments.js";
import type * as model_eventAccess from "../model/eventAccess.js";
import type * as model_eventChatAccess from "../model/eventChatAccess.js";
import type * as model_eventChatAttachments from "../model/eventChatAttachments.js";
import type * as model_eventChatAudience from "../model/eventChatAudience.js";
import type * as model_eventDeletion from "../model/eventDeletion.js";
import type * as model_eventRoomAccess from "../model/eventRoomAccess.js";
import type * as model_fileUploadBody from "../model/fileUploadBody.js";
import type * as model_grades from "../model/grades.js";
import type * as model_lessons from "../model/lessons.js";
import type * as model_liveAccess from "../model/liveAccess.js";
import type * as model_liveActivation from "../model/liveActivation.js";
import type * as model_liveLifecycle from "../model/liveLifecycle.js";
import type * as model_liveReconciliation from "../model/liveReconciliation.js";
import type * as model_membership from "../model/membership.js";
import type * as model_notebookFiles from "../model/notebookFiles.js";
import type * as model_notebookPreview from "../model/notebookPreview.js";
import type * as model_peopleDirectory from "../model/peopleDirectory.js";
import type * as model_peopleDirectoryFields from "../model/peopleDirectoryFields.js";
import type * as model_roles from "../model/roles.js";
import type * as model_scheduleAccess from "../model/scheduleAccess.js";
import type * as model_scheduleCancellation from "../model/scheduleCancellation.js";
import type * as model_scheduleDeletion from "../model/scheduleDeletion.js";
import type * as model_sessionContent from "../model/sessionContent.js";
import type * as model_sessionLeadership from "../model/sessionLeadership.js";
import type * as model_sessionVideoLessons from "../model/sessionVideoLessons.js";
import type * as model_studentAttendance from "../model/studentAttendance.js";
import type * as model_studentDashboardAccess from "../model/studentDashboardAccess.js";
import type * as model_surveyAccess from "../model/surveyAccess.js";
import type * as model_systemNotificationEvents from "../model/systemNotificationEvents.js";
import type * as model_systemNotifications from "../model/systemNotifications.js";
import type * as model_teacherPeopleDirectory from "../model/teacherPeopleDirectory.js";
import type * as model_timeZone from "../model/timeZone.js";
import type * as model_userImage from "../model/userImage.js";
import type * as model_whiteboardAccess from "../model/whiteboardAccess.js";
import type * as model_whiteboardCleanup from "../model/whiteboardCleanup.js";
import type * as model_whiteboardPresentation from "../model/whiteboardPresentation.js";
import type * as model_whiteboardRecording from "../model/whiteboardRecording.js";
import type * as model_whiteboardSceneStorage from "../model/whiteboardSceneStorage.js";
import type * as organizations from "../organizations.js";
import type * as people from "../people.js";
import type * as permissions from "../permissions.js";
import type * as presence from "../presence.js";
import type * as recordings from "../recordings.js";
import type * as roleAssignments from "../roleAssignments.js";
import type * as schedule from "../schedule.js";
import type * as schools from "../schools.js";
import type * as seed from "../seed.js";
import type * as sessionRecords from "../sessionRecords.js";
import type * as student from "../student.js";
import type * as surveyNotifications from "../surveyNotifications.js";
import type * as systemNotifications from "../systemNotifications.js";
import type * as types from "../types.js";
import type * as users from "../users.js";
import type * as whiteboardFileHttp from "../whiteboardFileHttp.js";
import type * as whiteboardFiles from "../whiteboardFiles.js";
import type * as whiteboardSessions from "../whiteboardSessions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  abeka: typeof abeka;
  abekaActions: typeof abekaActions;
  abekaCatalog: typeof abekaCatalog;
  abekaCurriculumLinks: typeof abekaCurriculumLinks;
  abekaHttp: typeof abekaHttp;
  abekaSync: typeof abekaSync;
  abekaWorkflow: typeof abekaWorkflow;
  academicSettings: typeof academicSettings;
  broadcasts: typeof broadcasts;
  calendar: typeof calendar;
  calendarClosures: typeof calendarClosures;
  campuses: typeof campuses;
  classSessionVideoStorage: typeof classSessionVideoStorage;
  classSessionVideos: typeof classSessionVideos;
  classes: typeof classes;
  courseChatAttachmentHttp: typeof courseChatAttachmentHttp;
  courseChatAttachments: typeof courseChatAttachments;
  courseChatMessages: typeof courseChatMessages;
  courseChatNotifications: typeof courseChatNotifications;
  courseNotebook: typeof courseNotebook;
  courseNotebookFiles: typeof courseNotebookFiles;
  courseTaskCorrections: typeof courseTaskCorrections;
  courseTaskFileHttp: typeof courseTaskFileHttp;
  courseTaskFiles: typeof courseTaskFiles;
  courseTaskReminders: typeof courseTaskReminders;
  courseTaskSubmissions: typeof courseTaskSubmissions;
  courseTasks: typeof courseTasks;
  crons: typeof crons;
  curriculums: typeof curriculums;
  eventChangeNotifications: typeof eventChangeNotifications;
  eventChatAttachmentHttp: typeof eventChatAttachmentHttp;
  eventChatAttachments: typeof eventChatAttachments;
  eventChatContext: typeof eventChatContext;
  eventChatMessages: typeof eventChatMessages;
  eventChatNotifications: typeof eventChatNotifications;
  eventRecordingCleanup: typeof eventRecordingCleanup;
  eventRoom: typeof eventRoom;
  events: typeof events;
  grades: typeof grades;
  http: typeof http;
  lessons: typeof lessons;
  liveRoomLifecycle: typeof liveRoomLifecycle;
  livekit: typeof livekit;
  migration: typeof migration;
  "model/abekaAccess": typeof model_abekaAccess;
  "model/abekaProgressHistory": typeof model_abekaProgressHistory;
  "model/abekaScheduling": typeof model_abekaScheduling;
  "model/abekaStudentProgress": typeof model_abekaStudentProgress;
  "model/abekaTransport": typeof model_abekaTransport;
  "model/abekaValidators": typeof model_abekaValidators;
  "model/broadcastAccess": typeof model_broadcastAccess;
  "model/broadcastRateLimits": typeof model_broadcastRateLimits;
  "model/calendarClosures": typeof model_calendarClosures;
  "model/catalog": typeof model_catalog;
  "model/chatAttachmentLimits": typeof model_chatAttachmentLimits;
  "model/chatNotification": typeof model_chatNotification;
  "model/chatSource": typeof model_chatSource;
  "model/chatTarget": typeof model_chatTarget;
  "model/classCancellationEvents": typeof model_classCancellationEvents;
  "model/classSessionVideoFields": typeof model_classSessionVideoFields;
  "model/classSessionVideos": typeof model_classSessionVideos;
  "model/classType": typeof model_classType;
  "model/courseAssignments": typeof model_courseAssignments;
  "model/courseChatAccess": typeof model_courseChatAccess;
  "model/courseChatAttachments": typeof model_courseChatAttachments;
  "model/courseChatEvents": typeof model_courseChatEvents;
  "model/courseNotebookAccess": typeof model_courseNotebookAccess;
  "model/courseProgress": typeof model_courseProgress;
  "model/courseSchedule": typeof model_courseSchedule;
  "model/courseScheduleShares": typeof model_courseScheduleShares;
  "model/courseTaskAccess": typeof model_courseTaskAccess;
  "model/courseTaskFiles": typeof model_courseTaskFiles;
  "model/courseTaskPublication": typeof model_courseTaskPublication;
  "model/courseTaskRecipients": typeof model_courseTaskRecipients;
  "model/courseTaskReminders": typeof model_courseTaskReminders;
  "model/courseTaskUploadBody": typeof model_courseTaskUploadBody;
  "model/curriculumIcons": typeof model_curriculumIcons;
  "model/enrollments": typeof model_enrollments;
  "model/eventAccess": typeof model_eventAccess;
  "model/eventChatAccess": typeof model_eventChatAccess;
  "model/eventChatAttachments": typeof model_eventChatAttachments;
  "model/eventChatAudience": typeof model_eventChatAudience;
  "model/eventDeletion": typeof model_eventDeletion;
  "model/eventRoomAccess": typeof model_eventRoomAccess;
  "model/fileUploadBody": typeof model_fileUploadBody;
  "model/grades": typeof model_grades;
  "model/lessons": typeof model_lessons;
  "model/liveAccess": typeof model_liveAccess;
  "model/liveActivation": typeof model_liveActivation;
  "model/liveLifecycle": typeof model_liveLifecycle;
  "model/liveReconciliation": typeof model_liveReconciliation;
  "model/membership": typeof model_membership;
  "model/notebookFiles": typeof model_notebookFiles;
  "model/notebookPreview": typeof model_notebookPreview;
  "model/peopleDirectory": typeof model_peopleDirectory;
  "model/peopleDirectoryFields": typeof model_peopleDirectoryFields;
  "model/roles": typeof model_roles;
  "model/scheduleAccess": typeof model_scheduleAccess;
  "model/scheduleCancellation": typeof model_scheduleCancellation;
  "model/scheduleDeletion": typeof model_scheduleDeletion;
  "model/sessionContent": typeof model_sessionContent;
  "model/sessionLeadership": typeof model_sessionLeadership;
  "model/sessionVideoLessons": typeof model_sessionVideoLessons;
  "model/studentAttendance": typeof model_studentAttendance;
  "model/studentDashboardAccess": typeof model_studentDashboardAccess;
  "model/surveyAccess": typeof model_surveyAccess;
  "model/systemNotificationEvents": typeof model_systemNotificationEvents;
  "model/systemNotifications": typeof model_systemNotifications;
  "model/teacherPeopleDirectory": typeof model_teacherPeopleDirectory;
  "model/timeZone": typeof model_timeZone;
  "model/userImage": typeof model_userImage;
  "model/whiteboardAccess": typeof model_whiteboardAccess;
  "model/whiteboardCleanup": typeof model_whiteboardCleanup;
  "model/whiteboardPresentation": typeof model_whiteboardPresentation;
  "model/whiteboardRecording": typeof model_whiteboardRecording;
  "model/whiteboardSceneStorage": typeof model_whiteboardSceneStorage;
  organizations: typeof organizations;
  people: typeof people;
  permissions: typeof permissions;
  presence: typeof presence;
  recordings: typeof recordings;
  roleAssignments: typeof roleAssignments;
  schedule: typeof schedule;
  schools: typeof schools;
  seed: typeof seed;
  sessionRecords: typeof sessionRecords;
  student: typeof student;
  surveyNotifications: typeof surveyNotifications;
  systemNotifications: typeof systemNotifications;
  types: typeof types;
  users: typeof users;
  whiteboardFileHttp: typeof whiteboardFileHttp;
  whiteboardFiles: typeof whiteboardFiles;
  whiteboardSessions: typeof whiteboardSessions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
