# Estudio de rendimiento y costes de Convex

Fecha de revisión inicial: 2026-11-05; continuación: 2026-11-06. El inventario y las revisiones iniciales se conservan como baseline. Las prioridades 1 y 2 y la reutilización de contexto de CVX-03/CVX-04 están implementadas localmente; véanse las secciones de implementación para validación y activación pendiente. No se han publicado en producción.

## Alcance, fuentes y límites

- Carpeta única: `/Users/ulvenforst/Codex/Projects/CPM/flexidual`. Sin cambios de rama ni worktrees.
- Fuentes: siete capturas del usuario; código local; diagnóstico oficial de Convex de producción; consultas de solo lectura al proyecto PostHog Flexidual (627378); documentación oficial.
- Periodo de consumo indicado por el usuario: «oct 24 a nov 24 creo». Se registra como **probable ciclo 24 de octubre–24 de noviembre, no confirmado y todavía parcial al 5 de noviembre**. No se extrapolan tasas diarias ni costes mensuales.
- Las capturas de consumo incluyen Prod y Dev. Health muestra otra ventana: «11/2/2026, 2 PM–Now».
- El entorno local apunta a `dynamic-meerkat-158` (desarrollo). Solo se leyeron insights de `blessed-wombat-104` (producción). No se ejecutaron funciones de negocio, migraciones, escrituras ni cambios de configuración en ningún despliegue.
- El código local explica mecanismos, pero esta revisión no certifica que coincida byte por byte con la versión que generó todo el consumo histórico. Hay que comparar ventanas equivalentes después de cada publicación.
- Los rankings están recortados: los inventarios de abajo contienen las filas visibles, no todo el consumo.
- Database I/O incluye lecturas **y escrituras**. GB-hours no es latencia de usuario. Data Egress incluye descargas de archivos, fetch saliente y log streams: no es una medida de vídeo LiveKit ni de bytes de sincronización WebSocket por sí sola.
- No se conoce aquí el plan facturado, región, franquicias ni factura. Ningún porcentaje del ranking equivale automáticamente a ahorro facturable.

## Resultado ejecutivo

Hay dos amplificaciones de lectura confirmadas en el código que justifican empezar por mejoras acotadas:

1. `student:getStudentDashboardStats`: historiales completos de asistencia, horarios, enseñanzas y progreso Abeka para devolver resúmenes.
2. `courseChatNotifications:listUnread`: lectura de notificaciones de todas las clases de aviso, comprobaciones de visibilidad antes de descartar avisos irrelevantes y carga automática de todas las páginas antes del filtro organizacional del navegador.

La pizarra es la primera prioridad de **medición de cómputo**, pero no se ha demostrado que sus 1,2 M de llamadas sean todas innecesarias. Ya usa cursores, deltas, respaldo local, separación de imágenes y entrega rápida independiente del guardado. No hay justificación para reescribirla o reducir su correctitud para ahorrar consultas.

Los conflictos de escritura existen en producción. Son reintentos automáticos, no prueba de pérdida de datos ni de peticiones definitivamente fallidas. Presence y notificaciones merecen mediciones con denominador antes de cambiar su arquitectura.

Evaluación delegada, acotada y de código: **90/100 = max(0, 100 − 2 × 5)**. Dos hallazgos medios de amplificación de lecturas: dashboard y badges de chats. No es una nota del backend completo ni una certificación de producción. No se descuentan otra vez sus síntomas/ramas ni se puntúan hipótesis como hechos. Los schemas de findings-bus referenciados por la skill no están disponibles localmente; el informe no afirma validación contra esos schemas.

## Hallazgos y plan seguro

### CVX-01 — Dashboard: demasiados datos para obtener resúmenes

**Confirmado, prioridad de implementación 1.** La captura atribuye 21,13 GB de I/O a esta función, aproximadamente el 33 % de los 64,12 GB totales mostrados; no demuestra qué rama consume cada byte.

Ubicación:

- `convex/student.ts:580`: asistencia completa del estudiante con índice por estudiante y `.collect()`.
- `convex/student.ts:614`: todos los horarios de cada curso activo.
- `convex/student.ts:619` y `convex/model/courseProgress.ts`: lecciones e historial de enseñanzas para calcular progreso.
- `convex/model/abekaStudentProgress.ts:65`: documentos con arrays completos de lecciones para derivar porcentajes.
- `components/dashboards/student-hub-page.tsx:219`: el frontend actual no pasa un `now` cambiante al resumen. Ya existe separación de la agenda diaria; conservarla.

Dirección mínima: separar resúmenes ligeros de informes detallados, centralizando su actualización en los escritores existentes. Primero definir todos los escritores y comprobar si alguna proyección existente sirve; solo entonces decidir campos/tablas e inicialización por lotes idempotente. No sustituir estadísticas completas por `.take(n)`: produciría resultados incompletos. Un índice reduce el ámbito, pero leer todo el historial de ese ámbito sigue costando.

Preservar: correcciones de asistencia, cancelaciones, cierre pendiente/completado, matrículas antiguas y migradas, multigrado, lecciones desactivadas, combinación de enseñanza en vivo/pregrabada, cambios de currículo y permisos revocados.

Prueba de aceptación: datos con varios cursos y miles de sesiones/asistencias; igualdad exacta de resultados con la referencia; medición de `documentsRead` y `bytesRead`; crecimiento del historial sin crecimiento equivalente de las lecturas del resumen. Los lectores detallados deben seguir disponibles.

### CVX-02 — Badges de chats: trabajo ajeno antes de filtrar

**Confirmado, prioridad de implementación 2.** Captura: 2,73 GB en `courseChatNotifications.listUnread`, además de 1,35 GB en el lector de campana. No sumar ambos como trabajo idéntico completamente eliminable.

Ubicación:

- `convex/courseChatNotifications.ts:476–499`: pagina avisos no leídos de todos los tipos, calcula visibilidad y después descarta los que no pertenecen al flujo de chat.
- `hooks/use-unread-course-chats.ts:24–40`: carga automáticamente todas las páginas y filtra campus/institución en el cliente.
- `convex/systemNotifications.ts:153`: otra lectura del feed para la campana. Su hook sí limita los resultados visibles a 100; el de badges no.

Primer paso seguro: filtrar relevancia barata antes de los joins de visibilidad y llevar el ámbito organizacional autorizado al servidor. Esto reduce procesamiento/joins, pero no necesariamente filas leídas. Si la medición sigue indicando un coste material, utilizar un índice o proyección específica de chats. No imponer un máximo arbitrario que oculte chats no leídos fuera de la primera página.

Preservar: avisos de tareas que tengan `messageId`, broadcasts institucionales visibles desde otros campus, revocación de acceso, contadores completos y watermark de lectura.

Pruebas: más de 1.000 avisos ajenos/ocultos; coincidencias fuera de primera página; múltiples campus; broadcasts; tareas en chat; cambio de usuario/organización; permisos retirados durante la paginación. Comparar lecturas y joins con los mismos datos.

### CVX-03 — Pizarra: medir invalidaciones antes de tocar el transporte

**Coste observado; causa exacta de amplificación pendiente.** Captura: 1,2 M llamadas, 10,25 GB I/O, 5,5 GBh (aproximadamente 50 % del cómputo total mostrado).

Flujo actual:

- `hooks/use-whiteboard-buckets.ts:48`: suscripciones solo a los bloques presentes, no indiscriminadamente a todos los bloques posibles.
- El mismo hook conserva caché y renueva cursores en checkpoints; no cada trazo.
- `convex/whiteboardSessions.ts:390`: cada bloque valida lectura de la sala y resuelve la hoja presentada.
- `convex/model/whiteboardAccess.ts`: lectura de usuario/sala/horario y permisos activos.
- `convex/model/whiteboardPresentation.ts`: valida hoja, curso, archivo y manifiesto seleccionado. Parte de la resolución vuelve a consultar el horario.
- `convex/model/whiteboardSceneStorage.ts:333`: lectura incremental del historial cuando el cursor sirve; snapshot acotado como recuperación.
- `convex/model/whiteboardSceneStorage.ts:456`: el manifiesto se modifica al añadir un bloque no presente, **no en cada edición de un bloque existente**. Las firmas de preview viven por separado y no invalidan las suscripciones de escena.

Hipótesis verificable: documentos compartidos de autorización/presentación pueden invalidar múltiples lectores de bloques cuando cambian, aunque el contenido de esos bloques no cambie. La repetición de helpers puede añadir lecturas. No atribuir todo el coste a esta hipótesis sin traza.

Próximo experimento: profesor + varios lectores + companion QR, escena grande e imágenes; editar repetidamente un único bloque y contar ejecuciones, cache hits, bytes, bloques afectados y latencia visible p50/p95. Repetir cambio de hoja, entradas/salidas, asistencia y cambios de ciclo de vida. Distinguir carga inicial, edición sostenida, checkpoints y recuperación por cursor antiguo.

