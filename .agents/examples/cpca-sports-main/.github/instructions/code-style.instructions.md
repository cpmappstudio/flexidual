---
applyTo: "**/*"
---

# Code Style & Architecture Guidelines

## Core Principles

1. **Simplicity over complexity** - Avoid over-engineering. Clean, readable code is priority.
2. **DRY (Don't Repeat Yourself)** - Single source of truth for logic and components.
3. **Separation of concerns** - Each file/folder has one clear responsibility.
4. **Progressive optimization** - Only optimize when it doesn't add complexity. Defer complex optimizations to future phases.

---

## 🥇 GOLDEN RULE: No Unused Code

**NEVER create variables, exports, types, or abstractions that are not immediately consumed.**

This is the highest priority rule. Unused code:
- Causes confusion
- Leads to over-engineering
- Makes the codebase harder to understand
- Creates maintenance burden

### What This Means

```typescript
// ❌ WRONG: Creating exports "just in case" or "for convenience"
export const inter = Inter({ ... });
export const montserrat = Montserrat({ ... });
export const fonts = { inter, montserrat }; // Not used anywhere!
export type FontVariable = ...; // Not used anywhere!

// ✅ CORRECT: Only export what is actually imported elsewhere
const inter = Inter({ ... });
const montserrat = Montserrat({ ... });

export const fontVariables = [inter.variable, montserrat.variable].join(" ");
export const FONT_VARIABLES = { ... }; // Only if actually used in another file
```

### Rules

1. **Before creating an export** → Verify it will be imported somewhere
2. **Before creating a type** → Verify it will be used in a signature or assertion
3. **Before creating a utility function** → Verify it will be called
4. **Before creating an abstraction** → Verify the pattern repeats at least twice

### When Reviewing Code

If you see unused exports, variables, or types:
- **Delete them immediately**
- Don't comment them out "for later"
- Don't keep them "just in case"

**The best code is the code you don't write.**

---

## Project Structure

### Directory Responsibilities

| Directory | Purpose | Rules |
|-----------|---------|-------|
| `app/` | Next.js pages (server-first) | Pages load data and compose components. No business logic. |
| `components/` | React components | Organized by feature/location. Atomic components in `ui/`. |
| `components/ui/` | Atomic UI primitives | Import from shadcn. Do NOT create custom unless instructed. |
| `convex/` | Backend logic & database | All Convex functions. Organize by feature. |
| `lib/` | Domain logic & utilities | Each domain has its folder with `types.ts` and `utils.ts`. |
| `hooks/` | Custom React hooks | All hooks. File names start with `use-`. |

### File Naming

- **All files**: `kebab-case-in-english.ts` or `.tsx`
- **Hooks**: `use-feature-name.ts`
- **Components**: `kebab-case.tsx` (file) but `PascalCase` (export)

---

## Pages (`app/`)

### Server-First Approach

Pages should be **server components** that:
1. Fetch data
2. Compose section components
3. Pass data as props

```tsx
// CORRECT: Page shows intent through component composition
export default async function LandingPage() {
  const data = await fetchData();
  
  return (
    <>
      <Hero data={data.hero} />
      <Features items={data.features} />
      <Footer />
    </>
  );
}

// WRONG: Page hides structure behind single component
export default function LandingPage() {
  return <Landing />;
}
```

### When to Use Client Components

Only add `"use client"` when the component needs:
- React hooks (`useState`, `useEffect`, etc.)
- Event handlers
- Browser APIs

---

## Components (`components/`)

### Organization

```
components/
├── sections/           # Page-specific sections
│   ├── landing/        # Landing page sections
│   │   ├── hero.tsx
│   │   └── footer.tsx
│   └── shell/          # Shell (dashboard) sections
├── forms/              # Form components
├── layouts/            # Layout wrappers
├── skeletons/          # Loading states
└── ui/                 # Atomic primitives (shadcn)
```

### Rules

1. **Section components** live in `sections/{page-name}/`
2. **Shared components** live at `components/` root or appropriate subfolder
3. **Atomic UI** stays in `ui/` - primarily shadcn imports
4. Components should be **small and focused** - split if exceeding ~150 lines

### Abstracting Reusable Components

When a pattern repeats (e.g., data tables), abstract it:

```tsx
// CORRECT: Reusable table with column definitions
<DataTable
  columns={memberColumns}
  data={members}
  onRowClick={handleMemberClick}
  searchable
/>

// WRONG: Repeating table implementation in every page
```

---

## Library (`lib/`)

### Structure

Each domain gets its own folder:

```
lib/
├── routes.ts           # Centralized route definitions (REQUIRED)
├── navigation/
│   ├── types.ts        # Type definitions
│   ├── config.ts       # Navigation configuration
│   └── index.ts        # Public exports
└── auth/
    ├── auth.ts         # Auth helpers
    └── types.ts        # Auth types
```

### Rules

1. **Only `.ts` files** in `lib/` (no React components)
2. **Types** go in `types.ts`
3. **Functions** go in `utils.ts` (or more specific names like `config.ts`)
4. Keep files reasonable in length - split when needed

---

## Hooks (`hooks/`)

- All custom hooks in this folder
- File names: `use-{feature-name}.ts`
- Export single hook per file (usually)

```typescript
// hooks/use-fee-filters.ts
export function useFeeFilters() {
  // ...
}
```

---

## Backend (`convex/`)

### Structure

```
convex/
├── schema.ts           # Database schema
├── http.ts             # HTTP endpoints (webhooks)
├── {feature}.ts        # Feature modules (offerings.ts, applications.ts)
└── lib/                # Shared utilities
    ├── auth.ts
    └── auth_types.ts
```

### Rules

1. One feature per file (e.g., `offerings.ts`, `applications.ts`, `fees.ts`)
2. Keep functions small and focused
3. Shared logic goes in `lib/`
4. See `convex.instructions.md` for function syntax

---

## Code Quality

### No Comments (with exceptions)

Code should be self-documenting through:
- Clear variable/function names
- Small, focused functions
- Logical structure

**When comments ARE allowed:**
- Complex algorithms that need explanation
- Non-obvious workarounds with context
- TODO markers for planned work

**Comment format (when needed):**
```typescript
// Brief explanation of why, not what
const result = complexCalculation();
```

### No Emojis

- No emojis in code
- No emojis in comments
- No emojis in logs
- No emojis anywhere in the codebase

### Logging

```typescript
// CORRECT: Professional, academic language
console.log("[Auth] User session validated");

// WRONG: Casual or emoji-laden
console.log("🎉 User logged in!");
```

**Production safety**: Ensure logs don't execute in production. Use environment checks or logging utilities.

---

## Optimization Guidelines

### Do Optimize When

- Server components can replace client components
- Memoization prevents expensive recalculations
- The optimization is clean and readable

### Don't Optimize When

- It adds significant complexity
- The code becomes harder to understand
- It requires extensive abstraction layers

**Rule**: If optimization requires more than ~20 lines of additional code or creates confusing patterns, defer to future phases.

---

## Anti-Patterns to Avoid

| Anti-Pattern | What to Do Instead |
|--------------|---------------------|
| Hardcoded route strings | Use `ROUTES` from `lib/routes.ts` |
| Deeply nested conditionals | Extract to small functions |
| Files > 300 lines | Split by responsibility |
| Duplicated logic | Abstract to shared utility |
| Complex prop drilling | Consider composition or context |
| Over-abstraction | Keep it simple until repetition proves need |
| Premature optimization | Wait for actual performance issues |
| Magic numbers/strings | Use constants or config files |

---

## Centralized Routes (`lib/routes.ts`)

**NEVER hardcode route paths.** All routes must be defined in `lib/routes.ts` and imported where needed.

### Usage

```typescript
import { ROUTES } from "@/lib/routes";

// Static routes
ROUTES.home                        // "/"
ROUTES.auth.signIn                 // "/sign-in"
ROUTES.admin.root                  // "/admin"
ROUTES.admin.organizations.list    // "/admin/organizations"

// Organization routes (with org slug parameter)
ROUTES.org.root(orgSlug)                         // "/acme-corp"
ROUTES.org.offerings.list(orgSlug)               // "/acme-corp/offerings"
ROUTES.org.offerings.detail(orgSlug, id)         // "/acme-corp/offerings/abc123"
ROUTES.org.applications.list(orgSlug)            // "/acme-corp/applications"
ROUTES.org.members.list(orgSlug)                 // "/acme-corp/members"
ROUTES.org.fees.list(orgSlug)                    // "/acme-corp/fees"
ROUTES.org.payments(orgSlug)                     // "/acme-corp/payments"

```

### Rules

1. **All `href` props** must use `ROUTES.*`
2. **All `router.push()` calls** must use `ROUTES.*`
3. **Navigation config** in `lib/navigation/config.ts` uses `ROUTES` directly via `href` functions
4. When adding new pages, **add the route to `lib/navigation/routes.ts` first**

```tsx
// CORRECT
<Link href={ROUTES.org.members.list(orgSlug)}>Members</Link>
router.push(ROUTES.org.offerings.detail(orgSlug, offeringId));

// WRONG - hardcoded strings
<Link href={`/${orgSlug}/members`}>Members</Link>
router.push(`/${orgSlug}/offerings/${offeringId}`);
```

---

## Quick Reference

### Creating New Features

1. **Page**: `app/[locale]/(shell)/[organization]/feature/page.tsx` - Server component, compose sections
2. **Sections**: `components/sections/shell/feature/` - Feature-specific components
3. **Logic**: `lib/feature/` - Types in `types.ts`, functions in `utils.ts`
4. **Hooks**: `hooks/use-feature.ts` - Client-side state logic
5. **Backend**: `convex/feature.ts` - Queries and mutations

### Checklist Before Committing

- [ ] No duplicate logic (check for existing utilities)
- [ ] No emojis in code, comments, or logs
- [ ] No unnecessary comments
- [ ] Files are reasonably sized
- [ ] Components are in correct location
- [ ] Server components where possible
- [ ] Routes use `ROUTES.*` from `lib/routes.ts`
