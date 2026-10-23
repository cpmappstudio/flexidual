# Prueba local de carga de la pizarra

## Resultado tras optimizar las lecturas

La lectura diferencial corrigió la amplificación observada en la escena grande.
Con 2.000 elementos, 240.000 puntos y doce imágenes PNG, el lector limitado a
1 Mbps y CPU 4× pasó de **10.511 ms a 432 ms de p95**. Una primera repetición
también obtuvo 452 ms. Todos los participantes recibieron los doce trazos y sus
versiones finales, sin remontajes ni excepciones de página.

El tráfico de lectura del estudiante sin limitación pasó de **5.048.945 a
118.328 bytes** durante los doce trazos: aproximadamente **97,7 % menos en esta
prueba**, no un porcentaje de ahorro mensual. La carga inicial y las tareas
largas del profesor no quedan resueltas por este cambio.

Ejecutar desde la carpeta principal:

```sh
pnpm audit:whiteboard:benchmark
```

Requiere Google Chrome instalado. Reutiliza `pnpm audit:whiteboard:browser`
y guarda la última ejecución en
[whiteboard-benchmark-results.json](whiteboard-benchmark-results.json).
La ejecución anterior al cambio está conservada en
[whiteboard-benchmark-baseline.json](whiteboard-benchmark-baseline.json).
No instala dependencias ni contacta producción. Navegadores y servidor local se
cierran también si falla una comprobación.

## Qué cambió

Se conservan los 64 grupos y los bloques canónicos. Cada escritura que realmente
cambia un bloque guarda también sus elementos ganadores en un registro reciente,
dentro de la misma transacción. Este registro se limita a 32 revisiones y 64 KiB.

El lector solicita solo los cambios posteriores a su cursor. Renueva el cursor
desde una respuesta ya aplicada al consumir la mitad de la ventana: 16 revisiones
o 32 KiB de entradas. No cambia de suscripción por cada trazo, ni espera a perder
una ventana que ya había recibido íntegra.
No se crean suscripciones por elemento. Si pierde la ventana, cambia la fuente o
generación, o el cambio individual excede la ventana, obtiene un bloque completo.
Nunca se truncan datos para cumplir el presupuesto. Los lectores sin cursor siguen
siendo compatibles; imágenes, borradores y sus controles de acceso no cambian.