Si se confirma, reutilizar contexto ya autorizado dentro de una ejecución y reducir dependencias mutables innecesarias. No eliminar autorización de cada consulta ni moverla exclusivamente al frontend. Evitar una nueva capa de caché o un protocolo paralelo sin necesidad demostrada.

Invariantes: entrega rápida LiveKit independiente del guardado; persistencia agrupada; cursor móvil; historial limitado y fallback a snapshot; versiones/borrados; imágenes y propiedad; borradores; permisos; deshacer/rehacer; recarga con cuota llena; seguimiento/puntero; QR; grabación y clientes antiguos; aislamiento entre curso, sala, activación y hoja.

### CVX-04 — Consultas temporales de la clase

**Trabajo periódico confirmado; ahorro posible no cuantificado.** `components/classroom/use-classroom-clock.ts:6` redondea argumentos a 15 segundos. El reloj visual es de un segundo, pero no implica una nueva clave de consulta por segundo.

`schedule:getSessionLeadership`, `getStudentExtensionContext`, `getSessionStatus` y `getLiveExtensionContext` vuelven a derivar acceso/contexto. Los contextos de extensión tienen retornos tempranos y algunas suscripciones del personal están condicionadas a autoridad/sesión activa: conservar esas protecciones.

Plan: separar datos estables de liderazgo de elegibilidad temporal solo si reduce trabajo medido, reutilizando helpers actuales. Un temporizador del cliente puede controlar presentación, nunca autorizar iniciar, reabrir, extender o finalizar una clase. Medir consultas por participante-minuto y transiciones en límites exactos de tiempo.

### CVX-05 — Notificaciones y Presence: contención real, no rediseño automático

**Síntoma runtime confirmado.** Notificaciones: `convex/model/chatNotification.ts:25,61` publica sobre el mismo documento por usuario/chat que modifica `courseChatNotifications.markRead`. Esto explica competencia entrega/lectura. El singleton, watermark y receipts cumplen una función; no son basura.

Presence: componente oficial `@convex-dev/presence@0.4.0`; tracker único en `components/convex-client-provider.tsx`; intervalo cliente/servidor de 30 segundos. Hay un parche de recuperación existente que no debe retirarse sin comprobar equivalencia. No se demostró un tracker duplicado.

Antes de cambiar: tasa de reintentos por llamada, retraso final, tamaño de transacción, sesiones/pestañas por usuario y contención dentro del componente. La API reciente muestra 1.009 reintentos en `presence/batchWorker/loop.loop` sobre `sessions`, no visibles en el recorte de la captura. Revisar versión/código upstream y política de sesiones expiradas; no ampliar arbitrariamente heartbeat ni reemplazar Presence por una implementación propia.

Pruebas necesarias: publish/markRead concurrentes, entrega duplicada/retrasada, lectura anterior a entrega y mensaje nuevo posterior a lectura; múltiples pestañas, reconexión, cierre sin auth, token secreto de desconexión y cambios de usuario. Medir que los intentos terminen sin pérdida y con latencia aceptable.

### CVX-06 — Workflow/Abeka

**Hipótesis respaldada por código, atribución pendiente.** La fila de componente `workflow/worker.runMutationWrapper` consume 9,43 GB I/O. No prueba que todo pertenezca a Abeka.

`convex/abekaWorkflow.ts:142–159` procesa estudiantes/asignaturas secuencialmente en un workflow; el tamaño de página 20 no segmenta su journal. La implementación instalada carga/reproduce pasos anteriores (`@convex-dev/workflow/src/client/workflowMutation.ts:187`, `src/component/journal.ts:60`). Es un candidato a I/O creciente por replay.

Obtener primero nombre/run, número de pasos, bytes de journal y trabajo útil. Si se confirma, workflows hijos/lotes acotados y versionados para **nuevas ejecuciones**, manteniendo replay de los antiguos, límites del proveedor, resume, fencing y exclusión de runs obsoletos. No borrar journals ni cambiar incompatiblemente una ejecución en curso.

`abekaSync.saveProgress` guarda contenido y metadatos de la ejecución. `studentComplete` exige que cada reporte pertenezca al `runId` actual. No saltar escrituras por igualdad de lecciones sin conservar esa procedencia. Si los bytes siguen siendo materiales, separar frescura/run del contenido pesado, preservando correcciones del proveedor e historial diario.

### CVX-07 — LiveKit y egress hacia Clerk

**Candidatos a perfilado, no llamadas innecesarias demostradas.** `convex/crons.ts` reconcilia LiveKit cada cinco minutos; los webhooks de entrada/salida también solicitan reconciliación. `convex/liveRoomLifecycle.ts:346` ya agrupa trabajos pendientes y conserva `reconcileAgain` si hay uno en curso. No retirar esa recuperación ni asumir que las 27 K llamadas al HTTP y al action son dos webhooks distintos: son dos etapas del mismo flujo.

Medir reconciliaciones por activación, disparador, llamadas externas por ejecución, sesiones activas y no-op. Probar webhooks repetidos/desordenados, cierre, reconexión y recuperación de grabación antes de ajustar coalescencia.

`users.updateUserWithClerk` encabeza egress (115,16 MB). Ya evita algunas operaciones: correo igual no se actualiza; foto solo si se aporta. Las imágenes de perfil y respuestas del proveedor son posibles contribuyentes; falta distribución por tamaño/tipo de edición. No tratar el primer puesto como fuga ni eliminar sincronización de identidad. Validar llamadas equivalentes, tamaño de imagen y entradas efectivamente cambiadas, conservando permisos, webhook de reconciliación, contraseña y cambio de campus.

### CVX-08 — Errores, atribución y observabilidad

PostHog registra errores de clientes; no sustituye métricas de I/O ni logs de cron. `docs/error-tracking.md` documenta una instancia diagnóstica sin replay, URLs completas, canvas ni mensajes, con redacción y límites de envío. Por eso un filtro por URL puede devolver vacío, y cero sesiones enlazadas no equivale a cero sesiones de usuario afectadas. No habilitar replay/captura adicional como parte de este estudio.

Hay errores de conexión/señalización/publicación, DOM, carga de chunks, permisos y readiness de la pizarra. Hay que correlacionarlos por operación, activación, rol y release y revisar contexto servidor. No concluir que todo es red, que todo es Convex o que `removeChild` prueba una causa concreta.

La agrupación titulada `FLEXIDUAL_OBSERVABILITY_TEST_2026_10_04` devolvió una muestra `ResizeObserver loop completed with undelivered notifications.`. **No ignorar toda la agrupación por parecer un test**; revisar agrupación/fingerprint y eventos individuales. Esta discrepancia queda pendiente, sin resolver/silenciar issues.

Muestras: readiness apunta a `components/whiteboard/whiteboard-editor.tsx` (frame de la release, línea 379); getToken muestra acción interrumpida en vuelo; removeChild no aportó frames de aplicación útiles en la muestra. Estos datos no bastan para adjudicar causalidad o certificar producción frente a desarrollo: las consultas incluyeron cuentas de prueba y no pudieron separarse de forma fiable por hostname con la telemetría actual.

## Orden de trabajo propuesto

1. Fijar baseline de CVX-01 y diseñar el resumen mínimo, sin afectar lectores de detalle. Implementarlo y comparar resultados/lecturas antes de publicar.
2. Acotar CVX-02, empezando por filtros baratos y ámbito autorizado; demostrar que no se pierden avisos fuera de la primera página.
3. Medir CVX-03/CVX-04 con la prueba representativa existente antes de cambiar la pizarra o la política temporal.
4. Perfilar CVX-05/CVX-06 con denominadores y atribución de workflows. Reducir tamaño de trabajo/contención comprobada; no añadir sharding o colas por intuición.
5. Revisar CVX-07 y CVX-08 por separado de las optimizaciones de lectura. Si se confirma un fallo de pérdida de datos/permisos, anteponerlo al ahorro.
6. Publicación posterior, autorizada y por cambios aislados: campos opcionales/proyecciones compatibles, inicialización por lotes idempotente si procede, comparación de resultados, fallback y rollback del lector sin borrar fuente. Mantener clientes antiguos y revisar consumo por usuario/clase/minuto en ventanas equivalentes.

No se propone reemplazar Convex/Excalidraw/LiveKit, cachear resultados privados globalmente, desactivar reactividad o alargar intervalos críticos sin medición.

## Dependencias: consulta, no actualización

`check-updates` no está disponible como herramienta/script local. Fallback de solo lectura: `pnpm outdated '@convex-dev/*' --format json`.

| Paquete | Instalado | Último devuelto por registro |
| --- | --- | --- |
| @convex-dev/workflow | 0.4.8 | 0.4.10 |
| @convex-dev/rate-limiter | 0.3.2 | 0.4.3 |
| @convex-dev/eslint-plugin | 2.0.0 | 5.0.1 |

