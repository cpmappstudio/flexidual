/**
 * Centralized route definitions for the Payments Platform.
 *
 * This file provides type-safe route builders to avoid hardcoded paths
 * throughout the application. When architecture changes, update routes here
 * and TypeScript will flag any breaking usages.
 *
 * Route Hierarchy:
 *   /admin/*                       - Superadmin platform routes
 *   /{organization}/*              - Organization-level routes
 */

export const ROUTES = {
  home: "/",

  auth: {
    signIn: "/sign-in",
    signUp: "/sign-up",
    organizations: "/organizations",
  },

  tenant: {
    auth: {
      signIn: (orgSlug: string) => `/${orgSlug}/sign-in`,
      signUp: (orgSlug: string) => `/${orgSlug}/sign-up`,
    },
    onboarding: (orgSlug: string) => `/${orgSlug}/onboarding`,
  },

  admin: {
    root: "/admin",

    organizations: {
      list: "/admin/organizations",
      detail: (orgId: string) => `/admin/organizations/${orgId}`,
      create: "/admin/organizations/create",
    },

    settings: {
      root: "/admin/settings",
      appearance: "/admin/settings/appearance",
      profileSecurity: "/admin/settings/user-profile",
      billing: "/admin/settings/billing",
    },
  },

  org: {
    root: (orgSlug: string) => `/${orgSlug}`,

    teams: {
      list: (orgSlug: string) => `/${orgSlug}/teams`,
      detail: (orgSlug: string, teamId: string) =>
        `/${orgSlug}/teams/${teamId}`,
      settings: (orgSlug: string, teamId: string) =>
        `/${orgSlug}/teams/${teamId}/settings`,
      create: (orgSlug: string) => `/${orgSlug}/teams/create`,
    },

    offerings: {
      list: (orgSlug: string) => `/${orgSlug}/offerings`,
      detail: (orgSlug: string, offeringId: string) =>
        `/${orgSlug}/offerings/${offeringId}`,
      create: (orgSlug: string) => `/${orgSlug}/offerings/create`,
    },

    applications: {
      list: (orgSlug: string) => `/${orgSlug}/applications`,
      detail: (orgSlug: string, applicationId: string) =>
        `/${orgSlug}/applications/${applicationId}`,
      create: (orgSlug: string) => `/${orgSlug}/preadmission`,
    },

    programs: {
      list: (orgSlug: string) => `/${orgSlug}/programs`,
      create: (orgSlug: string) => `/${orgSlug}/programs/create`,
    },

    members: {
      list: (orgSlug: string) => `/${orgSlug}/members`,
      detail: (orgSlug: string, memberId: string) =>
        `/${orgSlug}/members/${memberId}`,
    },

    fees: {
      list: (orgSlug: string) => `/${orgSlug}/fees`,
      assignments: (orgSlug: string) => `/${orgSlug}/fees/assignments`,
    },

    forms: {
      list: (orgSlug: string) => `/${orgSlug}/forms`,
      detail: (orgSlug: string, formId: string) =>
        `/${orgSlug}/forms/${formId}`,
      create: (orgSlug: string) => `/${orgSlug}/forms/create`,
    },

    staff: {
      list: (orgSlug: string) => `/${orgSlug}/staff`,
      detail: (orgSlug: string, staffId: string) =>
        `/${orgSlug}/staff/${staffId}`,
    },

    payments: (orgSlug: string) => `/${orgSlug}/payments`,

    divisions: {
      list: (orgSlug: string) => `/${orgSlug}/divisions`,
      detail: (orgSlug: string, divisionId: string) =>
        `/${orgSlug}/divisions/${divisionId}`,
      create: (orgSlug: string) => `/${orgSlug}/divisions/create`,
    },

    tournaments: {
      list: (orgSlug: string) => `/${orgSlug}/tournaments`,
      detail: (orgSlug: string, tournamentId: string) =>
        `/${orgSlug}/tournaments/${tournamentId}`,
      create: (orgSlug: string) => `/${orgSlug}/tournaments/create`,
    },

    settings: {
      root: (orgSlug: string) => `/${orgSlug}/settings`,
      appearance: (orgSlug: string) => `/${orgSlug}/settings/appearance`,
      profileSecurity: (orgSlug: string) => `/${orgSlug}/settings/user-profile`,
      billing: (orgSlug: string) => `/${orgSlug}/settings/billing`,
    },
  },
} as const;

export type Routes = typeof ROUTES;