El benchmark reutiliza los helpers reales de retención y selección del backend y
el hook real del cliente. El servidor local sustituye únicamente los servicios
externos. El diseño aplica las [consultas reactivas de Convex](https://docs.convex.dev/realtime)
y la reconciliación del ejemplo colaborativo de Excalidraw, incluida la aplicación
de cambios remotos sin alterar el historial local de deshacer/rehacer. El registro
acotado es una adaptación de nuestra integración, no una solución oficial ya hecha.

## Escenario y método

- Chrome 155.0.8059.85, Excalidraw 0.18.1 y React reales, en desarrollo y StrictMode.
- Un profesor y tres estudiantes simultáneos en contextos aislados.
- Escena pequeña: 200 elementos, 24.000 puntos y cuatro PNG.
- Escena grande: 2.000 elementos, 240.000 puntos y doce PNG.
- Los elementos ocupan una superficie extensa; parte está fuera del viewport
  de 1.100 × 750. No se prueba todo el contenido visible a la vez.
- Doce trazos nuevos mediante ratón real, con 24 movimientos por trazo.
- Dos lectores sin limitación. El tercero tiene CPU ralentizada 4×, descarga de
  125.000 bytes/s (1 Mbps), subida de 62.500 bytes/s y 80 ms de latencia adicional.
- Transporte HTTP/SSE local con 50 ms por escritura y lectura. Conserva el editor,
  hook, sincronización y almacenamiento local reales, pero no reproduce el
  protocolo, compresión o agrupación de suscripciones de Convex.
- La limitación de red empieza después de cargar imágenes y dibujos. El arranque
  incluye datos sintéticos y el retraso del editor del fixture: no mide primera
  carga a 1 Mbps ni el arranque de la plataforma en producción.
- Apple M4 Max, 16 procesadores lógicos, 128 GiB RAM. La CPU ralentizada no equivale
  a una tablet física. Ejecuciones del 21 de octubre de 2026 en Colombia / 22 UTC.

La latencia correlaciona versiones exactas desde `onChange` del profesor hasta dos
`requestAnimationFrame` después del `onChange` del estudiante. Es una aproximación
a presentación, no una sonda del píxel físico. Versiones intermedias pueden
agruparse; se verifica por separado la llegada de todas las versiones finales.

P95 corresponde al percentil de las muestras de cada ejecución (doce trazos),
no a un SLA ni a una estimación estadística de producción. Los IDs generados por el
SDK y el número de lotes agrupados varían ligeramente entre ejecuciones.

## Latencia observada

| Escena                   | Perfil       | Antes, p95 | Después, p95 |
| ------------------------ | ------------ | ---------: | -----------: |
| 200 elementos + 4 PNG    | Estudiante 1 |     301 ms |       307 ms |
| 200 elementos + 4 PNG    | Estudiante 2 |     296 ms |       312 ms |
| 200 elementos + 4 PNG    | Limitado     |     858 ms |       376 ms |
| 2.000 elementos + 12 PNG | Estudiante 1 |     353 ms |       344 ms |
| 2.000 elementos + 12 PNG | Estudiante 2 |     364 ms |       354 ms |
| 2.000 elementos + 12 PNG | Limitado     |  10.511 ms |       432 ms |

El beneficio principal está en la red limitada. En la escena grande, antes ningún
trazo empezaba a verse allí antes de levantar el ratón; después ocurrió en 11 de
12 trazos. Los lectores sin limitación mantuvieron los doce visibles durante el
dibujo. No se promete latencia cero ni mejora de cada muestra aislada.

## Tráfico y coste de trabajo

Son cuerpos JSON UTF-8 y binarios PNG sin comprimir. Se excluyen TLS, cabeceras,
vídeo y protocolo de Convex. MB y kB son decimales.

| Métrica, escena grande                                        |    Antes |  Después |
| ------------------------------------------------------------- | -------: | -------: |
| JSON inicial por participante                                 | 8,482 MB | 8,494 MB |
| Imágenes iniciales por participante                           | 0,544 MB | 0,544 MB |
| Lotes aceptados                                               |       36 |       35 |
| Cambios enviados por el profesor                              |  40,5 kB |  39,0 kB |
| Lectura por estudiante sin limitación durante el dibujo       | 5,049 MB | 0,118 MB |
| Lectura del estudiante limitado durante dibujo y recuperación | 1,935 MB | 0,118 MB |
| CPU del renderer del profesor en la ventana medida            | 3.506 ms | 3.290 ms |
| Tareas del profesor mayores de 50 ms                          |       22 |       22 |

Los deltas no incluyen binarios ni provocan nuevas subidas de imágenes existentes.
La carga inicial sigue necesitando los dibujos. La pequeña sobrecarga inicial
incluye los metadatos del cursor y la nueva suscripción con ancla.

**Contrapartida:** cada bloque que cambia añade una escritura de documento de
historial, acotada a 64 KiB de entradas, además de sus fragmentos canónicos. Las
pruebas transaccionales comprueban este incremento explícitamente. Una lectura
diferencial evita leer el bloque histórico; la prueba con un bloque de 250 kB
comprueba respuesta menor de 2 kB y lectura de base de datos menor de 50 kB.

Por tanto, menos tráfico hacia estudiantes **no demuestra por sí solo menor
factura total de Convex**. Falta medir escrituras, lecturas, caché y egreso reales
en el despliegue. Para escenas pequeñas, el historial puede añadir trabajo que no
se compensa igual que en escenas grandes.

El p95 de intervalos de animación del profesor con la escena grande fue 33,3 ms,
con máximo de 66,8 ms; los lectores quedaron aproximadamente en 16,8 ms p95.
Esto no garantiza una tasa de FPS: un callback no demuestra una presentación
completa. El heap es una instantánea sin forzar GC, no RAM total ni una prueba de fuga.
Las tareas largas del profesor persisten y necesitan perfilado separado.

El campo `fullSnapshotSameBatchesModelBytes` de los informes estima el JSON de una
escena completa por cada lote aceptado. No ejecuta el código histórico anterior
al debounce ni permite calcular ahorro mensual. La comparación de lecturas
antes/después de la tabla sí procede de ambas ejecuciones locales conservadas.

## Seguridad, recuperación y alcance

Las pruebas verifican la comprobación de permisos también para respuestas vacías,
tokens de grabación, borrados, versiones, concurrencia, retención, recuperación
completa al perder la ventana y limpieza por ID inmutable del manifiesto.

La prueba conjunta usa el backend y hook reales con cambios concurrentes del mismo
bloque, un guardado retrasado, imágenes, borradores pendientes y recarga cuando
ambos almacenes locales rechazan escrituras. Chrome con Excalidraw real comprueba
además StrictMode, píxeles de imágenes, lápiz, deshacer/rehacer, almacenamiento lleno
y recargas sin excepciones de página:
`pnpm audit:whiteboard:browser`.

Se cambió código local y se añadió una tabla al esquema fuente, **sin desplegar,
migrar, borrar ni modificar datos remotos existentes**. No cambiaron las reglas
de imágenes, permisos, caducidad o grabaciones.

Queda por validar: Convex real en un entorno autorizado, una tablet física, una
clase con audio/vídeo LiveKit simultáneo, vista alejada con todos los elementos,
primera carga con red lenta y perfiles de CPU del profesor. Los cambios individuales
mayores que 64 KiB usan recuperación completa y no obtienen todo el beneficio de
la ruta reciente.

## Verificación e intermitencia conocida

La última ejecución general pasa: **200 pruebas unitarias, 601 de componentes y
453 de Convex (1.254 en total)**, además de TypeScript y Chrome. La suite general
mantiene una intermitencia ya observada en `convex/abeka.test.ts`:
`Current sync did not settle` en temporizadores de finalización, con posibles
errores posteriores del entorno. Se informa por separado y no se modificó Abeka.
La primera ejecución general posterior al checkpoint volvió a mostrar esa
intermitencia; la repetición pasó las 453 pruebas. No se oculta esa incidencia
como si la suite hubiera pasado siempre.

## Regresión: muchas ediciones en el mismo bloque

```sh
pnpm audit:whiteboard:hot-bucket
```

Esta prueba adicional usa el mismo editor real, hook, transporte local y helpers
de historial, con un profesor y un estudiante en Chrome. Mantiene 2.000 elementos
y doce imágenes, pero guarda **120 ediciones distintas del mismo elemento**, en
un bloque con aproximadamente 171 kB de contenido histórico. No confunde eventos
de interfaz agrupados con escrituras distintas: espera cada versión en el servidor.

Con el estudiante limitado a **1 Mbps, 80 ms adicionales y CPU 4×**, dos ejecuciones
del 21 de octubre obtuvieron las 120 versiones y **cero descargas completas del
bloque durante las ediciones**. La última obtuvo p95 de **297 ms** y máximo de
**325 ms**; la primera obtuvo 299 ms y 319 ms, respectivamente. Se recibieron
391.145 bytes JSON, incluyendo metadatos y renovaciones de suscripciones. No hubo
remontajes, excepciones de página ni nuevas subidas de las imágenes existentes.
El informe se guarda en
[whiteboard-hot-bucket-results.json](whiteboard-hot-bucket-results.json).

Antes de corregir el cursor, la reproducción determinista con el lector al día
forzaba snapshots en las revisiones 34, 67 y 100. La nueva prueba comprueba que no
se descargue ninguno durante la secuencia; fallaría si se volviera a fijar el cursor.
Las pruebas de helper, hook y Convex cubren también la renovación por bytes antes
de 16 revisiones, respuestas repetidas o atrasadas, base ausente, borrados,
recarga y permisos. Una desconexión que exceda la ventana conserva el fallback
completo: no se suprimen datos para evitar una descarga.

La red lenta se activa después de la carga inicial. Sigue siendo una prueba local
HTTP/SSE, no una medición del protocolo Convex desplegado ni de una tablet física.
No permite convertir estos bytes en un porcentaje de ahorro de factura.