No se actualizaron paquetes. Ver notas/versiones/compatibilidad y parches existentes antes de proponer una actualización; tener una versión más nueva no demuestra que resuelva estos costes. Presence no apareció como desactualizado en esta consulta.

## Validación local de baseline

No se añadieron pruebas porque este trabajo es de investigación, sin cambios de aplicación.

- `pnpm exec vitest run convex/studentDashboardPerformance.test.ts convex/whiteboardIncremental.test.ts convex/whiteboardRealtime.test.ts`: **35 pruebas pasan**.
- `pnpm exec vitest run --config vitest.components.config.mts tests/student-hub-subscriptions.test.tsx tests/unread-notification-count.test.tsx tests/course-chat-notifications.test.tsx`: **10 pruebas pasan**.
- El segundo comando emitió `TimeoutNaNWarning`; las pruebas terminaron correctamente. Origen no investigado en esta revisión; no se ocultó ni se atribuyó al producto.
- 45 pruebas seleccionadas no equivalen a suite completa, benchmark nuevo de latencia o ensayo real de tablet. Las pruebas de agenda existentes validan lecturas acotadas de agenda, no prueban que el resumen histórico esté acotado.

## Revisión profunda de las prioridades 1 y 2 — 2026-11-05

Continuación solicitada por el usuario. Solo diagnóstico y documentación; ningún cambio de aplicación, datos, dependencias ni despliegue. La evaluación inicial delegada se conserva; el nuevo pase independiente solicitado no llegó a iniciarse y fue cancelado. Los resultados siguientes son la revisión y medición del agente principal, no una segunda certificación independiente.

### Mediciones reproducibles sin editar pruebas ni tocar servicios

Se ejecutaron dos diagnósticos adicionales mediante la API instalada `startVitest` y un plugin de transformación en memoria de fixtures existentes. No se guardaron archivos de prueba ni se ejecutaron mutaciones contra despliegues: todos los inserts fueron en `convex-test`. La instrumentación obtiene `ctx.meta.getTransactionMetrics()` después de llamar a la consulta real. Son costes de lectura del motor simulado, **no tiempos de red ni facturación de producción**.

Dashboard, fixture `convex/studentDashboardPerformance.test.ts`, una matrícula activa y 405 horarios:

| Escenario | Documentos leídos | Bytes leídos | Total de sesiones devuelto | Cierres pendientes devueltos |
| --- | ---: | ---: | ---: | ---: |
| Base | 419 | 115.779 | 404 | 201 |
| Misma matrícula + 1.000 asistencias de un curso inactivo | 1.419 | 421.779 | 404 | 201 |
| Escenario anterior + 100 lecciones activas con 20.000 caracteres de contenido | 1.519 | 2.444.269 | 404 | 201 |

Los tres escenarios hicieron 26 consultas de base de datos y cero escrituras durante la lectura. El segundo añade exactamente 1.000 documentos leídos sin modificar los totales ni la lista pendiente: confirma la lectura innecesaria de asistencia ajena al ámbito activo. El tercero incorpora 100 lecciones que sí cambian el total de lecciones del currículo, pero arrastra también unos 2 MB de contenido que el resumen no devuelve. Reducir campos del objeto retornado no evita leer esos documentos completos.

Badges, fixture `convex/courseChatNotifications.test.ts`, agotando páginas de 50 como el hook actual:

| Escenario | Páginas/ejecuciones de listUnread | Documentos leídos acumulados | Bytes leídos acumulados | Chats devueltos |
| --- | ---: | ---: | ---: | ---: |
| Un aviso de chat no leído | 1 | 4 | 1.015 | 1 |
| Mismo chat + 1.000 announcements no leídos, de 1.000 caracteres | 21 | 1.024 | 1.270.245 | 1 |

Estos announcements permiten aislar el escaneo de avisos ajenos; no pretenden representar el peso de todos los tipos de aviso. Otros tipos, como tareas, pueden hacer comprobaciones de visibilidad adicionales. La mejora debe comprobar ambos perfiles. Las cifras no son un porcentaje de ahorro predicho para producción.

### Contratos y escritores que deben preservarse

| Dominio | Flujo existente | Implicación para la optimización |
| --- | --- | --- |
| Permisos de perfil | `model/studentDashboardAccess.ts`, `permissions.canViewStudentProfile`, `users.getCurrentUserFromAuth` | Mantener identidad del servidor, usuario activo, matrícula y profesor autorizado; el studentId es un destino, no la identidad del lector. |
| Asistencia verificada | `schedule.submitSessionClosure` y `schedule.updateAttendance` | El cierre permite reemplazar lecciones y corregir asistencia; actualizar proyecciones en la misma transacción, no en un job posterior. |
| Reapertura | `schedule.markLive`, `schedule.reopenLiveSession` | Estado vuelve a active y cierre a pending. Contadores que solo incrementen al cerrar quedarían incorrectos. |
| Horarios | `classes.replaceFutureCourseSchedule`, `model/scheduleCancellation.ts`, `model/scheduleDeletion.ts`, `schedule.ts` | Contemplar altas, reemplazo, cancelación, cierre, reapertura y borrado. No actualizar agregados por heartbeats o cambios que no alteren sus claves/valores. |
| Enseñanza del currículo | `schedule.submitSessionClosure`, `model/sessionVideoLessons.recordPublishedVideoLessons`, `lessons.create/createBatch/update/remove/duplicate` | Distinguir lección única enseñada de sesiones que la enseñan; deduplicar vivo/pregrabado de una misma sesión. Mantener alta/baja/cambio de currículo y exclusión de la sesión editada. |
| Abeka | `abekaSync.saveProgress`, `cleanupStudentProgress`, `model/abekaStudentProgress.ts` | Respetar runId, rosterRunId, conexión, enlaces antiguos/por currículo, correcciones/decrecimientos y syncedAt. No sustituir el porcentaje por completed/total: el helper actual incorpora progreso parcial. |
| Datos existentes | `seed.ts`, `migration.ts` y datos previos | Una proyección nueva necesita inicialización idempotente por lotes y un estado de preparación; no devolver cero porque todavía no exista. No ejecutar migraciones en esta fase. |

No existe hoy un componente Aggregate montado ni una tabla de resumen equivalente que resuelva estos contadores. La agenda diaria y el historial de asistencia verificada **sí** están separados: reutilizarlos; no reconstruirlos. La lista de cierres pendientes todavía viene completa en el resumen aunque su vista esté cerrada (`student-attendance-summary.tsx:397–422`).

### Diseño mínimo recomendado antes de implementar

1. **Separar resumen y detalle.** Conservar los contratos antiguos para clientes abiertos y lectores de informe; crear el camino ligero sin listas pendientes ni contenido de lecciones. La lista pendiente debe consultarse/paginarse cuando se abra, con el mismo helper de autorización y sin omitir registros por recortes silenciosos.
2. **Agregación explícita, no caché con vencimiento.** Los contadores sobre historiales necesitan datos derivados transaccionales. Evaluar el componente oficial `@convex-dev/aggregate` para conteos por curso/estado, en lugar de inventar un motor de agregación. Los joins de asistencia y la deduplicación de lecciones siguen siendo reglas del dominio: el componente no los resuelve automáticamente. La elección de proyecciones debe cerrar primero la matriz de escritores anterior y medir coste adicional de escritura.
3. **Abeka: lector ligero separado.** Un resumen pequeño debe vivir separado del documento que contiene el array de lecciones; añadir contadores al mismo documento grande no elimina sus bytes de lectura. Mantener una sola función pura para calcular los valores y actualizar resumen/reporte juntos, conservando el lector detallado y los guards existentes.
4. **Badges: selección indexada, no solo filtro tardío.** Ya existe índice por recipient/kind/readAt, pero los avisos relevantes abarcan course_chat, broadcast_chat y avisos con messageId (incluidas tareas). Cambiar a un único kind perdería información. Concretar un índice/proyección de relevancia compartido por todos los escritores, o una unión paginada compatible; no crear varias paginaciones independientes dentro de una consulta nativa ni ocultar avisos fuera de la primera página. Ámbito institucional y campus se validan en servidor y se aplica la visibilidad actual antes de devolver resultados.
5. **Activación compatible y gradual.** Helpers de dominio para derivar datos, lectores con autorización existente, inicialización reanudable y comparación de resultados con el cálculo actual antes de cambiar el frontend. No copiar reglas de negocio en componentes, no poner totales privados en caché global y no tocar pizarra, streams, heartbeat ni grabaciones como parte de estas dos prioridades.

Esta es una dirección de implementación, no una afirmación de que las tablas/índices exactos estén aprobados o añadidos. La matriz de escritores y el coste de mantenimiento impiden resolver correctamente el problema con un simple `.take(25)` o con un contador actualizado solo al cerrar.

### Validación ampliada

