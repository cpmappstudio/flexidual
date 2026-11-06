# Progreso de reproducción de pregrabaciones

Registra cobertura por estudiante y archivo. No registra asistencia, no cierra
informes y no modifica las lecciones enseñadas. Los datos importados de Abeka
siguen separados.

## Consulta del progreso

El perfil del estudiante muestra un botón de vídeo solo en los cursos que el usuario
puede consultar. La capacidad se resuelve en la consulta existente del perfil,
reutilizando los permisos de curso, sin una suscripción adicional por tarjeta.
Abre un informe de pregrabaciones publicadas con fecha de sesión, porcentaje visto y
último avance guardado. Esa fecha cambia solo al guardar cobertura nueva, no al
reproducir de nuevo un tramo ya visto. Reutiliza la tabla existente y la presentación de porcentaje
de Abeka, extraída a `ProgressPercentage`; no convierte vídeos en lecciones Abeka
ni inventa su historial diario. Los vídeos sin duración verificada se distinguen
de los vídeos verificados con 0 % visto.

`videoViewingProgress.courseReport` comprueba permisos de perfil, acceso al curso,
inscripción e identidad activa en cada página. Consulta por el índice de curso,
publicación y fecha de sesión, y resuelve solo los vídeos de esa página y el
progreso del estudiante solicitado. No devuelve cobertura, claves de almacenamiento
ni enlaces privados. Los registros antiguos sin publicación siguen ocultos.

Se cargan diez sesiones por página y más bajo petición. No se ordena únicamente
la página visible ni se calcula un porcentaje global parcial. La suscripción
solo existe mientras está abierto el informe; el progreso privado no usa caché
compartida de Next.js. Las actualizaciones reflejan los checkpoints confirmados,
no cada segundo de reproducción. La consulta no añade escrituras a esos checkpoints.

## Responsabilidades

- `lib/observe-video-progress.ts` observa el vídeo nativo. Cuenta únicamente los
  periodos con documento visible o vídeo en Picture-in-Picture (API estándar y
  presentación nativa de Safari). Usa rangos `played`, nunca `buffered`, y corta
  el intervalo al buscar, pausar, esperar datos o cambiar de visibilidad.
- `lib/video-progress.ts` representa cobertura en bits de un segundo. Uniones y
  diferencias son operaciones puras: repetir, reordenar o reenviar un fragmento
  no incrementa artificialmente el progreso. Los bordes se redondean hacia dentro;
  puede subestimar fracciones de segundo de segmentos cortos. No es precisión
  temporal de laboratorio ni evidencia de atención.
- `lib/video-progress-session.ts` agrupa los checkpoints cada 60 segundos, con
  envío adicional al pausar, terminar, ocultar o cerrar. El buffering por sí solo
  no fuerza una escritura. Mantiene un envío en curso y conserva cambios nuevos
  hasta su confirmación. Las denegaciones de permisos detienen los reintentos;
  los fallos temporales usan espera creciente.
  Al cerrar, si no pudo respaldar pendientes en IndexedDB, conserva hasta tres
  reintentos finales respetando `retryAfter`. Se detienen al confirmar, cambiar
  de usuario/sesión o perder permisos; no mantiene un intervalo del reproductor.
- `lib/video-progress-storage.ts` conserva pendientes en IndexedDB, con mezcla y
  confirmación dentro de una transacción para no sobrescribir otras pestañas.
  La clave estable incluye backend, usuario y vídeo; no depende de recibir un ID
  de progreso del servidor ni del ID de sesión de login. Los avances se conservan
  aunque falle la preparación inicial. Los pendientes del formato anterior se
  trasladan a esa clave en una única transacción, sin borrarlos si falla la cuota.
  Borra únicamente cobertura confirmada. Un fallo de cuota no impide el guardado
  online desde memoria. Con almacenamiento lleno **y** sin red no puede garantizar
  recuperación tras cerrar o matar el navegador.
- El hook integra ese flujo una sola vez en `PrivateVideoPlayer`. El ámbito de
  autenticación invalida respuestas tardías de otra cuenta. Las grabaciones
  LiveKit, las vistas previas del personal y los tutores no generan progreso.

