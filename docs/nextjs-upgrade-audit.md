# Auditoría de Next.js 16 y diagnósticos React

Fecha: 2026-10-24. Trabajo local, con pnpm, sin despliegue ni modificación de datos existentes.

## Resultado de los 103 diagnósticos

Los 103 mensajes iniciales no eran 103 errores de ejecución independientes. La configuración nueva de Next incluía diagnósticos de React Compiler aunque el compilador no está habilitado.

| Regla                         | Mensajes iniciales |
| ----------------------------- | -----------------: |
| `purity`                      |                  9 |
| `set-state-in-effect`         |                 67 |
| `preserve-manual-memoization` |                  5 |
| `refs`                        |                 19 |
| `immutability`                |                  2 |
| `incompatible-library`        |                  1 |
| Total                         |                103 |

Se eliminaron las seis desactivaciones globales. **86 mensajes se resolvieron con cambios de código; 17 conservan una excepción local explicada.** No se presentan estas excepciones como fallos corregidos. Al revisar los hooks relacionados se documentó también el cierre de PiP, y la nueva sincronización del destino del portal necesita una excepción puntual de dependencias: 19 excepciones explícitas en total, no una exclusión de carpetas o categorías.

## Correcciones

- Las referencias de callbacks y del estado de conexión se actualizan después del commit, no durante renders que React podría descartar. El transporte y las colas de guardado no se recrean por un cambio de callback.
- El estado derivado de consultas y selecciones se calcula directamente o se ajusta con una condición que compara su origen anterior. Se evita pintar el formulario anterior y reinicializarlo después mediante un efecto. Los reinicios siguen perteneciendo a cada formulario; no se introdujo un gestor genérico de formularios.
- Los borradores de Abeka se identifican también por institución, evitando conservar el de otra institución cuando ambas tienen el mismo horario guardado.
- El calendario conserva la última versión remota del evento seleccionado aunque salga del rango visible.
- La lista de currículos ordena una copia; no modifica el array compartido de la consulta.
- Los relojes reutilizan el hook existente o un inicializador perezoso. El esqueleto del sidebar deja de generar anchuras aleatorias durante el render. Los mensajes de ánimo conservan una elección aleatoria estable, sin discrepancia entre HTML de servidor e hidratación.
- `useHydrated` y `useBrowserTimeZone` centralizan la frontera servidor/navegador. La zona horaria del chat no se vuelve a detectar en cada render. No sustituyen la configuración horaria institucional.
- El carrusel usa `useSyncExternalStore` para el estado del SDK y elimina tanto la suscripción `select` como `reInit` al desmontar o cambiar de instancia.
- La notificación de chat obtiene el destino del portal después del commit, incluso si el elemento aparece tarde o se sustituye.
- Los streams de cámara que llegan después de revocar acceso, desmontar o descartar una ejecución de StrictMode se detienen; no se adoptan ni cambian la preferencia guardada.
- La entrada a la clase conserva los requisitos independientes de conexión y animación, sin desmontar la sala. Las transiciones de página cancelan temporizadores antiguos sin desmontar su contenido.

## Excepciones locales revisadas

Estas líneas conservan el flujo de un recurso externo o un comando asíncrono. No se añadieron temporizadores ni microtareas para esconder setters del analizador.

| Módulo                          | Cantidad | Motivo                                                                                                                                                                                          |
| ------------------------------- | -------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `whiteboard-editor`             |        2 | Preparar referencias de archivos antes de montar el SDK; el constructor de sincronización almacena callbacks, no lee sus refs durante el render.                                                |
| `classroom-session-provider`    |        3 | Crear/liberar el portal DOM tras el commit, reconciliar su vida con navegación y sala, y falso positivo sobre callbacks diferidos del portal.                                                   |
| `active-classroom-ui`           |        3 | Completar comandos al salir un participante, confirmarse la detención de grabación o llegar el dispositivo acompañante.                                                                         |
| `session-closeout-dialog`       |        2 | Capturar el reloj al abrir y congelar una única respuesta autorizada para no sobrescribir asistencia y notas mientras se editan.                                                                |
| `course-chat-attachments`       |        1 | Crear y revocar un object URL únicamente después del commit, con cleanup de StrictMode.                                                                                                         |
| `calendar-manage-event-dialog`  |        1 | Consumir la confirmación remota de reapertura antes de navegar.                                                                                                                                 |
| `student-attendance-summary`    |        1 | Completar una petición de reproducción cuando llega la respuesta autorizada.                                                                                                                    |
| `student-hub-page`              |        1 | Recuperar la preferencia local de audio e instalar el desbloqueo por gesto del usuario.                                                                                                         |
| `integration-settings`          |        1 | Esperar la conexión confirmada por el backend antes de navegar, no solo la aceptación HTTP.                                                                                                     |
| `student-profile-hero`          |        1 | Detener físicamente la cámara y sincronizar su indicador cuando se revoca acceso.                                                                                                               |
| `data-table`                    |        1 | TanStack Table v8 tiene una API mutable incompatible con memoización automática. La función usa la directiva oficial `use no memo`; no se reemplazó el sistema de tablas.                       |
| `use-classroom-floating-window` |        1 | Cerrar la ventana/PiP externa tras revocarse su disponibilidad. Fuera del conjunto original de 103.                                                                                             |
| `classroom-chat-notification`   |        1 | El ref DOM no es reactivo: se compara su identidad tras cada commit para detectar destinos tardíos, sin bucle de actualizaciones. Regla de dependencias, no uno de los 103 mensajes originales. |

## Compatibilidad y barreras de publicación