- 75 pruebas existentes: studentDashboardPerformance, studentAttendance, classSessionVideoLessons y sessionLeadership.
- 106 pruebas existentes: abeka, teacherStudents, liveAccess y videoViewingReports.
- 90 pruebas existentes: courseChatNotifications, systemNotifications, broadcasts y courseTasks.
- Total de este pase: **271 pruebas existentes pasan**, más **2 diagnósticos en memoria** que pasan. No se añadieron pruebas persistentes ni se hizo una compilación/despliegue porque no se modificó aplicación.
- Falta demostrar antes/después tras implementar: lecturas acotadas por resumen, paridad en reapertura/corrección/borrado, inicialización concurrente, tareas y broadcasts fuera de la primera página, y revocación durante paginación. Las pruebas actuales de corrección no prueban por sí solas escalabilidad del resumen.

Referencias adicionales: [Aggregate oficial](https://www.convex.dev/components/aggregate), [ejemplo oficial de actualización transaccional](https://stack.convex.dev/efficient-count-sum-max-with-the-aggregate-component), [lectura de datos](https://docs.convex.dev/database/reading-data). Los agregados se mantienen explícitamente desde los escritores: instalar un componente no intercepta por sí solo todas las escrituras existentes.

## Implementación local — dashboard y badges

Alcance autorizado tras la revisión: prioridades CVX-01 y CVX-02. Solo carpeta principal, pnpm, sin git, producción ni ejecución de backfills sobre datos existentes. No se cambiaron algoritmos de pizarra, medios LiveKit, grabaciones ni reglas de asistencia.

### Qué cambió

- `student.getStudentDashboardStats` admite `summaryOnly`; el dashboard lo utiliza. Los clientes antiguos conservan su respuesta original y los informes detallados siguen leyendo sus fuentes.
- `dashboardAggregate` usa el componente oficial Aggregate, con namespaces por curso, estudiante/curso y currículo. No existe un total global compartido entre todos los usuarios.
- `functions.ts` aplica los triggers transaccionales oficiales de convex-helpers. Las mutaciones públicas e internas de la aplicación usan este límite común; tipos, consultas y actions continúan usando el servidor generado. Una prueba estática impide que futuros escritores lo eludan por accidente.
- Los cambios de horario que no afectan los contadores, como liderazgo y metadatos del ciclo de vida, no escriben agregados. Las correcciones, el cierre, reapertura, cancelación y borrado sí ajustan los datos derivados. Los agregados no se actualizan desde el frontend ni mediante cron eventual.
- El progreso curricular conserva un pequeño fact por curso/lección enseñada y cuenta solo lecciones activas del currículo actual. Las fuentes en vivo/pregrabadas se deduplican; cambios de fuente, padre, actividad y currículo se mantienen en la misma transacción. El borrado de curso limpia solo sus nuevos facts/agregados, sin borrar el historial original.
- Abeka almacena un resumen separado de las lecciones completas. Reutiliza la resolución de conexión, roster, enlaces y permisos; mantiene progreso parcial, correcciones a la baja, runId y syncedAt. Guardado y limpieza del resumen ocurren con el reporte original.
- Los cierres pendientes se consultan únicamente al abrir su vista, con paginación y el helper de streams oficial para fusionar cursos. Se mantienen permisos, cursos activos, orden y selección de curso. Una página vacía con más resultados avanza hasta encontrar pendientes, sin esconder sesiones antiguas.
- Los badges consultan una partición indexada de avisos relevantes y otra partición legacy disjunta. El ámbito organizacional se comprueba en servidor en cada página. Las tareas con mensaje y los broadcasts institucionales siguen incluidos. El hook deduplica IDs si las dos instantáneas reactivas se solapan mientras se inicializan datos antiguos.

### Dependencias y compatibilidad

Se añadieron `convex-helpers@0.1.133` y **`@convex-dev/aggregate@0.2.2` fijado exactamente**. Aggregate 0.3.4 fue comprobado y descartado: exige APIs `commitTs` ausentes en Convex 1.42.3 instalado. No se simuló esa API ni se actualizó Convex para resolverlo. La versión compatible pasó codegen, pruebas y compilación. No se actualizaron los componentes existentes de Presence, Workflow o rate limiter como tarea separada.

El patrón de escritura sigue [triggers oficiales](https://stack.convex.dev/triggers) y la [inicialización idempotente de Aggregate](https://github.com/get-convex/aggregate), contrastada con el README de la versión 0.2.2 instalada. Los triggers ejecutan cálculos derivados en la transacción original; no son un servicio de caché paralelo.

### Antes/después medido

Fixtures locales, mismos datos de negocio y permisos; no son una medición de factura ni de latencia en una tablet.

| Escenario | Antes | Después |
| --- | ---: | ---: |
| Dashboard: 405 horarios, 1.000 asistencias de un curso inactivo y 100 lecciones de 20 KB; documentos leídos | 1.519 | 54 |
| Mismo dashboard; bytes leídos | 2.444.169 | 40.100 |
| Abeka: 170 lecciones pesadas; bytes leídos | 205.586 | 1.935 |
| Resumen curricular con lecciones pesadas; bytes leídos | 211.763 | 1.227 |
| Badges con 1.000 avisos legacy ajenos; páginas | 22 | 2 |
| Mismos badges; documentos | 1.116 | 16 |
| Mismos badges; bytes | 1.350.808 | 4.137 |

El caso de badges compara las dos particiones del lector nuevo antes/después de inicializar los campos legacy; no debe confundirse con la medición anterior de 21 páginas del lector antiguo. La segunda página posterior es la comprobación vacía del carril legacy. Los avisos nuevos ajenos al chat se excluyen inmediatamente sin esperar al backfill.

### Activación futura, explícita y sin borrar fuentes

No se ejecutaron estas operaciones sobre desarrollo ni producción; solo dentro de convex-test. Hay tres inicializaciones independientes:

1. `dashboardSummaries.backfill({})`: invocación interna repetible, con cursor/fase persistidos. Repetir hasta `done: true`. Fases: horarios (hasta 20 filas), asistencia (hasta 4), lecciones (hasta 20), fuentes del informe en vivo (hasta 3) y fuentes pregrabadas (hasta 3). Los lotes menores reservan espacio para documentos relacionados que no cubre el límite de bytes de la paginación. Habilita mantenimiento transaccional antes de recorrer datos, pero no activa lectores agregados hasta completar todo. No programa jobs automáticamente.
2. `abekaSync.backfillProgressSummaries({cursor:null})`: seguir `continueCursor` hasta `isDone`. Hasta 10 reportes por lote con objetivo de 1 MB. Alternativamente, las futuras sincronizaciones crean sus resúmenes. Los reportes aún sin resumen usan fallback.
3. `courseChatNotifications.backfillChatBadgeRelevance({paginationOpts:{cursor:null,numItems:50}})`: seguir el cursor hasta `isDone`. Los avisos antiguos siguen visibles en el carril legacy antes y durante el proceso; su coste se reduce al completarlo.

Antes de publicar: preparar los índices/tablas y el componente en backend, después el frontend que usa argumentos/funciones nuevos. En una tabla de notificaciones grande conviene un despliegue preparatorio con el índice staged, esperar su disponibilidad, quitar staged y activar el lector. La rama local final ya contiene el índice utilizable; no publicar un lector que intente consultar un índice todavía staged.

El fallback del dashboard se mantiene mientras `dashboardSummaryState.ready` sea falso o no exista. Nunca se devuelven ceros por falta de inicialización. Para revertir el lector puede volver a usarse el cálculo original, conservando las fuentes, los campos opcionales y los datos derivados. No borrar ni reiniciar el árbol durante una inicialización activa.

### Validación y límites

- Suite completa: 224 pruebas unitarias, 1.032 componentes y 746 backend tras las últimas regresiones; comprobar resultado final del pase, no sumar ejecuciones repetidas como pruebas distintas.
- TypeScript, lint convencional del proyecto, lint enfocado de los cambios y build Next.js de producción comprobados. Codegen local generó los bindings del componente sin publicar funciones de negocio.
- La suite de componentes emite avisos preexistentes de `TimeoutNaNWarning` y `window.focus` no implementado en jsdom.
- Un lint adicional ampliado a todos los hooks/Convex detectó 28 errores y 9 warnings fuera del alcance convencional (reglas React sobre refs/efectos en hooks de pizarra/LiveKit y warnings de archivos existentes/generados). No se ocultaron reglas ni se modificó ese código para hacer pasar la tarea; no se afirma que ese lint ampliado esté limpio.
- El coste de **lectura** deja de ser proporcional a historiales completos en el resumen listo. El coste de escritura no es constante: reabrir/cambiar una sesión con asistencias actualiza sus aportes, y cambiar una lección compartida actualiza facts de cursos relacionados. Hay límites transaccionales reales con fan-outs extremos; no se introdujeron recortes silenciosos ni consistencia eventual para esconderlos.
- Las proyecciones se mantienen mediante funciones de aplicación. Ediciones manuales de tablas desde herramientas administrativas que eludan ese límite requieren reconciliación explícita; no son una ruta de edición soportada por estas proyecciones.
- La auditoría independiente detectó y permitió corregir la navegación por páginas pendientes vacías. También se añadieron pruebas de corrección/reintento a través de la mutación pública de asistencia, backfill repetido, concurrencia de fuentes, eliminación de clase y permisos/campus.

CVX-01/CVX-02 quedan implementados y probados localmente. CVX-03 en adelante siguen pendientes; este cambio no acredita ahorro real ni resolución de los errores de conexión/DOM de PostHog. La validación de consumo en producción corresponde a una publicación futura con ventanas equivalentes.

Reevaluación delegada del mismo alcance: **90 → 100/100 (+10)**, calculado como `max(0,100 − 15×0 altos − 5×0 medios − 1×0 bajos)`. Los dos hallazgos medios iniciales se resuelven en los caminos nuevos, una vez inicializados los datos derivados. La API legacy conserva deliberadamente su comportamiento. Es una evaluación local de esas dos amplificaciones, no una nota del backend completo ni una certificación de producción; no se releyeron métricas/OCC/logs de producción en esta reevaluación.

### Corrección posterior — límites de las lecturas indirectas

La auditoría posterior reprodujo dos fallos no cubiertos por las mediciones anteriores: desactivar una lección de 300 KB compartida por 61 cursos superaba los 16 MiB al releerla por curso; inicializar 20 fuentes con lecciones de 850 KB superaba ese límite aunque las filas paginadas fueran pequeñas. El fallo revertía la transacción; en la inicialización también se conservaba el cursor, por lo que repetir el mismo lote no resolvía el bloqueo.

Se corrigieron sin nuevas tablas, dependencias ni trabajos en segundo plano:

- El trigger de metadatos reutiliza la lección que ya recibe. Actualiza los hechos existentes y el agregado con el mismo helper de escritura que usa la sincronización de fuentes, sin releer contenido ni revalidar el historial de cada curso. Se mantiene la transacción común y el rollback de fuente y resumen.
- La inicialización valida la fila fuente actual: un informe en vivo debe existir y pertenecer al mismo curso; una fuente huérfana o incompatible se omite sin eliminar hechos respaldados por otras fuentes. No vuelve a buscar todo el historial del par curso/lección.
- La paginación nativa conserva el formato de cursor y la puerta `ready`. Sus lotes dejan margen para hidratar documentos de hasta 1 MiB: hasta tres fuentes de lecciones (lección, curso e informe), o cuatro asistencias (horario). Los lectores no se activan antes del último lote.

Pruebas de regresión con `transactionLimits: true`, usando límites reales y datos sintéticos:

| Caso | Resultado local después de corregir |
| --- | --- |
| Edición pública autorizada, lección de 300 KB y 61 cursos | 1.325.715 bytes leídos; se comprueban permisos, reintento y reactivación |
| Inicialización de fuentes en vivo; 20 lecciones de 850 KB, curso e informe también de 850 KB | Máximo por llamada ≈7,7 MB; antes se bloqueaba |
| Inicialización de fuentes pregrabadas con documentos grandes | Máximo por llamada ≈5,2 MB; antes se bloqueaba |
| Inicialización de asistencias con 20 horarios de 850 KB | Máximo por llamada ≈3,44 MB |
| Fuentes huérfanas/incompatibles y publicaciones durante la inicialización | No borran hechos válidos, no duplican conteos ni omiten publicaciones nuevas |

Las cifras miden lecturas dentro de `convex-test`, no ahorro facturado ni latencia de producción. La actualización de muchos hechos sigue teniendo un coste proporcional al número de cursos; no se promete fan-out ilimitado ni se delega a consistencia eventual. Ningún backfill se ejecutó sobre datos existentes.

Los lotes menores requieren más invocaciones puntuales para inicializar históricos; no aumentan la frecuencia de consultas del dashboard. Se conserva el ahorro de sus lectores ya inicializados y se evitan lotes que reintentan sin avanzar. Las pruebas también fuerzan un fallo antes de confirmar un lote y verifican que tanto el cursor como los conteos se revierten juntos antes del reintento.

Verificación posterior: 2.002 pruebas distintas pasan (224 unitarias, 1.032 componentes, 746 backend), más TypeScript y lint enfocado. Revisión independiente acotada de los dos hallazgos: **90 → 100/100 (+10)**, fórmula `max(0, 100 − 15×0 altos − 5×0 medios − 1×0 bajos)`. No se validaron artifacts de findings-bus ni tráfico real; no es una nota del backend completo.

La comprobación de versiones encontró versiones posteriores de Aggregate, Rate Limiter y Workflow. No se actualizaron como parte de estas dos correcciones; Aggregate 0.3.4 requiere APIs ausentes del Convex instalado, como ya se documentó arriba. Los pases de advisor/insights sobre tráfico real quedan fuera de esta validación local.

## Inventario A — Consumo visible en las cinco capturas

Todos los registros son Prod salvo los marcados Dev. Unidades y cifras transcritas tal como aparecen, con redondeo del dashboard. Los porcentajes son orientativos sobre totales mixtos, no tasas de ahorro.

### Llamadas — total 3,7 M

| Función | Llamadas |
| --- | ---: |
| whiteboardSessions.getSceneBucket | 1,2 M |
| schedule.getSessionLeadership | 380 K |
| schedule.getStudentExtensionContext | 320 K |
| presence.heartbeat | 250 K |
| schedule.getSessionStatus | 123 K |
| workflow/workpool/batchWorker/loop.loop | 120 K |
| courseChatNotifications.listUnread | 99 K |
| courseTasks.listMyPending | 82 K |
| schedule.getLiveExtensionContext | 61 K |
| schedule.listAccessibleLiveClasses | 52 K |
| presence.list | 45 K |
| systemNotifications.listUnread | 42 K |
| systemNotifications.publishUpcomingClasses (Dev) | 36 K |
| whiteboardSessions.getRealtimeWriter | 30 K |
| whiteboardSessions.getSceneManifest | 30 K |
| courseChatMessages.list | 28 K |
| schedule.getMySchedule | 28 K |
| courseNotebook.applyDelta | 28 K |
| livekit.processEgressWebhook | 27 K |
| HTTP /livekit-egress-webhook | 27 K |
| presence/batchWorker/loop.loop | 27 K |
| workflow/workpool/complete.complete | 26 K |
| eventChatNotifications.listUnread | 24 K |
| presence.studentProfile | 22 K |

### Database I/O — total 64,12 GB

| Función | I/O |
| --- | ---: |
| student.getStudentDashboardStats | 21,13 GB |
| whiteboardSessions.getSceneBucket | 10,25 GB |
| workflow/worker.runMutationWrapper | 9,43 GB |
| schedule.getSessionLeadership | 3,77 GB |
| courseChatNotifications.listUnread | 2,73 GB |
| schedule.getStudentExtensionContext | 2,51 GB |
| courseNotebook.applyDelta | 1,5 GB |
| systemNotifications.listUnread | 1,35 GB |
| classes.listCurrentCatalog | 1,03 GB |
| abekaSync.saveProgress | 976,68 MB |
| schedule.getMySchedule | 876,59 MB |
| schedule.getSessionStatus | 874,38 MB |
| eventChatNotifications.listUnread | 742,7 MB |
| schedule.listAccessibleLiveClasses | 723,53 MB |
| presence/presence.heartbeat | 696,31 MB |
| worker.runMutationWrapper | 637,93 MB |
| schedule.getLiveExtensionContext | 573,28 MB |
| classes.listChatOptions | 338,46 MB |
| courseChatMessages.list | 284,92 MB |
| classes.listFilterOptions | 224,46 MB |
| courseTasks.listMyPending | 203,92 MB |
| whiteboardSessions.getRealtimeWriter | 187,35 MB |

Los primeros tres registros representan aproximadamente el 63,6 % del I/O mostrado. Es concentración de consumo, no ahorro garantizado.

### Cómputo — total 11 GB-hours

| Función | GBh |
| --- | ---: |
| whiteboardSessions.getSceneBucket | 5,5 |
| livekit.reconcileLiveSession | 0,57686 |
| schedule.getSessionLeadership | 0,51058 |
| livekit.reconcileActiveSessions (Dev) | 0,4831 |
| schedule.getStudentExtensionContext | 0,39262 |
| livekit.reconcileActiveSessions | 0,36987 |
| livekit.processEgressWebhook | 0,32156 |
| presence.heartbeat | 0,27251 |
| schedule.listAccessibleLiveClasses | 0,16875 |
| schedule.getSessionStatus | 0,16413 |
| livekit.getToken | 0,15703 |
| student.getStudentDashboardStats | 0,14927 |
| courseChatNotifications.listUnread | 0,13649 |
| workflow/workpool/batchWorker/loop.loop | 0,13231 |
| workflow/workpool/worker.runMutationWrapper | 0,1148 |
| whiteboardSessions.getRealtimeWriter | 0,10231 |
| workflow/workpool/worker.runBatch | 0,10149 |
| whiteboardSessions.getSceneManifest | 0,09787 |
| presence/batchWorker/loop.loop | 0,09471 |
| courseTasks.listMyPending | 0,07648 |
| systemNotifications.listUnread | 0,06967 |
| schedule.getLiveExtensionContext | 0,06611 |
| HTTP /livekit-egress-webhook | 0,06091 |

### Búsqueda — total 0,00994 query-GB

| Función | qGB |
| --- | ---: |
| people.list | 0,00904 |
| classes.listCatalog | 0,00088 |
| broadcasts.list | 0,00002 |
| events.list (Dev) | 0,00001 |

La búsqueda de personas domina esta categoría pequeña; el ranking no justifica deshacer su paginación/búsqueda de servidor. Las filas redondeadas pueden no sumar exactamente el total.

### Data Egress — total 314,25 MB

| Función | Egress |
| --- | ---: |
| users.updateUserWithClerk | 115,16 MB |
| livekit.reconcileLiveSession | 63,9 MB |
| livekit.reconcileActiveSessions (Dev) | 40,6 MB |
| livekit.reconcileActiveSessions | 34,71 MB |
| livekit.getToken | 27,64 MB |
| livekit.processEgressWebhook | 17,87 MB |
| livekit.endSession | 4,86 MB |
| livekit.cleanupActivation | 3,09 MB |
| livekit.toggleRecording | 1,23 MB |
| users.createUserWithClerk | 1,14 MB |
| livekit.setParticipantScreenSharePermission | 907,1 KB |
| livekit.notifyRoomAdministratorLeft | 827,09 KB |
| livekit.getToken (Dev) | 590,51 KB |
| livekit.startRecording | 502,21 KB |
| abekaActions.progress | 462,84 KB |
| livekit.endSession (Dev) | 257,21 KB |
| livekit.reconcileLiveSession (Dev) | 175,68 KB |
| livekit.cleanupActivation (Dev) | 105,75 KB |

## Inventario B — Contención

Captura de Health: todas las filas visibles son warnings de reintento por conflicto, no errores definitivos.

| Función | Tabla | Captura | Insights recientes |
| --- | --- | ---: | ---: |
| presence.heartbeat | workers | 162 | 164 |
| courseChatNotifications.markRead | systemNotifications | 82 | 78 |
| courseChatNotifications.publish | systemNotifications | 54 | 54 |
| liveRoomLifecycle.requestReconciliation | liveRoomActivations | 26 | 26 |
| liveRoomLifecycle.requestReconciliation | no identificada | 26 | 26 |
| presence.heartbeat | presence | 15 | 15 |
| recordings.updateFromWebhook | recordings | 29 | 29 |
| presence.heartbeat | workerState | 4 | 3 |
| schedule.cleanupExpiredWhiteboardSession | whiteboardSessions | 2 | 2 |
| schedule.claimLiveSessionEnd | classSchedule | 2 | 2 |
| schedule.updateLiveLifecycleState | classSchedule | 1 | 1 |
| systemNotifications.markAllRead | systemNotifications | 1 | 1 |
| schedule.submitSessionClosure | classSchedule | 1 | 1 |
| schedule.claimLiveSessionEnd | class_sessions | 1 | 1 |
| schedule.claimLiveSessionEnd | liveRoomActivations | 1 | 1 |
| schedule.cleanupExpiredWhiteboardSession | whiteboardSceneManifests | 1 | 1 |
| liveRoomLifecycle.requestReconciliation | classSchedule | 10 | 10 |
| presence.disconnect | presence | 12 | 12 |
| schedule.logStudentPresence | classSchedule | 10 | 9 |
| liveRoomLifecycle.finishReconciliation | liveRoomActivations | 14 | 14 |
| presence/batchWorker.loop.loop | sessions | no visible | 1.009 |
| presence/batchWorker.loop.loop | workerState | no visible | 41 |
| presence/batchWorker.monitor | workerState | no visible | 14 |
| presence/batchWorker.monitor | workers | no visible | 3 |
| presence.disconnect | sessions | no visible | 9 |
| workflow/workpool/batchWorker.loop.loop | pendingCompletion | no visible | 11 |
| workflow/workpool/batchWorker.loop.loop | pendingStart | no visible | 29 |
| workflow/workpool/worker.runMutationWrapper | workers | no visible | 27 |
| workflow/workpool.complete.complete | workers | no visible | 2 |

Lectura oficial: `pnpm exec convex insights --deployment blessed-wombat-104 --details --json`. Resultado: 29 registros, todos `occRetried`; en esa respuesta no aparecieron `occFailedPermanently` ni avisos/límites de lecturas. No certifica ausencia de otros errores. [Dashboard de producción](https://dashboard.convex.dev/d/blessed-wombat-104?view=insights).

La API de insights usa una ventana reciente de unas 72 horas; no es la ventana de consumo ni una copia inmutable de la captura. No sumar filas/tablas potencialmente solapadas como número de peticiones fallidas, ni sumar captura y API. No se guardan aquí IDs privados de documentos ni request IDs.

## Inventario C — PostHog

Consulta de solo lectura: fechas explícitas `2026-10-24` a `2026-11-06` (solo datos existentes al consultar el día 5), todos los estados, cuentas de prueba incluidas, orden por usuarios; tres páginas, **45 grupos**. No corresponde al filtro «Last 7 days / Active» de la captura. Personas pueden repetirse entre grupos: no sumar como usuarios únicos afectados.

### Grupos actuales más relevantes

| Grupo | Ocurrencias | Usuarios | Último día observado |
| --- | ---: | ---: | --- |
| Observability test (nombre del grupo; muestra ResizeObserver) | 52 | 23 | nov 5 |
| removeChild, primer grupo | 50 | 20 | nov 5 |
| Signal connection room timeout | 28 | 12 | nov 4 |
| Client initiated disconnect | 12 | 8 | nov 5 |
| livekit:getToken, conexión perdida en vuelo | 9 | 7 | nov 5 |
| Signal connection invalid (redactado) | 9 | 7 | nov 4 |
| Negotiation timed out | 8 | 5 | nov 5 |
| removeChild, segundo grupo | 17 | 5 | nov 5 |
| Clerk script failed to load | 5 | 5 | nov 4 |
| Cancelled publication by calling unpublish | 4 | 4 | nov 5 |
| ChunkLoadError 1625 | 4 | 4 | nov 5 |
| Signal Load failed | 19 | 4 | nov 4 |
| Client initiated disconnect, segundo grupo | 4 | 4 | nov 4 |
| Whiteboard readiness timed out | 5 | 3 | nov 4 |
| NotAllowed request denied | 5 | 3 | nov 4 |
| Publication local track timed out | 2 | 2 | nov 5 |
| Could not establish pc connection | 4 | 2 | nov 4 |
| Peer connection is closed | 2 | 2 | nov 4 |
| Publishing rejected, engine not connected | 2 | 2 | nov 3 |
| organizations:getSwitcherOptions, primer grupo | 154 | 2 | nov 3 |
| organizations:getSwitcherOptions, segundo grupo | 41 | 2 | nov 3 |
| Failed to fetch en whiteboard-image | 2 | 2 | nov 2 |
| getSceneManifest, Server Error | 3 | 2 | nov 2 |
| Server Action unavailable | 2 | 2 | oct 26 |

Otros 21 grupos, de un usuario cada uno: Failed to fetch (1), Clerk chunk 344 (1), getMySchedule Server Error (1), RTCPeerConnection closed (1), companion getToken permiso denegado (4), Clerk chunk 9573 (1), otros dos getSwitcherOptions (32 y 11), whiteboard chunk 2492 (3), RequiredFieldMark no definido (1), Tabs no definido (1), broadcasts:teachers no disponible (1), Load failed de diagnóstico (1), classroom chunk 5061 (2), events:listTeacherOptions no disponible (3), chunk 9280 (1), events:listForCalendar argumento paginationOpts (1), usePaginatedQuery no definido (1), getSwitcherOptions antiguo (8), dos grupos beginPreview/retireIfEmpty (3 y 3).

Algunos frames son bundles de desarrollo/Turbopack y errores antiguos de contratos ya modificados en local. No clasificarlos como regresiones vigentes de producción sin release/entorno y reproducción. Tampoco dar por resuelto un issue solo porque su causa parezca histórica.

### Diferencia con la captura de PostHog

La captura muestra: cancelación de publicación 1/1; negociación 5/3; removeChild 24/13; getToken en vuelo 6/4; Failed to fetch 1/1; otro removeChild 10/5; timeout de publicación 1/1; desconexión cliente 8/6; test de observabilidad 19/13; chunk 1625 2/2. Formato: ocurrencias/usuarios. Son otra ventana y otro filtro; no son una serie antes/después de optimización.

Enlaces de seguimiento:

- [removeChild](https://us.posthog.com/project/627378/error-tracking/01a178bb-c842-7a23-805a-b954fba4e6b2)
- [getToken interrumpido](https://us.posthog.com/project/627378/error-tracking/01a178be-3886-7cf0-8805-8c653329b49e)
- [Readiness de whiteboard](https://us.posthog.com/project/627378/error-tracking/01a17e68-6836-7602-a709-47492b66a4c8)
- [Agrupación titulada test](https://us.posthog.com/project/627378/error-tracking/01a10971-002b-7bf0-9fe4-54664f5fe87d)

## Referencias oficiales y decisiones

- [Convex: buenas prácticas](https://docs.convex.dev/understanding/best-practices): índices y read sets pequeños. `.filter()` tras un índice no significa automáticamente escanear toda la tabla; sí lee los candidatos antes de descartarlos. Aplicar el criterio al ámbito real.
- [Convex: filosofía](https://docs.convex.dev/understanding/zen): mantener consultas/mutaciones ligeras y aprovechar reactividad; no añadir cachés privadas paralelas por defecto.
- [Convex: métricas de uso](https://docs.convex.dev/production/usage-limits): unidades y definición de I/O, compute y egress. Ver condiciones del plan antes de convertirlas en dinero.
- [Convex: tracking de consumo](https://docs.convex.dev/platform-apis/track-usage) y [log streams](https://docs.convex.dev/production/integrations/log-streams/): bytes de lectura/escritura, compute, caché y OCC para experimentos comparables. La activación/configuración de una integración sería otro cambio autorizado, no parte de esta lectura.
- [Convex: panel de funciones](https://docs.convex.dev/dashboard/deployments/functions): distinguir ejecuciones y reutilización de caché.
- [PostHog: stack traces](https://posthog.com/docs/error-tracking/stack-traces) y [gestión de issues](https://posthog.com/docs/error-tracking/managing-issues): revisar eventos y simbolicación antes de agrupar, ignorar o concluir causa.

El baseline y el diseño de CVX-01/CVX-02 dieron paso a la implementación local documentada arriba. Pendiente de activación: publicación autorizada, índices disponibles e inicializaciones explícitas. Pendiente antes de prometer ahorro: ventana y tarifa verificadas, comparación con igual carga y comprobación posterior de consumo real.

## Continuación local — contexto de pizarra y clase (2026-11-06)

Las nuevas capturas confirman el ciclo **24 de octubre–24 de noviembre de 2026**, todavía parcial al consultar el 6 de noviembre. Muestran 4 M de llamadas y 69,96 GB de Database I/O; no constituyen una ventana posterior comparable ni demuestran una regresión respecto del recorte inicial. Prod y Dev siguen mezclados. Valores destacados: dashboard 22,86 GB I/O; `getSceneBucket` 1,3 M de llamadas, 10,96 GB I/O y 5,7 GBh; liderazgo 410 K llamadas y 4,07 GB I/O; contexto de extensión de estudiante 345 K llamadas y 2,71 GB I/O; badges de chats 2,98 GB I/O; wrapper de workflow 10,63 GB I/O.

Se corrigieron dos duplicaciones comprobadas, sin cambiar contratos públicos:

1. `getLiveKitAccessData` reutiliza clase, campus y currículo ya leídos para resolver la institución de liderazgo. `getSessionLeadership` reutiliza el rol y la condición de profesor principal que devuelve ese acceso. Se mantienen separadas las precedencias institucionales de administración y liderazgo; no se amplían permisos.
2. `requireLiveWhiteboardReader` devuelve el contexto de sala autorizado. Los lectores de escena, archivos y escritor lo reutilizan en la misma transacción; la resolución de la hoja presentada no vuelve a buscar el horario. Las grabaciones autenticadas solo por token conservan la resolución desde la base de datos. Se verifican sala, curso, hoja y archivo como antes; no se almacena autorización entre peticiones.

### Medición reproducible de lectura

Las nuevas regresiones de `sessionLeadership.test.ts` y `courseNotebook.test.ts` fallaron antes de la corrección y pasan después. Se usa `convex-test`, con documentos de contexto de 200.000 caracteres para hacer visible la amplificación; son escenarios sintéticos, no el tamaño medio de producción.

| Consulta / usuario | Bytes leídos antes | Bytes leídos después |
| --- | ---: | ---: |
| Liderazgo / estudiante | 1.005.094 | 603.158 |
| Liderazgo / profesor | 805.338 | 403.120 |
| Liderazgo / principal | 805.356 | 403.136 |
| Bloque de hoja presentada / estudiante | 402.657 | 202.353 |

Las consultas no escriben documentos. La prueba conjunta de bloque presentado comprueba grabación por token, imágenes, cursor tras una edición y rechazo de un lector ajeno. La revisión independiente no encontró regresiones y ejecutó además las pruebas de eventos y salas. La evaluación acotada de estas dos duplicaciones pasó de 98 a 100/100; no es una certificación de todo el backend ni de producción.

Validación final local: `pnpm test`, **2.056 pruebas pasan** (235 unitarias, 1.071 de componentes y 750 de Convex); TypeScript y ESLint de los seis archivos de código/pruebas modificados, sin errores. La suite de componentes conserva avisos del entorno de pruebas (`TimeoutNaNWarning` y `Window.focus` no implementado), sin fallos; no se han silenciado.

### Chrome y límites del resultado

`pnpm audit:whiteboard:hot-bucket`: Chrome 156.0.8078.80, Excalidraw real, 2.000 elementos, 12 imágenes y 120 ediciones del mismo bloque. Sin errores de página; versión final 122; cero snapshots completos del bloque durante las ediciones; 398.765 bytes JSON durables recibidos. Latencia visual modelada p50 77 ms, p95 89 ms, máximo 102 ms.

El ensayo usa transporte local HTTP/SSE, lecturas/escrituras modeladas de 50 ms, CPU del lector 4× y emulación de red 1 Mbps/80 ms tras la carga. No prueba WebRTC/SFU, despliegues reales ni una llamada con vídeo. No permite atribuir una mejora de latencia a estas simplificaciones de backend: estas se demuestran por separado mediante bytes leídos.

No se cambian intervalos, suscripciones, entrega rápida, persistencia agrupada, cursores, recuperación, imágenes, borradores, historial/deshacer, QR, puntero, seguimiento ni grabaciones. No se añaden tablas, índices, dependencias o inicializaciones para este bloque. No se ha desplegado ni modificado información de negocio en desarrollo o producción.

**Siguiente experimento:** medir ejecuciones e invalidaciones por participante-minuto y por disparador sobre las dependencias compartidas. Reutilizar contexto reduce trabajo por ejecución, pero no elimina esas dependencias ni demuestra menos ejecuciones. El guard de no-op del ciclo de vida ya evita escrituras sin cambios: no asumir que cada reconciliación periódica invalida todos los bloques. Conservar CVX-05/CVX-06 como siguientes investigaciones, sin introducir cachés privadas, proyecciones o cambios de temporización antes de medir.

## Continuación local — lector estable de líder para estudiantes (2026-11-06)

La evaluación delegada encontró un hallazgo bajo adicional de CVX-04: `StudentClassroomUI` solo consume `.leader` para identificar al responsable entre los participantes LiveKit, pero consultaba `getSessionLeadership` con un argumento `now` nuevo cada 15 segundos, tanto en clases como en eventos. El endpoint completo también devuelve permisos temporales e información de transferencias que el alumno no utiliza.

### Corrección y separación de responsabilidades

- Se añaden `schedule.getSessionLeader({ roomName })` y `eventRoom.getSessionLeader({ roomName })`, sin reloj, historial de transferencias ni permisos temporales en su resultado. No se sustituye la API detallada ni se congela artificialmente su hora.
- El acceso de clases se extrae a `getLiveKitAccessContext`, reutilizado por el lector estable y el wrapper temporal existente. Conserva exactamente la autorización y las precedencias institucionales; los demás consumidores mantienen estado temporal y zona horaria.
- Eventos reutiliza `canAccessEvent`, el mismo control que determina `getEventRoomAccess.authorized`. No calcula roles de administración para una lectura que solo necesita observar.
- `sessionLeaderValidator` y `getSessionLeaderData` son compartidos por clases, eventos y los lectores completos existentes. Se conserva el mismo resultado de líder, sin duplicar serialización.
- Solo el consumidor de estudiantes cambia a la lectura estable. El personal mantiene `getSessionLeadership` y su reloj para relevo, transferencia y caducidad. Los avisos de extensión del estudiante conservan su reloj. Los clientes antiguos siguen funcionando.
- El resultado retenido se aísla por tipo de sala y nombre; un `null` confirmado elimina el líder anterior. La actualización de perfil, cambio de líder y retirada de acceso siguen dependiendo de sus fuentes canónicas, sin caché privada ni tablas nuevas.

### Evidencia antes/después y validación

Dos regresiones de componentes, una por clase/evento, fallaron antes de implementar y pasan después. Simulan 90 actualizaciones de un segundo sobre la UI real de estudiantes, registrando argumentos de `useQuery`: la identidad pasa de siete claves temporales a **una clave estable**; el contexto de extensión conserva siete claves. Esto mide configuración del consumidor, **no siete ejecuciones facturadas ni cache hits del servidor**.

Fixture local con currículo de 200.000 caracteres y sesión iniciada: lectura completa de liderazgo del estudiante **603.708 bytes**; lectura estable **402.829 bytes**, cero documentos escritos. La comparación es contra la versión local ya optimizada de la sección anterior, no contra la implementación histórica inicial ni el promedio de producción.

Pruebas nuevas/ampliadas: equivalencia con `.leader` del endpoint detallado para estudiante/profesor/principal; ausencia de líder; acceso anónimo y ajeno; clases institucionales y privadas; revocación de inscripción, ámbito/audiencia y perfil inactivo; transferencias reales de clases y eventos; cambio de perfil; actualización sin tick; aislamiento al cambiar de sala. Las pruebas existentes de reapertura, relevo y permisos temporales siguen pasando.

Validación: `pnpm test`, **2.061 pruebas pasan** (235 unitarias, 1.075 de componentes y 751 de Convex); TypeScript y `pnpm lint`, sin errores. Las aserciones adicionales de catálogo también pasan en su ejecución focalizada. Revisión independiente: 96 pruebas de liderazgo/eventos pasan. Evaluación acotada del hallazgo nuevo: **99 → 100/100**, fórmula `max(0,100 − 15×0 − 5×0 − 1×0)`; no es una nueva puntuación del backend completo. Los avisos ya documentados del entorno de componentes no se han ocultado.

### Lo que no cambia y siguiente prioridad

No se modifican el transporte de la pizarra o vídeo, cursores, imágenes, borradores, guardado, QR, puntero, seguimiento, grabación ni recuperación. No se crean tablas, índices o dependencias. No se despliega ni se escriben datos de negocio en ningún entorno. La publicación posterior deberá incluir el backend nuevo antes del frontend que lo consume.

La pizarra no mostró otra causa confirmada que justifique una reestructuración: editar un bloque existente mantiene sus dependencias acotadas al journal/partes de ese bloque; añadir un bloque nuevo sí modifica el manifiesto. Permisos, horario y selección de hoja son dependencias compartidas necesarias. `logStudentPresence` escribe en `class_sessions`, no en el horario; el reconciliador ya evita parches sin cambios. Se conserva como investigación la atribución de invalidaciones con tráfico real, sin simularla mediante `convex-test`.

Siguiente bloque de investigación: CVX-05 (notificaciones/Presence, reintentos por operación y tamaño del read set) y CVX-06 (atribuir I/O del wrapper a workflows concretos antes de segmentarlos). Sigue pendiente la comparación de consumo real tras una publicación autorizada e inicialización de los resúmenes previos. Menos claves forzadas por el reloj y lecturas menores deberían reducir trabajo; no hay una cifra demostrada de ahorro de factura o latencia real todavía.

## Continuación local — reutilización del ámbito institucional (2026-11-06)

La revisión delegada confirmó una duplicación baja adicional: `getLiveKitAccessContext` ya carga currículo y campus, pero `canAccessInstitutionalSchedule` volvía a leerlos al comprobar la admisión del estudiante o personal visitante. El helper ahora admite esos documentos como contexto opcional interno, exclusivamente dentro de la misma transacción. Los otros consumidores conservan sus lecturas originales; no se añade caché compartida, API pública, tabla, índice ni dependencia.

Se conserva la precedencia institucional `campus.schoolId ?? curriculum.schoolId`, distinta de las precedencias de administración y liderazgo. Un documento ya leído como `null` no se vuelve a consultar. La resolución de zona horaria de las clases antiguas sigue utilizando su helper existente, sin cambiar reglas temporales.

La prueba de presupuesto falló antes del cambio: **402.829 bytes** para el lector estable, frente al nuevo límite de 250.000. Después lee **202.386 bytes**. En el mismo fixture con currículo de 200.000 caracteres, el lector completo pasa de **603.708 a 403.265 bytes**. Cero documentos escritos. Son medidas sintéticas de trabajo por ejecución, no menos invalidaciones, menos ejecuciones facturadas ni un porcentaje de ahorro real.

Se añaden cuatro casos conjuntos con documentos presentes, campus ausente, currículo ausente y ambos ausentes. Comparan acceso con/sin contexto para matrícula privada, acceso institucional por grado, profesor visitante, ámbito ajeno y revocación de matrícula/rol. También verifican la precedencia ante un `class.schoolId` discrepante y que no se repitan las lecturas de documentos nulos. Las pruebas públicas existentes mantienen transferencias, actualización del líder y revocación de acceso.

Validación local: `pnpm test`, **2.065 pruebas pasan** (235 unitarias, 1.075 de componentes y 755 de Convex), TypeScript y ESLint de los archivos modificados sin errores. Persisten los avisos del entorno de componentes ya documentados, sin ocultarlos. No se modifica transporte, persistencia de dibujos/imágenes, borradores, QR, puntero, seguimiento ni grabaciones. No se despliega ni se modifican datos de negocio. CVX-05 y CVX-06 continúan como siguientes prioridades; no se ha medido el ahorro de producción.

Reevaluación independiente: 55 pruebas adicionales de liderazgo/acceso pasan; evaluación acotada **99 → 100/100**, `max(0, 100 − 15×0 − 5×0 − 1×0)`. Solo evalúa esta duplicación, no certifica el backend completo. Se mantiene el patrón de helpers compartidos y autorización del servidor de las [buenas prácticas oficiales de Convex](https://docs.convex.dev/understanding/best-practices), sin caché propia de permisos.

## Continuación local — zona horaria sin repetir ámbito (2026-11-06)

Se elimina la duplicación residual en `getLiveKitAccessData`: las clases sin zona horaria propia resolvían la configuración institucional leyendo de nuevo currículo y campus. `getClassTimeZone` admite ahora el contexto opcional que ya utiliza la admisión institucional. El tipo `ClassScopeDocuments` se define una vez en el módulo existente de zona horaria y se comparte mediante un import de tipo; no se crea otro loader, módulo de caché ni tabla.

Se mantienen el retorno temprano por `classData.timeZone`, la escuela seleccionada mediante `campus?.schoolId ?? curriculum?.schoolId` y el resultado `campus?.timeZone ?? school?.timeZone`. No se usa el campo legacy `classData.schoolId` para esta decisión. Los documentos nulos confirmados no se consultan otra vez; los demás consumidores que no pasan contexto mantienen el fallback anterior. El contexto existe solo en la transacción que lo cargó, por lo que no congela configuraciones entre peticiones.

La regresión de presupuesto falló antes: liderazgo temporal del estudiante **402.715 bytes**, por encima del límite de 250.000. Tras la corrección, el fixture local con currículo de 200.000 caracteres mide:

| Consulta de liderazgo temporal | Antes de esta corrección | Después |
| --- | ---: | ---: |
| Estudiante | 402.715 bytes | 202.272 bytes |
| Profesor | 403.120 bytes | 202.677 bytes |
| Principal | 403.136 bytes | 202.693 bytes |

En el fixture de sesión ya iniciada, el endpoint completo pasa de **403.265 a 202.822 bytes**; el lector estable conserva **202.386 bytes**, sin cambios. La prueba de estado temporal público mide **202.020 bytes**. Ninguna consulta escribe documentos. Son lecturas sintéticas por ejecución: no mediciones de latencia real, invalidaciones evitadas ni ahorro de factura.

Se añaden nueve variantes de zona horaria: curso, campus, institución del campus, curso sin campus, campus/currículo ausente, ambos ausentes, institución ausente e institución sin configurar. Comparan el helper con/sin contexto, con escuelas discrepantes, y comprueban el retorno temprano y la ausencia de relecturas. Una prueba pública conjunta cambia la zona de institución, campus y curso entre transacciones; verifica la configuración vigente, la recuperación por currículo al faltar el campus y el fallback final UTC.

Validación local: `pnpm test`, **2.075 pruebas pasan** (235 unitarias, 1.075 de componentes, 765 de Convex), TypeScript y ESLint de los cinco archivos de código/pruebas modificados, sin errores. Los avisos conocidos del entorno de componentes permanecen visibles. Sin cambios de permisos, contratos públicos, transporte, persistencia de dibujos/imágenes, borradores, QR, puntero, seguimiento o grabaciones. Sin despliegues ni modificaciones de datos de negocio. La investigación de notificaciones/Presence y atribución del I/O de workflows continúa pendiente.

Reevaluación delegada: **99 → 100/100** para este hallazgo, `max(0, 100 − 15×0 − 5×0 − 1×0)`; 69 pruebas focalizadas adicionales pasan. No certifica el backend completo. Advisor/insights de runtime no se ejecutan en esta corrección local sin despliegue ni consultas de producción.