## Reanudación y navegación del estudiante

`lib/video-playback-navigation.ts` separa la navegación de la evidencia de
reproducción. Reutiliza el vídeo nativo y la cobertura de la sesión: no introduce
otro reproductor, endpoint ni escrituras adicionales a Convex.

La última posición se conserva en IndexedDB por backend, usuario y archivo, solo
en ese navegador. Se guarda junto a los respaldos existentes y al pausar/cerrar,
no en cada evento `timeupdate`. La cobertura confirmada se conserva como caché
local para navegar durante fallos de red; no se convierte de nuevo en pendientes
ni se reenvía como progreso nuevo. Se reutiliza el almacén `pending` con claves
array `["playback", id]`, distintas de los IDs string de los pendientes. No se
sube la versión de IndexedDB, por lo que las pestañas antiguas pueden seguir
abriendo y escribiendo en la versión 1. Los navegadores que ya usaron la anterior
implementación local de versión 2 conservan su almacén `playback` y sus datos;
no se baja su versión ni se necesita migrarlos.

Al abrir se restaura la posición antes de habilitar los controles. Si no existe
marcador se usa el primer segundo no visto. El marcador nunca permite saltarse un
hueco: se limita al prefijo continuo de cobertura conocida, no al porcentaje ni
al máximo instante visitado. Al rellenar un hueco antiguo se habilitan de inmediato
los tramos posteriores ya vistos. Se puede retroceder libremente; una cobertura
completa permite todos los saltos. Una posición de fin con cobertura completa
inicia una nueva reproducción desde cero.
Una copia de cobertura con `updatedAt: 0` no representa una posición elegida por
el usuario. Cerrar antes de terminar la preparación no convierte ese cero inicial
en un marcador válido. Un retroceso intencional hasta cero sí se conserva porque
tiene la fecha del evento real.

La búsqueda nativa no es cancelable: se corrige `currentTime` en `seeking`. El
observador sigue cortando la evidencia en cada búsqueda, también en las corregidas.
Las renovaciones del enlace privado conservan la posición actual sin volver a
aplicar el marcador. No se restringen las vistas previas del personal ni las
grabaciones de una transmisión. Es una política de navegación de FlexiDual,
no una API de permisos de HTML ni una garantía contra manipulación del cliente.

Un error de preparación usa la caché disponible; una preparación bloqueada libera
los controles después de ocho segundos sin esperar indefinidamente. Una respuesta
tardía ya no reposiciona ese reproductor. Si no hay caché comienza desde cero y
permite avanzar a medida que se reproduce. Con cuota llena sigue funcionando el
guardado online; no se garantiza recordar la posición local exacta. Los marcadores
de escrituras tardías se comparan por la fecha del evento capturado, en una
transacción, para no sustituir la posición de una pestaña más reciente.

## Backend y permisos

`videoViewingProgress` contiene un documento por vídeo y estudiante, con índice
`by_videoId_and_studentId`, cobertura, duración verificada, tiempo cubierto y fecha
del último avance. No se escribe un evento por segundo ni un contador compartido
en el curso, sesión o perfil. El registro se crea al preparar el seguimiento de
una pregrabación abierta por un estudiante autorizado.

Cada checkpoint vuelve a comprobar identidad, inscripción vigente, curso activo,
vídeo vigente, publicación y hora de inicio del servidor. El ID del registro es
un recurso con propietario, no una identidad aceptada del cliente. Otro usuario
no puede escribirlo ni siquiera después de un cambio de cuenta durante un envío.
Una cuenta desactivada, eliminada o sin autenticar recibe `PERMISSION_DENIED`
desde el acceso compartido del vídeo: detiene reintentos sin borrar pendientes.
Al recuperar autorización y reabrir el reproductor, el flujo existente los recupera.
Los bytes y bits sobrantes se validan; la cobertura se combina atómicamente.
El componente existente de límites de frecuencia admite 12 checkpoints/minuto,
con capacidad de ráfaga de 24 por usuario. La cadencia normal es uno/minuto más
salidas y pausas; el límite protege frente a clientes defectuosos o manipulados.
Antes de analizar la duración de un vídeo antiguo, el mismo componente reserva
presupuesto por archivo (2/minuto, capacidad 1) y estudiante (4/minuto, capacidad
2). Las reservas concurrentes se resuelven antes de leer R2. Los archivos ya
verificados no consumen ese presupuesto; el cliente respeta `retryAfter`.

