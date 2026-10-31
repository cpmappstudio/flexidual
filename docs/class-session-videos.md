# Pregrabaciones por sesión

Una sesión programada puede tener una pregrabación además de sus grabaciones de
LiveKit. Las dos fuentes se muestran en el reproductor compartido; no se cambia
el historial de grabaciones, el informe de clase ni el cálculo de asistencia.

## Responsabilidades

- `convex/classSessionVideos.ts` y `convex/model/classSessionVideos.ts` controlan
  autorización, reserva, sustitución, publicación y retirada.
- `convex/classSessionVideoStorage.ts` firma operaciones multipart S3/R2, valida
  el archivo terminado y elimina objetos retirados. Solo se ejecuta en Node.
- `lib/upload-class-session-video.ts` envía fragmentos directamente del navegador
  al almacenamiento privado: 8 MiB por fragmento, dos envíos simultáneos, firmas
  agrupadas de hasta ocho partes y reintentos acotados de las partes fallidas.
- `components/recording-player-modal.tsx` reutiliza el reproductor y solicita un
  enlace privado únicamente para la pregrabación seleccionada. No precarga los
  vídeos de una lista ni depende de una caché compartida de Next.js.

La interfaz compartida vive en `components/classroom/session-prerecorded-*` y se
abre desde el evento del calendario o las próximas sesiones del curso. Solo carga
el contexto de la sesión seleccionada; la vista previa del profesor se inicia
al pulsar «Ver vídeo», sin descargar vídeos al recorrer el calendario.

La subida incluye el selector de lecciones compartido con el cierre de clase
(`SessionLessonPicker`), progreso, cancelación de la transferencia y reemplazo
seguro. Durante la confirmación final se bloquean cancelación y cierre: esa acción
del servidor no puede deshacerse abortando una petición del navegador.

Solo se habilita en sesiones Classroom. Abeka e Ignitia conservan sus enlaces y
no reciben controles de subida. Los indicadores de pregrabación son independientes
de las grabaciones de LiveKit; ambos archivos pueden coexistir en una sesión.

## Datos y permisos

`classSchedule.prerecordedVideoId` referencia la única pregrabación vigente.
La tabla `classSessionVideos` contiene metadatos y estados
`uploading → ready → retired`; nunca contiene bytes del vídeo ni URLs firmadas.
Los campos nuevos del horario son opcionales, por lo que los registros existentes
siguen funcionando sin migración.

El vídeo guarda una selección opcional y acotada de `lessonIds`, validada contra
el currículo tanto al reservar como al confirmar. Al publicarse se registran
confirmaciones en `classPrerecordedLessonRecords`, sin crear reportes ni asistencia.
Un curso inactivo no publica ni confirma lecciones.

El historial y progreso combinan estas confirmaciones con las de transmisiones,
deduplicando por sesión y lección. Reemplazar o retirar un archivo no borra una
confirmación de enseñanza ya publicada, igual que no borra un informe anterior.
Eliminar explícitamente la sesión sí limpia sus registros asociados. Las lecciones
confirmadas no se pueden borrar del currículo; el registro visible de la sesión
muestra las de ambas fuentes aunque todavía no exista un informe de transmisión.

Pueden gestionar una pregrabación los profesores asignados al curso —incluidas
las asignaciones multigrado— y los administrativos autorizados en ese ámbito.
Los tutores no obtienen permiso de subida por tener permiso para consultar.
Estudiantes y tutores autorizados pueden reproducir a partir del inicio previsto;
el profesor/administrativo puede solicitar una vista previa antes.
El acceso histórico a una grabación de LiveKit no amplía el acceso a nuevas
pregrabaciones privadas: estas requieren permiso actual del curso, tanto en la
lista de reproducción como al emitir su enlace.

La publicación usa una tarea programada de Convex y un indicador materializado,
sin `Date.now()` en consultas reactivas. La acción de reproducción vuelve a
comprobar la hora real del servidor y los permisos. Un `now` enviado por un cliente
no publica el archivo. Una tarea antigua no publica una sesión reprogramada.

Los enlaces son credenciales temporales de lectura, con dos horas de validez;
el reproductor los renueva antes de expirar sin perder la posición. Una revocación
impide emitir enlaces nuevos, pero no revoca un enlace ya emitido hasta que expire.
No se deben compartir ni registrar estos enlaces.

## Sustitución y recuperación

El vídeo anterior sigue vigente mientras se sube y verifica su reemplazo. El
commit compara el identificador anterior con el capturado al reservar; si otro
cliente ya lo cambió, rechaza el reemplazo sin sobrescribir al ganador. La
finalización es idempotente y recupera respuestas perdidas de multipart.

Se comprueban tamaño, tipo declarado y cabecera MP4 del objeto terminado. El
límite inicial es 2 GiB. La duración declarada debe estar entre cero y doce horas;
es metadato del cliente, **no** evidencia para asistencia. No se hace transcodificación
ni se garantiza la compatibilidad de todos los códecs que pueden vivir en MP4.

