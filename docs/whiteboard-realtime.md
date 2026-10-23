# Pizarra: entrega en vivo separada del guardado

## Arquitectura

El editor sigue siendo Excalidraw. Los elementos nuevos o modificados se entregan
por byte streams de LiveKit, sin esperar el guardado en Convex. Se reutiliza el
sincronizador existente: un envío en curso, agrupación de revisiones y reintentos.
El intervalo de entrega es 33 ms, no una garantía de latencia ni de 30 fps.
El SDK gestiona la fragmentación; no hay un servidor Socket.IO adicional.

Convex conserva las escenas canónicas, el historial por bloques, las imágenes y
la recuperación. Cuando el emisor tiene habilitado el canal rápido, el guardado
se agrupa a 750 ms, sin reiniciar la espera con cada cambio. Al levantar el lápiz
se captura la revisión final tras terminar el evento de Excalidraw, se vacía el
canal rápido y se guarda el borrador, sin adelantar el guardado durable.
Al ocultar o desmontar la pizarra se siguen vaciando los guardados pendientes.
Sin permiso confirmado o conexión LiveKit, se conserva el intervalo durable de
80 ms y el guardado inmediato al levantar el lápiz.
Los borradores y sus imágenes pendientes siguen en IndexedDB. Solo la respuesta
durable confirma el guardado: enviar una vista previa no elimina un borrador.
Si IndexedDB y localStorage no admiten escrituras, se conserva el borrador previo
y se avisa; no se puede garantizar recuperación de cambios no guardados si se
cierra el navegador sin red y sin ningún almacenamiento disponible.

Las vistas previas usan el mismo versionado, nonces, orden y tombstones existentes.
Se fusionan con la nube atrasada y se retiran al alcanzar esta sus revisiones.
Los cambios remotos usan `captureUpdate: NEVER`, sin añadir pasos de deshacer.
Su revisión se registra antes de actualizar el editor, como en el ejemplo de
Excalidraw: no se bloquea temporalmente `onChange`. Así, un trazo local que llegue
inmediatamente después del cambio remoto sigue entrando en guardado y borrador.
Los binarios no viajan por el canal de trazos: las referencias verificadas y la
subida autenticada de imágenes no cambian.

Los lectores, incluida la grabación, verifican al emisor mediante metadatos
emitidos por nuestro servidor (`canUpdateOwnMetadata: false`) y la consulta
reactiva `getRealtimeWriter`. Esta autoriza al lector antes de comprobar al
emisor con `isActive` y `canManageRoom`. Los mensajes incluyen ocurrencia,
activación física, manifest y generación; no basta con declarar un rol en ellos.
Una revocación elimina la autorización y las vistas previas no persistidas.

El emisor usa `getRealtimeAudience` para resolver destinatarios con las reglas
existentes de acceso a la clase. Cada identidad debe corresponder al usuario
activo indicado; los dispositivos companion también requieren poder gestionar
la sala. Los envíos llevan `destinationIdentities` explícitos. Una lista vacía
no genera un envío, porque LiveKit la interpretaría como difusión a toda la sala.
La grabación oculta se incluye por su `egressId`, activación y token vigente,
sin devolver el token al emisor. La revocación se aplica al actualizarse la
suscripción; no puede retirar bytes ya enviados. El roster se limita a 256
candidatos por consulta; si no se autoriza el canal rápido, sigue funcionando
la sincronización durable con sus permisos habituales.

El controlador durable no se sustituye al habilitar o perder el canal rápido:
solo cambia su intervalo de planificación. Así mantiene una única escritura en
curso, las revisiones pendientes y las confirmaciones. Si falta temporalmente
un bloque nuevo, la entrega en vivo compone sobre la última escena completa de
esa misma activación, manifest y generación. Esa base retenida solo sirve para
mostrar contenido; nunca confirma un borrador ni sustituye una respuesta durable.
Un cambio del token de grabación reinicia la sesión local de ese lector.