- Se conserva Next 16.4.3, React/React DOM 19.3.1, Clerk 6.39.8 y next-intl 4.14.9. Convex permanece en 1.42.3.
- `proxy.ts` mantiene las reglas de acceso, redirecciones y excepciones de rutas existentes. La exportación de configuración sigue siendo `config`, según la versión instalada; no `proxyConfig`, como indica incorrectamente una sección de la skill local.
- `pnpm build` ejecuta primero `pnpm lint`: Next 16 ya no hace este paso automáticamente.
- Se mantiene Webpack para el build de producción y Turbopack para desarrollo, con las pruebas existentes de next-intl/PostHog para ambos.
- El mínimo de Node es 22.13, requerido por pnpm 11.10.0, no solo el mínimo 20.9 de Next. Validación local con Node 24.16.0.
- No se habilitan Cache Components ni React Compiler. No se cambia la caché de datos privados ni se ignoran errores de TypeScript.

## Entorno de pruebas de Convex

Las primeras ejecuciones generales fallaron en Abeka por el bombeo de temporizadores de `convex-test` 0.0.54; aislar el archivo podía hacerlo pasar. También se reprodujo la cascada de globals restaurados mientras quedaba trabajo pendiente. No se omitieron tests ni se relajaron sus aserciones.

La corrección oficial del planificador está publicada en `convex-test` 0.0.60, pero esas versiones requieren Convex >=1.43. Se conserva el runtime existente y se aplica **solo el backport del planificador, en una dependencia de desarrollo**, mediante `patches/convex-test@0.0.54.patch` y `pnpm patchedDependencies`. El planificador cede al event loop, conserva esperas internas y detiene/limpia el pump cuando cambia el reloj o falla el avance. El helper de Abeka conserva su límite original de una hora simulada.

Eliminar este backport cuando se actualicen juntos Convex y convex-test a versiones compatibles que incluyan la corrección, pasando la prueba de teardown y la suite completa.

## Validación

- `pnpm test`: **1.448 pruebas**, sin fallos ni omisiones: 206 unitarias, 732 de componentes y 510 de backend.
- `pnpm lint`, TypeScript y build de producción correctos. El build se ejecutó sin credenciales de subida de sourcemaps.
- Instalación reproducible con `pnpm install --frozen-lockfile`.
- Chrome 155 con Excalidraw real: escritor y lector, dos callbacks de API en StrictMode, dibujos e imágenes, sin errores de página. El segundo flujo comprueba preview tras borrado, reintentos de imágenes y recuperación al recargar con almacenamiento lleno. Backend de fixtures local, no producción.
- Pruebas nuevas: hidratación, navegación rápida sin remontaje, cleanup del carrusel en StrictMode, respuestas tardías de cámara, cambio de institución sin fuga de borrador, destino tardío del portal, snapshot remoto del calendario, configuración de lint y cancelación del planificador de tests al restaurar el reloj.
- Se mantienen visibles los avisos preexistentes de jsdom sobre `Window.focus` y `TimeoutNaNWarning`; no se han silenciado ni se confunden con una prueba contra hardware o una llamada real.
- `pnpm peers check` todavía señala incompatibilidades declaradas heredadas: `convex-helpers` solicita Convex >=1.43 y un Radix anidado declara React/React DOM hasta 18 (el proyecto ya usaba React 19 antes de esta actualización). No se cambiaron rangos de peers para ocultarlas. La suite pasa, pero esto no equivale a una instalación sin avisos de compatibilidad; actualizar esos módulos es un alcance separado del cambio de Next.
- Smoke test del build servido localmente: `/en`, `/es` y `/en/sign-in` responden 200; estudiantes sin sesión redirigen a sign-in; una petición incompleta al API de imágenes se rechaza; el optimizador de imágenes local responde 200. La portada no registra errores de página en Chrome. Se detuvo ese servidor temporal del puerto 3002; el desarrollo del puerto 3000 sigue activo.

Esto valida la compatibilidad local y los flujos cubiertos, no acredita ausencia absoluta de errores ni mide ahorro de costes o latencia en una clase de producción. No se hizo commit, push, despliegue, migración ni modificación de datos existentes.

## Validación del conjunto para publicación

- Se integra con los cambios de tareas/PDF que ya estaban en `main`.
- Se corrigen los tres diagnósticos nuevos de ese código: selección de estudiante
  al cambiar el enlace y referencias de callbacks/modo de edición del visor PDF
  después del commit. No se desactivan reglas.
- Se añaden pruebas de cambio de estudiante y de callbacks tardíos del PDF sin
  remontar el visor ni perder el modo de solo lectura.
- `pnpm test`: **1.554 pruebas pasan**; instalación congelada, lint y compilación
  de producción con Next.js 16.4.3 correctos. Chrome pasa los flujos responsive
  del Board y la recuperación de previews e imágenes con almacenamiento lleno.
- Cache Components continúa desactivado: la actualización no cambia la política
  de caché de los datos privados ni el almacenamiento local del Board.

## Referencias oficiales

- [Migración oficial a Next.js 16](https://nextjs.org/docs/app/guides/upgrading/version-16), contrastada con `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`.
- [Estado derivado y reinicios sin efectos innecesarios](https://react.dev/learn/you-might-not-need-an-effect).
- [Integración con stores externos](https://react.dev/reference/react/useSyncExternalStore).
- [Exclusión explícita de React Compiler](https://react.dev/reference/react-compiler/directives/use-no-memo).
- [Changelog oficial de convex-test](https://github.com/get-convex/convex-test/blob/main/CHANGELOG.md) y [planificador de v0.0.60](https://github.com/get-convex/convex-test/blob/v0.0.60/index.ts).