La cobertura ocupa 450 bytes para una hora y hasta 5.400 bytes para doce horas,
sin contar metadatos ni índices. Un checkpoint puede devolver la cobertura
confirmada completa para eliminar pendientes de otras pestañas. Las actualizaciones
sin avance no reescriben el documento. Una hora continua tiene aproximadamente
60 checkpoints, no una promesa de coste monetario ni una medición en producción.

## Duración y archivos existentes

MP4Box.js (GPAC), solo en el backend Node, lee metadatos mediante peticiones Range
de hasta 256 KiB. Salta los datos de medios y limita la lectura total a 8 MiB.
Las nuevas subidas verifican duración antes del commit; `verifiedDurationMs` es
opcional y no modifica la duración declarada ni requiere migrar archivos previos.

Para archivos antiguos sin verificación, `prepareProgress` la realiza al abrir
el reproductor, **en paralelo** a la emisión/reproducción del enlace privado.
Se conserva el resultado en el archivo para no analizarlo por cada checkpoint.
Un contenedor sin duración verificable dentro del presupuesto sigue pudiendo
reproducirse, pero no inventa un porcentaje a partir de la declaración del cliente.
El reproductor avisa si el progreso no se confirma. No hay transcodificación ni
descarga completa del vídeo para medir progreso.
La incompatibilidad determinista del contenedor se conserva en el archivo como
`progressDurationUnavailable`, evitando repetir el mismo análisis en cada apertura.
Los fallos de red no activan esa marca y siguen siendo reintentables con presupuesto
acotado. Esa marca no cambia los permisos ni impide reproducir o reemplazar el vídeo.

El progreso pertenece al ID inmutable del archivo. Renovar su URL no lo reinicia;
reemplazarlo crea progreso distinto. Tras eliminar el objeto retirado, el flujo
existente encola limpieza de progreso en lotes de 100. No se conservan informes
históricos de visualización de vídeos eliminados en esta fase.

## Verificación

- `pnpm exec tsx --test tests/video-progress.test.ts`
- `pnpm exec vitest run convex/videoViewingProgress.test.ts convex/classSessionVideoStorage.test.ts`
- `pnpm exec vitest run --config vitest.components.config.mts tests/video-progress-session.test.tsx tests/recording-player.test.tsx`
- `pnpm exec node scripts/audit-video-progress-browser.mjs`

La última prueba usa Chrome e IndexedDB reales para concurrencia, confirmaciones,
aislamiento de claves, convivencia con una pestaña versión 1, compatibilidad con
datos de versión 2, migración atómica de pendientes, preparación fallida antes de
recibir ID, cierre durante la preparación, recuperación tras recarga y error de cuota
y `retryAfter` simultáneos. Una muestra PCM local en el elemento de vídeo comprueba
reproducción/rangos/eventos nativos, reanudación entre aperturas y corrección de
saltos, sin descargar medios ni crear datos en la aplicación. No sustituye una
prueba de MP4 y Picture-in-Picture en dispositivos reales con R2/Convex.

## Referencias

- [HTMLMediaElement.played](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/played)
- [HTMLMediaElement.currentTime](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime)
- [Evento seeking](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/seeking_event)
- [Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event)
- [API PiP](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API)
- [Presentación de Safari](https://developer.apple.com/documentation/webkitjs/htmlvideoelement/1631913-webkitpresentationmode)
- [MP4Box.js](https://github.com/gpac/mp4box.js)
- [xAPI Video: segmentos y progreso](https://github.com/adlnet/xapi-authored-profiles/blob/master/statement_data_model.md)
- [Mutaciones y reintentos de Convex](https://docs.convex.dev/client/react/overview#retries)

Se reutilizan las APIs oficiales y los permisos de la aplicación. La granularidad
de un segundo y el checkpoint de un minuto son políticas de FlexiDual, no valores
obligatorios de un estándar. No se habilita Cache Components para progreso privado.
