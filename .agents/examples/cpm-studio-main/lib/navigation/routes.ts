const TENANT_CAMPUSES_ROOT = "/campuses";

export const ROUTES = {
  home: "/",
  changelog: "/changelog",

  institutions: {
    root: "/institutions",
    teamSettings: "/institutions/team-settings",
  },

  auth: {
    signIn: "/sign-in",
    invite: "/invite",
  },

  tenant: {
    root: (tenantSlug?: string) => {
      void tenantSlug;
      return TENANT_CAMPUSES_ROOT;
    },
    profiles: (tenantSlug?: string) => {
      void tenantSlug;
      return "/profiles";
    },
    changelog: (tenantSlug?: string) => {
      void tenantSlug;
      return "/changelog";
    },
    onboarding: (tenantSlug?: string) => {
      void tenantSlug;
      return "/onboarding";
    },
    teamSettings: (tenantSlug?: string) => {
      void tenantSlug;
      return "/team-settings";
    },
    academicManagement: (tenantSlug?: string) => {
      void tenantSlug;
      return "/academic-management";
    },
    academicManagementSections: {
      students: (tenantSlug?: string) => {
        void tenantSlug;
        return "/academic-management/students";
      },
      teachers: (tenantSlug?: string) => {
        void tenantSlug;
        return "/academic-management/teachers";
      },
      academicPeriods: (tenantSlug?: string) => {
        void tenantSlug;
        return "/academic-management/academic-periods";
      },
      curriculumOfferings: (tenantSlug?: string) => {
        void tenantSlug;
        return "/academic-management/curriculum-offerings";
      },
    },
    campuses: {
      root: (tenantSlug?: string) => {
        void tenantSlug;
        return TENANT_CAMPUSES_ROOT;
      },
      detail: (tenantSlug: string | undefined, campusSlug: string) => {
        void tenantSlug;
        return `/campuses/${campusSlug}`;
      },
      people: (tenantSlug: string | undefined, campusSlug: string) => {
        void tenantSlug;
        return `/campuses/${campusSlug}/people`;
      },
      liveClasses: {
        root: (tenantSlug: string | undefined, campusSlug: string) => {
          void tenantSlug;
          return `/campuses/${campusSlug}/live-classes`;
        },
        calendar: (tenantSlug: string | undefined, campusSlug: string) => {
          void tenantSlug;
          return `/campuses/${campusSlug}/live-classes/calendar`;
        },
        courses: (tenantSlug: string | undefined, campusSlug: string) => {
          void tenantSlug;
          return `/campuses/${campusSlug}/live-classes/courses`;
        },
        courseDetail: (
          tenantSlug: string | undefined,
          campusSlug: string,
          courseId: string,
        ) => {
          void tenantSlug;
          return `/campuses/${campusSlug}/live-classes/courses/${courseId}`;
        },
      },
    },

    auth: {
      signIn: (tenantSlug?: string) => {
        void tenantSlug;
        return "/sign-in";
      },
    },
  },
} as const;