Cancelar, agotar las 24 horas de una reserva o retirar un vídeo encola su limpieza.
Se abortan las partes incompletas y se elimina el objeto antes de borrar sus
metadatos. Los fallos de limpieza se reintentan con espera creciente, hasta una
hora entre intentos. La caducidad de la reserva no elimina un vídeo confirmado.
Después de abortar se comprueba si todavía hay partes en vuelo; si las hay, se
conserva su referencia y se reintenta. Esto sigue la advertencia de la
[API oficial S3](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html).
Si el proveedor termina la subida después de cancelar y borrar sus metadatos,
la finalización reutiliza esa misma limpieza con la referencia privada conservada
en el servidor. Los reintentos retienen esa referencia y nunca eliminan un vídeo
`ready` confirmado por otro intento concurrente.

La tarea de caducidad conserva también el bucket en sus argumentos. Si al vencer
la reserva ya no hay un vídeo confirmado, programa una comprobación adicional
con 15 minutos de margen para una acción Node que estuviera finalizando. Es el
respaldo ante una acción interrumpida; no añade trabajos para subidas confirmadas.
El margen supera el [límite de diez minutos de las acciones Node](https://docs.convex.dev/production/state/limits).

Cambiar explícitamente la fecha de una sesión conserva su vídeo y recalcula la
publicación. La reconstrucción masiva de un horario conserva las ocurrencias con
vídeo que mantengan fecha/hora/tipo; rechaza una operación que las elimine o mueva
silenciosamente (`PRERECORDED_VIDEO_SCHEDULE_CONFLICT`). La eliminación explícita
de una sesión retira sus archivos mediante el flujo de dependencias existente.

## Configuración necesaria antes de habilitar la subida

1. Crear un bucket **privado** para pregrabaciones, sin `r2.dev` ni dominio público.
   No reutilizar el bucket público que emplean las grabaciones actuales.
2. Configurar `PRERECORDED_S3_BUCKET` con su nombre y las variables independientes
   `PRERECORDED_S3_ENDPOINT`, `PRERECORDED_S3_REGION`, `PRERECORDED_S3_ACCESS_KEY`,
   `PRERECORDED_S3_SECRET_KEY` en el mismo despliegue de Convex. La credencial debe
   tener permiso de objetos de lectura/escritura limitado al bucket privado,
   incluidas operaciones multipart y borrado. No sustituir las variables `S3_*`
   de LiveKit: pueden apuntar a otra cuenta. La aplicación rechaza que el nombre
   coincida con `S3_BUCKET` y no mezcla credenciales si falta una variable privada.
3. Configurar CORS en el bucket privado para los orígenes concretos de la aplicación
   (y localhost solo en desarrollo): métodos `PUT`, `GET`, `HEAD`; exponer `ETag`.
   Los PUT usan URLs firmadas y la longitud exacta del fragmento, no credenciales
   de almacenamiento en el navegador.
4. Activar una regla de ciclo de vida que aborte subidas multipart incompletas
   después de dos días. Es la protección adicional ante una caída entre crear la
   subida en el proveedor y registrar su identificador en Convex.
5. Probar un MP4 representativo con los navegadores admitidos y el bucket real,
   incluida su política CORS y la reproducción con peticiones Range.

Las pruebas automatizadas usan almacenamiento simulado y Convex en memoria. No
demuestran una subida real al proveedor ni permiten dar un porcentaje de ahorro.

### Desarrollo verificado

`dynamic-meerkat-158` usa el bucket privado `flexidual-prerecorded-dev`, sin
dominio público ni URL `r2.dev`. CORS permite únicamente `http://localhost:3000`
y `http://localhost:3001`; las subidas multipart incompletas se abortan a los dos
días, sin caducidad de objetos terminados. Sus credenciales independientes no
tienen acceso al bucket de grabaciones de LiveKit.

El 24 de octubre de 2026 se comprobó con un MP4 H.264 sintético de tres segundos:
subida directa desde el navegador con `ETag` accesible, confirmación y validación
real en Convex, emisión del enlace para un estudiante inscrito, lectura Range
`206` y reproducción completa sin errores. Se rechazó el acceso sin firma.
La sesión, usuarios, curso y archivo sintéticos se retiraron tras la prueba;
el informe sin secretos queda en `test-results/prerecorded-provider-smoke.json`.
Esta prueba corta no valida archivos de 2 GiB ni todos los navegadores/códecs.

Producción requiere su propio bucket privado y variables `PRERECORDED_S3_*`,
CORS con sus orígenes exactos y una credencial de servicio limitada a ese bucket
(Account API Token en Cloudflare). No reutilizar el bucket ni la credencial de
desarrollo y no alterar las variables `S3_*` de LiveKit.

## Referencias oficiales

- [Subida de archivos en Convex](https://docs.convex.dev/file-storage/upload-files)
- [Acceso y URLs de archivos en Convex](https://docs.convex.dev/file-storage/serve-files)
- [Subida multipart en R2](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [URLs firmadas S3 en R2](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)

Se utiliza el SDK oficial AWS S3 para multipart y firma. No se envía el vídeo a
través de una acción de Convex ni de una ruta de Next.js; estos intercambian solo
metadatos y autorizaciones. No se activa Cache Components para enlaces privados.
