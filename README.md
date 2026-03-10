# Welcome to your Convex + Next.js + Clerk app

This is a [Convex](https://convex.dev/) project created with [`npm create convex`](https://www.npmjs.com/package/create-convex).

After the initial setup (<2 minutes) you'll have a working full-stack app using:

- Convex as your backend (database, server logic)
- [React](https://react.dev/) as your frontend (web page interactivity)
- [Next.js](https://nextjs.org/) for optimized web hosting and page routing
- [Tailwind](https://tailwindcss.com/) for building great looking accessible UI
- [Clerk](https://clerk.com/) for authentication

## Get started

If you just cloned this codebase and didn't use `npm create convex`, run:

```
npm install
npm run dev
```

If you're reading this README on GitHub and want to use this template, run:

```
npm create convex@latest -- -t nextjs-clerk
```

Then:

1. Open your app. There should be a "Claim your application" button from Clerk in the bottom right of your app.
2. Follow the steps to claim your application and link it to this app.
3. Follow step 3 in the [Convex Clerk onboarding guide](https://docs.convex.dev/auth/clerk#get-started) to create a Convex JWT template.
4. Uncomment the Clerk provider in `convex/auth.config.ts`
5. Paste the Issuer URL as `CLERK_JWT_ISSUER_DOMAIN` to your dev deployment environment variable settings on the Convex dashboard (see [docs](https://docs.convex.dev/auth/clerk#configuring-dev-and-prod-instances))

If you want to sync Clerk user data via webhooks, check out this [example repo](https://github.com/thomasballinger/convex-clerk-users-table/).

## Learn more

To learn more about developing your project with Convex, check out:

- The [Tour of Convex](https://docs.convex.dev/get-started) for a thorough introduction to Convex principles.
- The rest of [Convex docs](https://docs.convex.dev/) to learn about all Convex features.
- [Stack](https://stack.convex.dev/) for in-depth articles on advanced topics.

## Join the community

Join thousands of developers building full-stack apps with Convex:

- Join the [Convex Discord community](https://convex.dev/community) to get help in real-time.
- Follow [Convex on GitHub](https://github.com/get-convex/), star and contribute to the open-source implementation of Convex.

```
flexidual
├─ .cursor
│  └─ rules
│     └─ convex_rules.mdc
├─ .prettierrc
├─ app
│  ├─ globals.css
│  ├─ layout.tsx
│  └─ [locale]
│     ├─ admin
│     │  ├─ campuses
│     │  │  └─ page.tsx
│     │  ├─ layout.tsx
│     │  ├─ schools
│     │  │  └─ page.tsx
│     │  └─ users
│     │     └─ page.tsx
│     ├─ layout.tsx
│     ├─ pending-role
│     │  └─ page.tsx
│     ├─ sign-in
│     │  └─ [[...sign-in]]
│     │     └─ page.tsx
│     └─ [orgSlug]
│        ├─ calendar
│        │  └─ page.tsx
│        ├─ classes
│        │  ├─ page.tsx
│        │  └─ [classId]
│        │     └─ page.tsx
│        ├─ classroom
│        │  └─ [roomName]
│        │     └─ page.tsx
│        ├─ curriculums
│        │  ├─ curriculums-table.tsx
│        │  └─ page.tsx
│        ├─ layout.tsx
│        ├─ lessons
│        │  ├─ lessons-table.tsx
│        │  ├─ page.tsx
│        │  └─ [lessonId]
│        │     └─ page.tsx
│        ├─ page.tsx
│        └─ users
│           └─ page.tsx
├─ components
│  ├─ admin
│  │  ├─ admin-class-tracking-card.tsx
│  │  ├─ campuses
│  │  │  └─ campus-dialog.tsx
│  │  ├─ schools
│  │  │  └─ school-dialog.tsx
│  │  └─ users
│  │     ├─ user-dialog.tsx
│  │     ├─ users-page-layout.tsx
│  │     └─ users-table.tsx
│  ├─ app-sidebar.tsx
│  ├─ calendar
│  │  ├─ body
│  │  │  ├─ calendar-body-header.tsx
│  │  │  ├─ calendar-body.tsx
│  │  │  ├─ day
│  │  │  │  ├─ calendar-body-day-calendar.tsx
│  │  │  │  ├─ calendar-body-day-content.tsx
│  │  │  │  ├─ calendar-body-day-events.tsx
│  │  │  │  ├─ calendar-body-day.tsx
│  │  │  │  └─ calendar-body-margin-day-margin.tsx
│  │  │  ├─ month
│  │  │  │  └─ calendar-body-month.tsx
│  │  │  └─ week
│  │  │     ├─ calendar-body-week-events.tsx
│  │  │     └─ calendar-body-week.tsx
│  │  ├─ calendar-context.tsx
│  │  ├─ calendar-event.tsx
│  │  ├─ calendar-mode-icon-map.tsx
│  │  ├─ calendar-provider.tsx
│  │  ├─ calendar-tailwind-classes.ts
│  │  ├─ calendar-types.ts
│  │  ├─ calendar-with-data.tsx
│  │  ├─ calendar.tsx
│  │  ├─ dialog
│  │  │  ├─ calendar-manage-event-dialog.tsx
│  │  │  └─ calendar-new-event-dialog.tsx
│  │  ├─ form
│  │  │  ├─ color-picker.tsx
│  │  │  └─ date-time-picker.tsx
│  │  └─ header
│  │     ├─ actions
│  │     │  ├─ calendar-header-actions-add.tsx
│  │     │  ├─ calendar-header-actions-mode.tsx
│  │     │  └─ calendar-header-actions.tsx
│  │     ├─ calendar-header.tsx
│  │     ├─ date
│  │     │  ├─ calendar-header-date-badge.tsx
│  │     │  ├─ calendar-header-date-chevrons.tsx
│  │     │  ├─ calendar-header-date-icon.tsx
│  │     │  └─ calendar-header-date.tsx
│  │     └─ filters
│  │        ├─ calendar-header-combined-filter.tsx
│  │        └─ calendar-header-teacher-filter.tsx
│  ├─ classroom
│  │  ├─ active-classroom-ui.tsx
│  │  ├─ flexi-classroom.tsx
│  │  ├─ join-class-button.tsx
│  │  └─ student-classroom-ui.tsx
│  ├─ convex-client-provider.tsx
│  ├─ dashboards
│  │  ├─ admin-dashboard.tsx
│  │  ├─ student-hub-page.tsx
│  │  └─ teaching-dashboard.tsx
│  ├─ dynamic-breadcrumb.tsx
│  ├─ lang-toggle.tsx
│  ├─ mode-toggle.tsx
│  ├─ nav-main.tsx
│  ├─ nav-projects.tsx
│  ├─ nav-user.tsx
│  ├─ org-switcher.tsx
│  ├─ providers
│  │  └─ alert-provider.tsx
│  ├─ schedule
│  │  └─ schedule-item.tsx
│  ├─ student
│  │  ├─ classroom-drop-zone.tsx
│  │  ├─ draggable-lesson-card.tsx
│  │  ├─ rocket-transition.tsx
│  │  ├─ scroll-indicator.tsx
│  │  ├─ student-class-card.tsx
│  │  └─ student-profile-hero.tsx
│  ├─ teaching
│  │  ├─ classes
│  │  │  ├─ add-student-dialog.tsx
│  │  │  ├─ attendance-dialog.tsx
│  │  │  ├─ class-combined-filter.tsx
│  │  │  ├─ class-dialog.tsx
│  │  │  ├─ class-teacher-filter.tsx
│  │  │  ├─ class-week-overview.tsx
│  │  │  ├─ classes-table.tsx
│  │  │  ├─ manage-schedule-dialog.tsx
│  │  │  └─ student-manager.tsx
│  │  ├─ curriculums
│  │  │  ├─ curriculum-dialog.tsx
│  │  │  └─ curriculum-lesson-list.tsx
│  │  └─ lessons
│  │     └─ lesson-dialog.tsx
│  ├─ team-switcher.tsx
│  ├─ theme-provider.tsx
│  ├─ ui
│  │  ├─ accordion.tsx
│  │  ├─ alert-dialog.tsx
│  │  ├─ aspect-ratio.tsx
│  │  ├─ avatar.tsx
│  │  ├─ badge.tsx
│  │  ├─ breadcrumb.tsx
│  │  ├─ button.tsx
│  │  ├─ calendar.tsx
│  │  ├─ card.tsx
│  │  ├─ chart.tsx
│  │  ├─ checkbox.tsx
│  │  ├─ collapsible.tsx
│  │  ├─ combobox.tsx
│  │  ├─ command.tsx
│  │  ├─ dialog.tsx
│  │  ├─ dropdown-menu.tsx
│  │  ├─ entity-dialog.tsx
│  │  ├─ flexidual-logo.tsx
│  │  ├─ form.tsx
│  │  ├─ input.tsx
│  │  ├─ label.tsx
│  │  ├─ overview-card.tsx
│  │  ├─ page-transition.tsx
│  │  ├─ pagination.tsx
│  │  ├─ popover.tsx
│  │  ├─ progress.tsx
│  │  ├─ radial-chart.tsx
│  │  ├─ radio-group.tsx
│  │  ├─ reusable-alert-dialog.tsx
│  │  ├─ scroll-area.tsx
│  │  ├─ select-dropdown.tsx
│  │  ├─ select.tsx
│  │  ├─ separator.tsx
│  │  ├─ sheet.tsx
│  │  ├─ sidebar.tsx
│  │  ├─ skeleton.tsx
│  │  ├─ sonner.tsx
│  │  ├─ switch.tsx
│  │  ├─ table.tsx
│  │  ├─ tabs.tsx
│  │  ├─ textarea.tsx
│  │  ├─ toggle-group.tsx
│  │  ├─ toggle.tsx
│  │  └─ tooltip.tsx
│  ├─ university-logo.tsx
│  ├─ user-avatar-trigger.tsx
│  └─ user-button-wrapper.tsx
├─ components.json
├─ convex
│  ├─ auth.config.ts
│  ├─ campuses.ts
│  ├─ classes.ts
│  ├─ cron.ts
│  ├─ curriculums.ts
│  ├─ http.ts
│  ├─ lessons.ts
│  ├─ livekit.ts
│  ├─ migration.ts
│  ├─ organizations.ts
│  ├─ permissions.ts
│  ├─ roleAssignments.ts
│  ├─ schedule.ts
│  ├─ schema.ts
│  ├─ schools.ts
│  ├─ seed.ts
│  ├─ seedCPCA.ts
│  ├─ student.ts
│  ├─ tsconfig.json
│  ├─ types.ts
│  ├─ users.ts
│  └─ _generated
│     ├─ api.d.ts
│     ├─ api.js
│     ├─ dataModel.d.ts
│     ├─ server.d.ts
│     └─ server.js
├─ eslint.config.mjs
├─ hooks
│  ├─ use-current-user.ts
│  └─ use-mobile.ts
├─ i18n
│  ├─ navigation.ts
│  ├─ request.ts
│  └─ routing.ts
├─ lib
│  ├─ date-utils.ts
│  ├─ error-utils.ts
│  ├─ grade-utils.ts
│  ├─ locale-setup.ts
│  ├─ location-data.ts
│  ├─ rbac.ts
│  ├─ teachers
│  │  └─ teacher-detail.ts
│  ├─ types
│  │  ├─ academic.ts
│  │  ├─ schedule.ts
│  │  ├─ student.ts
│  │  └─ table.ts
│  └─ utils.ts
├─ LICENSE
├─ messages
│  ├─ en.json
│  ├─ es.json
│  └─ pt-BR.json
├─ middleware.ts
├─ next.config.ts
├─ package.json
├─ pnpm-lock.yaml
├─ postcss.config.mjs
├─ public
│  ├─ data
│  │  └─ alldata
│  │     └─ Lessons.xlsx
│  ├─ flexidual-icon-wide.png
│  ├─ flexidual-icon.ico
│  └─ flexidual-icon.png
├─ README.md
├─ scripts
│  ├─ migrate.ts
│  └─ seedUsers.ts
├─ tsconfig.json
└─ typings
   └─ recharts.d.ts

```