import type { FlexidualCourse } from "@/modules/liveClasses/lib/flexidual-course-types";

export type FlexidualCourseFixture = FlexidualCourse;

export const FLEXIDUAL_COURSE_FIXTURES: readonly FlexidualCourseFixture[] = [
  {
    id: "flexidual-course-algebra-foundations",
    name: "Algebra Foundations",
    curriculumName: "Middle School Algebra",
    academicPeriod: "2026 - Term 1",
    tags: ["Equations", "Patterns", "Problem solving"],
    teacher: {
      name: "Camila Rojas",
      role: "Lead teacher",
      email: "camila.rojas@flexidual.edu",
    },
    students: [
      {
        id: "algebra-student-ana",
        name: "Ana Sofia Gomez",
        gradeLevel: "Grade 7",
      },
      {
        id: "algebra-student-mateo",
        name: "Mateo Calderon",
        gradeLevel: "Grade 7",
      },
      {
        id: "algebra-student-julieta",
        name: "Julieta Torres",
        gradeLevel: "Grade 8",
        guardianLinked: true,
      },
      {
        id: "algebra-student-emilio",
        name: "Emilio Restrepo",
        gradeLevel: "Grade 7",
      },
      {
        id: "algebra-student-valentina",
        name: "Valentina Duarte",
        gradeLevel: "Grade 8",
        guardianLinked: true,
      },
    ],
    sessions: {
      scheduledThisWeek: 3,
      completedThisWeek: 1,
      nextSession: {
        dateLabel: "Thursday, 08:00",
        title: "Linear expressions in context",
      },
      weeklySchedule: [
        {
          id: "algebra-session-01",
          weekday: "monday",
          title: "Warm-up and equation fluency",
          timeLabel: "08:00 - 09:10",
          sessionType: "Live session",
          lessonLabel: "Lesson 03 · Variables and expressions",
        },
        {
          id: "algebra-session-02",
          weekday: "wednesday",
          title: "Practice lab",
          timeLabel: "09:20 - 10:00",
          sessionType: "Support block",
          lessonLabel: "Custom lesson · Error analysis clinic",
        },
        {
          id: "algebra-session-03",
          weekday: "thursday",
          title: "Linear expressions in context",
          timeLabel: "08:00 - 09:15",
          sessionType: "Live session",
          lessonLabel: "Lesson 04 · Reading algebraic situations",
        },
      ],
      upcoming: [
        {
          id: "algebra-upcoming-01",
          title: "Linear expressions in context",
          dateLabel: "Thu, Mar 18",
          timeLabel: "08:00 - 09:15",
          lessonLabel: "Lesson 04 · Reading algebraic situations",
        },
        {
          id: "algebra-upcoming-02",
          title: "Checkpoint workshop",
          dateLabel: "Fri, Mar 19",
          timeLabel: "11:00 - 11:45",
          lessonLabel: "Custom lesson · Guided checkpoint review",
        },
        {
          id: "algebra-upcoming-03",
          title: "Equation talk routines",
          dateLabel: "Mon, Mar 22",
          timeLabel: "08:00 - 09:05",
          lessonLabel: "Lesson 05 · Comparing solution paths",
        },
        {
          id: "algebra-upcoming-04",
          title: "Practice lab remix",
          dateLabel: "Wed, Mar 24",
          timeLabel: "09:20 - 10:00",
          lessonLabel: "Custom lesson · Small-group correction sprint",
        },
        {
          id: "algebra-upcoming-05",
          title: "Expressions checkpoint debrief",
          dateLabel: "Fri, Mar 26",
          timeLabel: "10:10 - 10:55",
          lessonLabel: "Lesson 06 · Feedback and revision moves",
        },
      ],
      recent: [
        {
          id: "algebra-recent-01",
          title: "Warm-up and equation fluency",
          dateLabel: "Mon, Mar 15",
          timeLabel: "08:00 - 09:10",
          lessonLabel: "Lesson 03 · Variables and expressions",
        },
        {
          id: "algebra-recent-02",
          title: "Math habits diagnostic",
          dateLabel: "Fri, Mar 12",
          timeLabel: "08:00 - 09:00",
          lessonLabel: "No linked lesson",
        },
        {
          id: "algebra-recent-03",
          title: "Variables quick check",
          dateLabel: "Wed, Mar 10",
          timeLabel: "09:20 - 10:00",
          lessonLabel: "Lesson 02 · Variables in patterns",
        },
        {
          id: "algebra-recent-04",
          title: "Partner reasoning clinic",
          dateLabel: "Mon, Mar 08",
          timeLabel: "08:00 - 08:50",
          lessonLabel: "Custom lesson · Explaining each step aloud",
        },
        {
          id: "algebra-recent-05",
          title: "Pattern launch seminar",
          dateLabel: "Fri, Mar 05",
          timeLabel: "11:00 - 11:40",
          lessonLabel: "Lesson 01 · Growing patterns",
        },
      ],
    },
    content: {
      inheritedLessons: [
        {
          id: "algebra-lesson-01",
          moduleLabel: "Unit 1",
          title: "Variables and expressions",
          summary:
            "Students translate verbal statements into algebraic expressions and compare multiple representations.",
          objectives: [
            "Identify constants, variables, and operations in written scenarios.",
            "Represent equivalent expressions using tables and verbal descriptions.",
          ],
          plannedUse: "Used in Monday session",
        },
        {
          id: "algebra-lesson-02",
          moduleLabel: "Unit 1",
          title: "Reading algebraic situations",
          summary:
            "Learners connect equations with real-world situations and explain why each term matters.",
          objectives: [
            "Match expressions to contextual problems.",
            "Explain the meaning of each part of an equation in plain language.",
          ],
          plannedUse: "Planned for Thursday session",
        },
      ],
      customLessons: [
        {
          id: "algebra-custom-01",
          title: "Error analysis clinic",
          summary:
            "A course-specific intervention built to address repeated misconceptions from this group's diagnostic work.",
          objectives: [
            "Spot common sign errors and explain the correction.",
            "Rebuild confidence through short collaborative examples.",
          ],
          placement: "Inserted after Lesson 03 in this course only",
        },
        {
          id: "algebra-custom-02",
          title: "Guided checkpoint review",
          summary:
            "A focused review block before the first checkpoint to consolidate strategies and pacing.",
          objectives: [
            "Practice solving mixed-format algebra prompts under time constraints.",
            "Reflect on the strategy used in each problem before submitting.",
          ],
          placement: "Scheduled as an extra Friday session",
        },
      ],
    },
  },
  {
    id: "flexidual-course-reading-lab",
    name: "Reading Lab",
    curriculumName: "Language Arts Core",
    academicPeriod: "2026 - Term 1",
    tags: ["Close reading", "Inference", "Vocabulary"],
    teacher: {
      name: "Daniela Ruiz",
      role: "Literacy specialist",
      email: "daniela.ruiz@flexidual.edu",
    },
    students: [
      {
        id: "reading-student-samuel",
        name: "Samuel Ocampo",
        gradeLevel: "Grade 6",
      },
      {
        id: "reading-student-helena",
        name: "Helena Vera",
        gradeLevel: "Grade 6",
        guardianLinked: true,
      },
      {
        id: "reading-student-isabella",
        name: "Isabella Franco",
        gradeLevel: "Grade 6",
      },
      {
        id: "reading-student-thomas",
        name: "Thomas Giraldo",
        gradeLevel: "Grade 5",
      },
    ],
    sessions: {
      scheduledThisWeek: 2,
      completedThisWeek: 1,
      nextSession: {
        dateLabel: "Wednesday, 10:30",
        title: "Inference through article annotations",
      },
      weeklySchedule: [
        {
          id: "reading-session-01",
          weekday: "tuesday",
          title: "Vocabulary warm-up",
          timeLabel: "09:00 - 09:45",
          sessionType: "Studio block",
          lessonLabel: "Lesson 05 · Context clues and precision",
        },
        {
          id: "reading-session-02",
          weekday: "wednesday",
          title: "Inference through article annotations",
          timeLabel: "10:30 - 11:20",
          sessionType: "Live session",
          lessonLabel: "Lesson 06 · Annotating for evidence",
        },
      ],
      upcoming: [
        {
          id: "reading-upcoming-01",
          title: "Inference through article annotations",
          dateLabel: "Wed, Mar 17",
          timeLabel: "10:30 - 11:20",
          lessonLabel: "Lesson 06 · Annotating for evidence",
        },
        {
          id: "reading-upcoming-02",
          title: "Reading stamina sprint",
          dateLabel: "Thu, Mar 18",
          timeLabel: "09:40 - 10:10",
          lessonLabel: "Custom lesson · Reading stamina sprint",
        },
        {
          id: "reading-upcoming-03",
          title: "Claim and evidence sort",
          dateLabel: "Mon, Mar 22",
          timeLabel: "10:30 - 11:15",
          lessonLabel: "Lesson 07 · Distinguishing claims and proof",
        },
        {
          id: "reading-upcoming-04",
          title: "Annotation conference",
          dateLabel: "Wed, Mar 24",
          timeLabel: "10:30 - 11:20",
          lessonLabel: "Lesson 06 · Annotating for evidence",
        },
        {
          id: "reading-upcoming-05",
          title: "Short response workshop",
          dateLabel: "Fri, Mar 26",
          timeLabel: "09:00 - 09:45",
          lessonLabel: "Lesson 08 · Evidence-based writing",
        },
      ],
      recent: [
        {
          id: "reading-recent-01",
          title: "Vocabulary warm-up",
          dateLabel: "Tue, Mar 16",
          timeLabel: "09:00 - 09:45",
          lessonLabel: "Lesson 05 · Context clues and precision",
        },
        {
          id: "reading-recent-02",
          title: "Question marks in the margin",
          dateLabel: "Mon, Mar 15",
          timeLabel: "10:30 - 11:10",
          lessonLabel: "Lesson 04 · Asking better reading questions",
        },
        {
          id: "reading-recent-03",
          title: "Partner recap circle",
          dateLabel: "Fri, Mar 12",
          timeLabel: "09:00 - 09:35",
          lessonLabel: "Custom lesson · Oral retell routine",
        },
        {
          id: "reading-recent-04",
          title: "Precision words studio",
          dateLabel: "Wed, Mar 10",
          timeLabel: "10:30 - 11:15",
          lessonLabel: "Lesson 05 · Context clues and precision",
        },
        {
          id: "reading-recent-05",
          title: "Notebook evidence launch",
          dateLabel: "Mon, Mar 08",
          timeLabel: "10:30 - 11:05",
          lessonLabel: "Lesson 03 · Evidence trackers",
        },
      ],
    },
    content: {
      inheritedLessons: [
        {
          id: "reading-lesson-01",
          moduleLabel: "Module B",
          title: "Context clues and precision",
          summary:
            "Students infer word meaning through surrounding evidence and compare subtle meaning shifts.",
          objectives: [
            "Use sentence and paragraph clues to infer unknown vocabulary.",
            "Explain how word choice changes tone in short passages.",
          ],
          plannedUse: "Used in Tuesday studio block",
        },
        {
          id: "reading-lesson-02",
          moduleLabel: "Module B",
          title: "Annotating for evidence",
          summary:
            "Readers mark questions, evidence, and claims while reading expository texts.",
          objectives: [
            "Separate explicit evidence from inference.",
            "Use annotations to prepare a short written response.",
          ],
          plannedUse: "Planned for Wednesday live session",
        },
      ],
      customLessons: [
        {
          id: "reading-custom-01",
          title: "Reading stamina sprint",
          summary:
            "A custom routine created for this group to stretch reading focus before moving into longer passages.",
          objectives: [
            "Sustain silent reading for a longer interval.",
            "Capture one key idea and one question after each sprint.",
          ],
          placement: "Inserted before Module B checkpoint",
        },
      ],
    },
  },
  {
    id: "flexidual-course-earth-systems",
    name: "Earth Systems",
    curriculumName: "Integrated Science",
    academicPeriod: "2026 - Term 2",
    tags: ["Climate", "Models", "Observation"],
    teacher: {
      name: "Andres Galvez",
      role: "Science teacher",
      email: "andres.galvez@flexidual.edu",
    },
    students: [
      {
        id: "earth-student-sara",
        name: "Sara Millan",
        gradeLevel: "Grade 8",
      },
      {
        id: "earth-student-jose",
        name: "Jose Antonio Rios",
        gradeLevel: "Grade 8",
      },
      {
        id: "earth-student-mia",
        name: "Mia Quintana",
        gradeLevel: "Grade 8",
        guardianLinked: true,
      },
      {
        id: "earth-student-juan",
        name: "Juan Pablo Guerra",
        gradeLevel: "Grade 9",
      },
    ],
    sessions: {
      scheduledThisWeek: 3,
      completedThisWeek: 2,
      nextSession: {
        dateLabel: "Friday, 13:15",
        title: "Climate systems synthesis",
      },
      weeklySchedule: [
        {
          id: "earth-session-01",
          weekday: "monday",
          title: "Atmosphere patterns lab",
          timeLabel: "13:15 - 14:10",
          sessionType: "Lab session",
          lessonLabel: "Lesson 08 · Weather data patterns",
        },
        {
          id: "earth-session-02",
          weekday: "wednesday",
          title: "Observation notebooks",
          timeLabel: "13:15 - 14:00",
          sessionType: "Studio block",
          lessonLabel: "Custom lesson · Local weather comparison",
        },
        {
          id: "earth-session-03",
          weekday: "friday",
          title: "Climate systems synthesis",
          timeLabel: "13:15 - 14:15",
          sessionType: "Live session",
          lessonLabel: "Lesson 09 · Climate systems and feedback",
        },
      ],
      upcoming: [
        {
          id: "earth-upcoming-01",
          title: "Climate systems synthesis",
          dateLabel: "Fri, May 21",
          timeLabel: "13:15 - 14:15",
          lessonLabel: "Lesson 09 · Climate systems and feedback",
        },
        {
          id: "earth-upcoming-02",
          title: "Field notes calibration",
          dateLabel: "Mon, May 24",
          timeLabel: "13:15 - 14:00",
          lessonLabel: "Custom lesson · Observation reliability check",
        },
        {
          id: "earth-upcoming-03",
          title: "Weather model comparison",
          dateLabel: "Wed, May 26",
          timeLabel: "13:15 - 14:05",
          lessonLabel: "Lesson 10 · Comparing forecasting models",
        },
        {
          id: "earth-upcoming-04",
          title: "Feedback loop seminar",
          dateLabel: "Fri, May 28",
          timeLabel: "13:15 - 14:10",
          lessonLabel: "Lesson 09 · Climate systems and feedback",
        },
        {
          id: "earth-upcoming-05",
          title: "Local climate case review",
          dateLabel: "Mon, May 31",
          timeLabel: "13:15 - 14:00",
          lessonLabel: "Custom lesson · Regional weather anomalies",
        },
      ],
      recent: [
        {
          id: "earth-recent-01",
          title: "Observation notebooks",
          dateLabel: "Wed, May 19",
          timeLabel: "13:15 - 14:00",
          lessonLabel: "Custom lesson · Local weather comparison",
        },
        {
          id: "earth-recent-02",
          title: "Atmosphere patterns lab",
          dateLabel: "Mon, May 17",
          timeLabel: "13:15 - 14:10",
          lessonLabel: "Lesson 08 · Weather data patterns",
        },
        {
          id: "earth-recent-03",
          title: "Cloud layer sketch lab",
          dateLabel: "Fri, May 14",
          timeLabel: "13:15 - 14:00",
          lessonLabel: "Lesson 07 · Atmosphere structure",
        },
        {
          id: "earth-recent-04",
          title: "Data table annotation",
          dateLabel: "Wed, May 12",
          timeLabel: "13:15 - 13:55",
          lessonLabel: "Custom lesson · Observation notebook setup",
        },
        {
          id: "earth-recent-05",
          title: "Pressure map walkthrough",
          dateLabel: "Mon, May 10",
          timeLabel: "13:15 - 14:05",
          lessonLabel: "Lesson 08 · Weather data patterns",
        },
      ],
    },
    content: {
      inheritedLessons: [
        {
          id: "earth-lesson-01",
          moduleLabel: "Unit 3",
          title: "Weather data patterns",
          summary:
            "Students analyze temperature, pressure, and humidity changes to identify trends over time.",
          objectives: [
            "Read weather data tables and summarize key patterns.",
            "Use evidence to explain likely short-term changes in conditions.",
          ],
          plannedUse: "Used in Monday lab session",
        },
        {
          id: "earth-lesson-02",
          moduleLabel: "Unit 3",
          title: "Climate systems and feedback",
          summary:
            "Learners connect atmosphere, hydrosphere, and land interactions through visual models.",
          objectives: [
            "Describe how Earth systems affect one another.",
            "Explain one positive and one negative feedback loop.",
          ],
          plannedUse: "Planned for Friday synthesis session",
        },
      ],
      customLessons: [
        {
          id: "earth-custom-01",
          title: "Local weather comparison",
          summary:
            "This course-only lesson compares neighborhood observations to make the science feel immediate and local.",
          objectives: [
            "Compare school-site weather notes with official regional data.",
            "Discuss how local geography changes the reading of weather events.",
          ],
          placement: "Inserted between Unit 3 lessons 08 and 09",
        },
      ],
    },
  },
  {
    id: "flexidual-course-creative-writing",
    name: "Creative Writing Studio - Group 1-D",
    curriculumName: "Writing Workshop",
    academicPeriod: "2026 - Summer",
    tags: ["Voice", "Narrative", "Workshop"],
    teacher: {
      name: "Julian Pardo",
      role: "Workshop mentor",
      email: "julian.pardo@flexidual.edu",
    },
    students: [
      {
        id: "writing-student-nora",
        name: "Nora Alvarez",
        gradeLevel: "Grade 9",
      },
      {
        id: "writing-student-sebastian",
        name: "Sebastian Mejia",
        gradeLevel: "Grade 10",
      },
      {
        id: "writing-student-luisa",
        name: "Luisa Buitrago",
        gradeLevel: "Grade 10",
        guardianLinked: true,
      },
      {
        id: "writing-student-salome",
        name: "Salome Nunez",
        gradeLevel: "Grade 9",
      },
      {
        id: "writing-student-jeronimo",
        name: "Jeronimo Peinado",
        gradeLevel: "Grade 10",
      },
    ],
    sessions: {
      scheduledThisWeek: 2,
      completedThisWeek: 0,
      nextSession: {
        dateLabel: "Tuesday, 15:00",
        title: "Narrative voice lab",
      },
      weeklySchedule: [
        {
          id: "writing-session-01",
          weekday: "tuesday",
          title: "Narrative voice lab",
          timeLabel: "15:00 - 16:10",
          sessionType: "Workshop",
          lessonLabel: "Lesson 02 · Voice and point of view",
        },
        {
          id: "writing-session-02",
          weekday: "thursday",
          title: "Peer critique circle",
          timeLabel: "15:00 - 16:00",
          sessionType: "Feedback session",
          lessonLabel: "Custom lesson · Peer review protocol",
        },
      ],
      upcoming: [
        {
          id: "writing-upcoming-01",
          title: "Narrative voice lab",
          dateLabel: "Tue, Jun 08",
          timeLabel: "15:00 - 16:10",
          lessonLabel: "Lesson 02 · Voice and point of view",
        },
        {
          id: "writing-upcoming-02",
          title: "Peer critique circle",
          dateLabel: "Thu, Jun 10",
          timeLabel: "15:00 - 16:00",
          lessonLabel: "Custom lesson · Peer review protocol",
        },
        {
          id: "writing-upcoming-03",
          title: "Character voice workshop",
          dateLabel: "Tue, Jun 15",
          timeLabel: "15:00 - 16:05",
          lessonLabel: "Lesson 03 · Character voice and dialogue",
        },
        {
          id: "writing-upcoming-04",
          title: "Revision sprint",
          dateLabel: "Thu, Jun 17",
          timeLabel: "15:00 - 15:50",
          lessonLabel: "Custom lesson · Revision ladder",
        },
        {
          id: "writing-upcoming-05",
          title: "Summer publication rehearsal",
          dateLabel: "Tue, Jun 22",
          timeLabel: "15:00 - 16:10",
          lessonLabel: "Custom lesson · Summer publication rehearsal",
        },
      ],
      recent: [
        {
          id: "writing-recent-01",
          title: "Voice sampler warm-up",
          dateLabel: "Thu, Jun 03",
          timeLabel: "15:00 - 15:40",
          lessonLabel: "Lesson 01 · Finding a narrator",
        },
        {
          id: "writing-recent-02",
          title: "Opening lines studio",
          dateLabel: "Tue, Jun 01",
          timeLabel: "15:00 - 16:00",
          lessonLabel: "Lesson 01 · Finding a narrator",
        },
        {
          id: "writing-recent-03",
          title: "Scene tension mini-lab",
          dateLabel: "Thu, May 27",
          timeLabel: "15:00 - 15:45",
          lessonLabel: "Custom lesson · Raising stakes in a scene",
        },
        {
          id: "writing-recent-04",
          title: "Mentor text close read",
          dateLabel: "Tue, May 25",
          timeLabel: "15:00 - 15:55",
          lessonLabel: "Lesson 00 · Reading like a writer",
        },
        {
          id: "writing-recent-05",
          title: "Notebook launch and sharing",
          dateLabel: "Thu, May 20",
          timeLabel: "15:00 - 15:35",
          lessonLabel: "Studio launch · Writer notebooks",
        },
      ],
    },
    content: {
      inheritedLessons: [
        {
          id: "writing-lesson-01",
          moduleLabel: "Studio 1",
          title: "Voice and point of view",
          summary:
            "Writers explore how perspective and word choice shape the emotional distance of a story.",
          objectives: [
            "Differentiate first, second, and third person narration.",
            "Revise a paragraph to strengthen voice and consistency.",
          ],
          plannedUse: "Planned for Tuesday workshop",
        },
      ],
      customLessons: [
        {
          id: "writing-custom-01",
          title: "Peer review protocol",
          summary:
            "A custom critique sequence tailored for this studio group to keep feedback kind, specific, and actionable.",
          objectives: [
            "Use a simple protocol to give feedback on clarity, tension, and image.",
            "Decide which suggestion to adopt and justify the revision choice.",
          ],
          placement: "Scheduled as a Thursday workshop ritual",
        },
        {
          id: "writing-custom-02",
          title: "Summer publication rehearsal",
          summary:
            "A finishing sprint created for this cohort before the public reading and publication showcase.",
          objectives: [
            "Polish one final piece for oral delivery.",
            "Sequence excerpts for the group showcase.",
          ],
          placement: "Inserted at the end of the summer sequence",
        },
      ],
    },
  },
];

export function getFlexidualCourseFixtureById(courseId: string) {
  return (
    FLEXIDUAL_COURSE_FIXTURES.find((course) => course.id === courseId) ?? null
  );
}