Las lecturas efímeras se limitan a un stream por emisor, 10 segundos y al tamaño
de un bloque existente más la cabecera. Los solapados, inválidos y demasiado
grandes recuperan por Convex; no se recorta contenido. Quien entra tarde o se
reconecta también obtiene la escena canónica: LiveKit no es almacenamiento.

Los streams rechazados se cancelan mediante `readAll` con una señal ya abortada;
devolver `return` sin leerlos no cancela su cola. `livekit-client@2.22.4` incorpora
temporalmente, con `pnpm patchedDependencies`, los dos arreglos oficiales
[#2167](https://github.com/livekit/client-sdk-js/commit/2d02cabb65db9dd0c2888b16af0d048c9ac863fd)
y [#2168](https://github.com/livekit/client-sdk-js/commit/8c445efde4e82fc344eae6300325f9ca2d927848).
Estos propagan la cancelación desde el iterador hasta el stream de origen y
retiran su controlador para descartar paquetes tardíos. La aplicación no accede
a campos privados del SDK y no cambia permisos ni protocolos de transporte.
El backport debe retirarse al actualizar a una versión publicada que incluya
ambos commits, conservando las pruebas del SDK real.

## Referencias

- `excalidraw-room/Collab.tsx: syncElements` separa broadcast y guardado.
- `excalidraw-app/collab/Portal.tsx` difunde elementos cambiados y separa archivos.
- [Excalidraw: captureUpdate](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api#captureupdate).
- [LiveKit: byte streams](https://docs.livekit.io/transport/data/byte-streams/).
- [Convex: prácticas recomendadas](https://docs.convex.dev/understanding/best-practices/).

No se copian Firebase, las APIs internas de Excalidraw ni su intervalo de guardado
de 20 segundos. El transporte con LiveKit es nuestra adaptación a la infraestructura
existente, no una integración oficial de Excalidraw con LiveKit/Convex.

## Comparación local del 22 de octubre de 2026

Se ejecutaron ambos modos con Chrome 155, React y Excalidraw reales: un profesor,
tres lectores, doce trazos y cuatro/doce imágenes. El escenario grande contiene
2.000 elementos y 240.000 puntos; parte del contenido está fuera del viewport.

**El transporte es HTTP/SSE local modelado, no LiveKit/WebRTC real.** Lecturas y
escrituras durables tienen 50 ms de espera; la entrega usa un stream SSE abierto
independiente. El lector limitado tiene CPU 4× y emulación Chrome de 1 Mbps/80 ms
después de la carga inicial. Esta emulación no reproduce RTT de un SFU, pérdida,
backpressure ni competencia con vídeo/audio. Por tanto, los números demuestran
la separación de caminos en el fixture, no un SLA de producción o tablet física.
La visualización se aproxima mediante dos animation frames, no mediante píxeles.

| Escena          | Medida                                          | Solo durable | Vivo + durable |
| --------------- | ----------------------------------------------- | -----------: | -------------: |
| 200 elementos   | p95 primer trazo visible, lector limitado       |       405 ms |          86 ms |
| 2.000 elementos | p95 primer trazo visible, lector limitado       |       424 ms |         113 ms |
| 2.000 elementos | p95 revisiones correlacionadas, lector limitado |       379 ms |         132 ms |
| 2.000 elementos | Mutaciones modeladas durante 12 trazos          |           37 |             15 |
| 2.000 elementos | JSON durable recibido por lector                |    122.191 B |       58.164 B |
| 2.000 elementos | JSON adicional de preview por lector            |          0 B |      118.934 B |

Las distribuciones de revisiones tienen distinto número de muestras porque el
canal rápido entrega más revisiones intermedias; el primer trazo visible compara
los mismos doce trazos. No se ejecutó una versión histórica: «solo durable» es el
fallback de esta versión, con el canal rápido deshabilitado.

Todos los lectores recibieron las versiones finales, las imágenes no se volvieron
a subir y no hubo excepciones de página. La prueba de 120 ediciones distintas en
un mismo bloque con 2.000 elementos y lector limitado dio p95 87 ms, sin volver a
descargar bloques completos. No elimina el coste local del canvas: el profesor
sigue registrando tareas largas con la escena grande.

## Costes: qué está y qué no está demostrado

En este fixture bajaron los lotes y los bytes durables, pero aumentó el tráfico
total sin comprimir por los previews: 177.098 B por lector frente a 122.191 B.
La mayor frecuencia de actualización también aumenta el trabajo del lector.
No podemos concluir una reducción global de factura: el SDK puede comprimir,
los servicios tienen tarifas e incluidos diferentes y aquí no se midió egress
facturable. El envío durable sigue haciendo una mutación por bloque afectado:
varios trazos en bloques distintos no se convierten en una única mutación.
La agrupación evita guardados anticipados y revisiones intermedias, no elimina
el coste de persistir cada elemento nuevo.

Datos: [modo durable](whiteboard-realtime-durable-baseline.json),
[modo vivo + durable](whiteboard-realtime-benchmark-results.json),
[120 ediciones del mismo bloque](whiteboard-hot-bucket-results.json).

Repetición sin servicios externos:

```sh
pnpm audit:whiteboard:browser
pnpm audit:whiteboard:benchmark --durable-only
pnpm audit:whiteboard:benchmark
pnpm audit:whiteboard:hot-bucket
```

El navegador también comprueba StrictMode con dos APIs, imágenes, dibujos,
deshacer/rehacer y recarga con localStorage realmente lleno e IndexedDB disponible.
Las pruebas automatizadas cubren autorización, revocación, activación/generación,
nube atrasada, borradores pendientes y lectura de grabaciones.

Verificación de las tres correcciones posteriores: `pnpm test` pasó 1.286 pruebas
(200 unitarias, 619 de componentes y 467 de Convex). Se añadieron casos conjuntos
de cambios de audiencia con una escritura retrasada, continuidad durante la
carga de un bloque, imágenes, borradores y recarga sin espacio en localStorage.
Se comprobó también la exclusión de usuarios revocados y desactivados y la
autorización del recorder oculto. TypeScript sin emisión, ESLint de los archivos
afectados y Prettier también pasaron. jsdom conserva sus avisos de foco y timers;
la prueba Chrome no registró excepciones de página.

No se desplegó ni se migraron o borraron datos. El dev remoto sigue desfasado del
código local; falta una prueba con LiveKit y Convex actuales en un entorno
autorizado y dispositivos reales antes de certificar el resultado en llamadas.

La reauditoría de estos tres hallazgos pasó de 75 a 100/100, solo a nivel de
código: `100 − 15×0 altos − 5×0 medios − 1×0 bajos`. No hubo hallazgos nuevos
confirmados en ese ámbito. Advisor e insights de despliegues se omitieron porque
el dev remoto no corresponde a esta versión y no se autorizó evaluar producción.
Esta puntuación no certifica latencia WebRTC, tablets ni ahorro de factura.

## Correcciones de edición concurrente y cancelación de streams

La reauditoría de estos dos hallazgos pasó de 80 a 100/100 a nivel de código:
la revisión remota se registra antes de `updateScene`, sin ignorar ediciones
locales posteriores, y los streams rechazados se cancelan con la API pública.
El backport oficial de LiveKit se aplica a source, ESM y UMD; no se actualiza
la versión del SDK ni se cambian las reglas de autorización.

`pnpm test` pasó 1.301 pruebas (200 unitarias, 634 de componentes y 467 de
Convex). Los nuevos casos combinan cambios remotos, edición local final,
imágenes, borradores, deshacer/rehacer y recarga con almacenamiento lleno.
También cubren cuatro motivos de rechazo de streams y nueve comprobaciones
del SDK real: cancelación por aborto, salida temprana y error de lectura,
paquetes tardíos y reutilización del identificador. TypeScript, ESLint y
Prettier de los archivos de aplicación y pruebas afectados pasaron; los
archivos YAML generados por pnpm conservan su formato nativo.

La primera ejecución global falló por temporización en una prueba de Abeka
(`Current sync did not settle`); tanto su repetición aislada como la segunda
suite completa pasaron, sin modificar ese módulo. Chrome 155 con Excalidraw
real pasó StrictMode con dos APIs, imágenes, dibujos, deshacer/rehacer y
recuperación con localStorage lleno, sin excepciones de página.

Los sourcemaps distribuidos por LiveKit no se regeneraron: las posiciones
de errores dentro de los bundles parcheados pueden no coincidir exactamente
con el mapa upstream. El patch es temporal y se retirará al adoptar una versión
oficial que incluya ambos arreglos y pase estas mismas pruebas. No se desplegó
ni se modificaron datos existentes; sigue pendiente medir WebRTC real y tablets.

## Agrupación del guardado al terminar un trazo

Con el canal rápido autorizado, `onPointerUp` conserva el envío final en vivo y
el borrador inmediato, pero deja el guardado en Convex en su ventana existente
de 750 ms. Sin canal rápido mantiene el guardado inmediato previo. No se cambian
el sincronizador, sus confirmaciones, las imágenes, el backend ni los permisos.
`pagehide`, ocultar la página y desmontar el editor siguen solicitando un guardado.

La ventana no se reinicia al escribir: varios cambios del mismo elemento se
agrupan, mientras que los elementos nuevos se conservan todos. Cada bloque
afectado sigue requiriendo su propia mutación. Se reducen guardados intermedios,
no se promete una sola mutación para una página entera ni para cualquier número
de trazos. Un fallo de entrega rápida que no cambie `canBroadcast` también depende
de este guardado agrupado para recuperarse.

Se añadieron siete pruebas para cubrir varias ediciones, trazos en cinco bloques
distintos, confirmación retrasada, imágenes y borrador pendiente, recarga con ambos
almacenes locales rechazando escrituras, pérdida del canal rápido y las tres salidas
anteriores. Los casos que exigían agrupación fallaron con la política previa.
`pnpm test` pasó 1.308 pruebas (200 unitarias, 641 de componentes y 467 de Convex).
Chrome 155 con Excalidraw real también pasó las pruebas de recuperación y
StrictMode, sin errores de página. No se modificó el módulo de Abeka.

### Histórico antes de corregir la finalización

Se repitió el mismo escenario de un profesor y tres lectores con 200/2.000
elementos, 4/12 imágenes y doce trazos de lápiz reales. Se guardó una ejecución
anterior al cambio y se repitió el canal rápido después de cambiar solo esta
política. La ejecución final optimizada se hizo sin otras pruebas concurrentes;
no es una comparación estadística ni una medición de servicios facturables.

Escena de 2.000 elementos, lector limitado:

| Medida                                      | Guardado al terminar cada trazo | Guardado agrupado |
| ------------------------------------------- | ------------------------------: | ----------------: |
| Mutaciones durables modeladas               |                              24 |                17 |
| JSON durable recibido                       |                        83.872 B |          57.827 B |
| JSON recibido, durable y preview            |                       224.696 B |         186.743 B |
| p95 primer trazo visible                    |                          116 ms |            114 ms |
| p95 revisiones correlacionadas              |                          144 ms |            151 ms |
| p95 versión final después de levantar lápiz |                          165 ms |            204 ms |

En esta ejecución bajaron las mutaciones un 29 %, el JSON durable un 31 % y el
JSON total un 17 %. No todas las latencias mejoraron: la versión final tardó
39 ms más en el p95 observado. Todos los lectores recibieron las doce versiones
finales, antes de terminar cada trazo ya veían contenido, no se resubieron imágenes
y no hubo errores de página. En la escena de 200 elementos las mutaciones bajaron
de 23 a 17 y el p95 de primer trazo pasó de 89 a 80 ms.

El objetivo conseguido es reducir persistencia sin hacer depender la entrega en
vivo de ella; estos números no certifican latencia idéntica ni ahorro de factura.
Las tareas largas del canvas grande continúan: no se atribuye a este cambio una
mejora del renderizado ni de memoria. La prueba de solo durable se repitió como
control con el fallback sin cambiar; sus resultados aparecen en la tabla anterior.

Datos históricos: [política previa](whiteboard-save-policy-before.json) y
[política agrupada antes de las correcciones](whiteboard-save-policy-grouped-before-fixes.json).

## Corrección del vaciado y de la revisión final

La auditoría identificó dos causas independientes de la ventana durable:

- Un `flush()` durante un envío en curso se olvidaba. Ahora el sincronizador
  compartido recuerda esa petición y entrega la revisión pendiente al llegar el
  ACK, sin esperar otros 33/750 ms. Las actualizaciones normales siguen agrupadas;
  un fallo conserva su backoff y los errores permanentes no se reintentan solos.
- En Excalidraw 0.18.1, `onPointerUp` se emite antes de añadir el último punto y
  ejecutar la finalización de freedraw. El respaldo síncrono de la escena dentro
  de ese callback retrasaba dicha finalización. En Chrome se observaron callbacks
  de 51–60 ms en la escena grande; se midió el callback completo, no solo la copia.
  Ahora una tarea posterior lee la escena final con los getters públicos y la
  pasa por el mismo `handleChange`, antes de transmitir y respaldar. No se cambia
  la herramienta ni se reescribe el historial del editor.

La captura pendiente también se consume en `pagehide`, al ocultar y al desmontar,
antes del respaldo de salida. `beforeunload` protege una revisión final pendiente
aunque aún no haya llegado su `onChange`. Se conserva el snapshot inmutable de los
borradores y la separación de imágenes; no se añaden tablas ni cambian permisos.
Los casos nuevos cubren salida anterior a la tarea diferida, API final sin
`onChange`, cambios remotos, imagen, borrador pendiente y recarga con ambos
almacenes locales rechazando escrituras. También cubren flush durante un envío,
coalescencia, backoff y denegación de permisos.

### Nueva medición local

Mismo fixture y límites descritos arriba; un profesor, tres lectores, doce trazos,
2.000 elementos, 240.000 puntos y doce imágenes. El lector limitado usa CPU 4× y
emulación de red. Se repitió el modo vivo y también el control solo durable.

| Medida, lector limitado                   | Agrupado antes | Corregido |
| ----------------------------------------- | -------------: | --------: |
| p95 primer trazo visible                  |         114 ms |    113 ms |
| p95 revisiones correlacionadas            |         151 ms |    132 ms |
| p95 versión final desde levantar el lápiz |         204 ms |    154 ms |
| Mutaciones durables modeladas             |             17 |        15 |
| JSON durable recibido                     |       57.827 B |  58.164 B |
| JSON durable + preview recibido           |      186.743 B | 177.098 B |

La repetición previa de la corrección dio 153 ms para el p95 final; el registro
final da 154 ms. Con doce trazos, ese p95 coincide con el máximo: no es una
estimación estadística de producción. La revisión final del profesor se observó
a los 12 ms como máximo desde pointer-up en el registro final, frente a los
58–68 ms observados al diagnosticar el callback anterior. El canvas grande aún
produce tareas largas; mover el respaldo no elimina su coste total.

Se conserva el ahorro de persistencia frente a guardar cada trazo, pero estos dos
arreglos no reducen todos los contadores: el JSON durable subió ligeramente
(0,6 %) frente al agrupado anterior, mientras el JSON combinado bajó un 5,2 %.
El tráfico combinado sigue siendo mayor que el control solo durable. No equivale
a ahorro de factura ni demuestra latencia WebRTC real. Las doce versiones finales
llegaron a todos los lectores, sin resubir imágenes ni errores de página.

Resultados actuales: [vivo + durable](whiteboard-realtime-benchmark-results.json),
[control solo durable](whiteboard-realtime-durable-baseline.json).
APIs utilizadas: [getters y suscripciones públicas de Excalidraw](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api).

Validación final: `pnpm test` pasó 1.321 pruebas (200 unitarias, 654 de componentes
y 467 de Convex); TypeScript sin emisión, ESLint y Prettier también pasaron.
Se añadieron trece casos y se endurecieron los de confirmación retrasada para
exigir entrega inmediata después del ACK, no tras otra ventana completa.
Chrome 155 con Excalidraw real pasó StrictMode con dos APIs, imágenes, dibujos,
deshacer/rehacer y recarga con almacenamiento lleno, sin errores de página.
La reauditoría de los dos hallazgos medios pasa de 90 a 100, solo para código:
`100 − 15×0 altos − 5×0 medios − 1×0 bajos`. Advisor e insights siguen omitidos
por no disponer de un despliegue equivalente autorizado. Sin despliegue,
migraciones ni modificaciones de datos existentes.

## Cierre antes de que el SDK destruya su escena

Una auditoría posterior reprodujo en Chrome una regresión del cierre inmediato:
Excalidraw 0.18.1 destruye su escena y vacía sus archivos en `componentWillUnmount`,
antes del cleanup pasivo del padre. Si seguía pendiente la captura de pointer-up,
esta leía una escena vacía y el sincronizador la convertía en borrados reales.
Las pruebas anteriores conservaban los getters del editor después del desmontaje
y por eso no detectaban el orden destructivo del SDK.

Se reutiliza el efecto existente de ciclo de vida como `useLayoutEffect`. Al cerrar,
primero marca el componente como desmontado para no iniciar subidas ni reintentos,
y consume la captura pendiente antes del desmontaje del editor hijo. El respaldo
y `sync.dispose()` siguen en el flujo pasivo existente, sin volver a consultar la
API destruida. No se ignoran escenas vacías: borrar intencionalmente sigue siendo
una operación válida. No se añaden reglas de reconciliación, tablas ni dependencias,
ni se cambia la frecuencia de envío o guardado durante la edición.

El simulador de componentes ahora vacía escena y archivos durante su cleanup
layout, como el SDK. Tres casos de cierre fallaban antes de la corrección y pasan
después. Se añadieron dos casos de borrado intencional y recarga, con almacenamiento
normal y lleno, para evitar confundir una pizarra realmente vacía con la API cerrada.

`pnpm audit:whiteboard:browser` incluye la reproducción permanente con React,
StrictMode y Excalidraw reales: después de pointer-up, una microtarea desmonta la
pizarra antes de la tarea de captura. localStorage está realmente lleno e IndexedDB
rechaza escrituras; ya existen dibujos, imágenes y un borrador recuperable.
La prueba falló antes del arreglo porque los nueve elementos acababan borrados.
Después conserva los nueve, los puntos, la versión y el nonce finales, los binarios
de las imágenes y el borrador anterior. Al recargar recupera la escena canónica y
las imágenes. La misma ejecución mantiene las pruebas de deshacer/rehacer y el
lector de solo lectura, sin errores de página ni subidas desde el lector.

Validación de esta corrección: 1.323 pruebas (200 unitarias, 656 de componentes y
467 de Convex), TypeScript sin emisión, ESLint y Prettier. El hallazgo alto queda
resuelto por reauditoría limitada: 85→100, `100 − 15×0 altos − 5×0 medios − 1×0 bajos`.
No es una certificación de producción: Chrome usa servicios HTTP/SSE locales,
no un despliegue Convex/LiveKit real. No se desplegó ni se tocaron datos existentes.
