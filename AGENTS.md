<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Carpeta de trabajo obligatoria

Trabajar exclusivamente en `/Users/ulvenforst/Codex/Projects/CPM/flexidual`.
Verificar la ruta antes de modificar archivos. No crear ni usar otros worktrees,
ni cambiar de rama, salvo que el usuario lo solicite explícitamente.

## Documentación de Next.js

Usar la documentación de la versión instalada en `node_modules/next/dist/docs/`.
Para migraciones, consultar `01-app/02-guides/upgrading/version-16.md`.
Actualizar Next.js no autoriza activar Cache Components ni React Compiler:
son cambios de comportamiento que se evalúan por separado.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
