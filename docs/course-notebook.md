# Board del profesor (pizarra del curso)

El nombre visible es **Board** en inglés, **Pizarra** en español y **Quadro** en
portugués. Identifica la herramienta del profesor, separada de un posible cuaderno
personal del estudiante. Se conservan los identificadores internos `courseNotebook`,
`courseNotebookPages` y las claves de borrador `notebook:<pageId>`: el cambio de
nombre no modifica permisos, almacenamiento ni los datos existentes.

## Fase 1: editor independiente de la clase en vivo

Separación de responsabilidades reutilizada por las fases siguientes. La llamada
conserva su identidad de ocurrencia y permisos; los apuntes de la pizarra se
vinculan al Board del curso y no caducan con la sesión.

- `components/whiteboard/whiteboard-editor.tsx` contiene la integración pública
  de Excalidraw, la reconciliación, el guardado incremental por bloques, las
  imágenes y la recuperación. No usa proveedores de LiveKit, Clerk, Intl ni
  consultas o mutaciones de Convex. Recibe la escena y las operaciones de
  persistencia de su adaptador.
- `components/classroom/shared-whiteboard.tsx` adapta la clase en vivo: consultas
  autorizadas, generación/activación, subida autenticada y canal rápido. También
  gestiona punteros y seguimiento del viewport. Los consumidores y la vista de
  grabación mantienen la misma API de `SharedWhiteboard`.
- `lib/whiteboard-image.ts` conserva la compresión existente, sin otro paquete
  ni cambios de formato o resolución.
- `lib/whiteboard-sync.ts` y `lib/whiteboard-draft-storage.ts` siguen siendo los
  únicos motores de guardado y recuperación; no hay un segundo autosave.

El editor recibe un `draftKey` estable y aísla su ciclo de vida por identidad y
modo de edición. En la clase en vivo se sigue pasando el mismo `roomName`, por
lo que los borradores anteriores no cambian de clave. Las operaciones en vuelo
conservan su destino original al cambiar de identidad. El adaptador es
responsable de proporcionar callbacks estables para esa identidad.

Sin canal rápido, el editor usa el guardado durable existente. Con él, distingue
entrega en vivo de confirmación durable. Solo esta última puede confirmar un
borrador. Los cambios remotos usan `captureUpdate: NEVER`; se conservan los
tombstones y las revisiones para deshacer/rehacer. La API descartada por
StrictMode no consume los archivos de la instancia vigente.

Las comprobaciones incluyen el editor sin proveedores de llamada, mezcla de
cambios remotos y borradores con imágenes, guardados/subidas retrasados al cambiar
de identidad, modo de solo lectura y recuperación con almacenamiento lleno.
El harness `pnpm audit:whiteboard:browser` ejecuta Excalidraw real en Chrome,
con StrictMode, imágenes, historial, cierre y recarga. Sustituye los servicios
externos por transportes locales; no demuestra latencia de una llamada real.

### Distribución móvil

Se conserva Excalidraw 0.18.1: la barra móvil nueva del sitio excalidraw.com aún
no está publicada en la versión estable. `whiteboard-mobile-toolbar.tsx` adapta
sus grupos de formas y líneas usando `setActiveTool`, `updateScene`, `onPointerDown`
y `useI18n` públicos, sin importar código interno del ejemplo. Se conserva la
selección, mano, dibujo, borrador, texto, imágenes y las herramientas adicionales
disponibles en 0.18.1; no se simulan funciones nuevas como lasso o bucket fill.

Hasta 1024 px de ancho del editor, teléfonos y tablets comparten una barra de
una sola fila: texto e imágenes pasan al menú adicional cuando no caben. Los
iconos miden 16 px y los desplegables usan la misma librería de popovers que el
ejemplo, con el editor como límite. El SDK sigue gestionando propiedades,
deshacer/rehacer, búsqueda, reset y exportación. La CSS acotada recoloca esos
controles nativos, sin convertir el canvas en una cuadrícula ni superponer un
panel que intercepte el dibujo. Las vistas de grabación no muestran controles.
El botón de Board conserva su tamaño cuadrado en móvil. Las propiedades empiezan
cerradas también en escritorio: el mismo control abre/cierra el panel nativo,
sin otro estado de guardado ni cambios en el historial. En pantallas amplias se
mantiene la barra de herramientas nativa superior.
El control propio usa un icono de ajustes y la superficie de controles de
Excalidraw. Volver al canvas cierra tanto los grupos como el panel nativo mediante
`onPointerDown`, sin consumir el primer trazo ni añadir un paso al historial.
El mismo botón se utiliza en todos los tamaños; el disparador móvil antiguo del
SDK se oculta mediante la adaptación acotada a 0.18.1. Su visibilidad se decide
una sola vez en `whiteboard-properties.ts`, con el criterio del SDK: selección
vacía, mano, borrador y láser no lo muestran sin un objeto válido seleccionado.
Las referencias a objetos borrados no cuentan como selección visible. No se
superponen controles de propiedades al menú principal abierto.
En escritorio comparte tamaño, alineación y superficie con el botón del menú,
con 12 px de separación. La galería contiene su scroll y el diálogo y su fondo
cortan el encadenamiento hacia el curso con `overscroll-behavior`, sin bloquear
los portales de exportación del SDK ni modificar estilos globales del documento.
Enfocar la galería no desplaza el documento (`preventScroll`).
La opacidad conserva su deslizador nativo y el valor accesible; se ocultan los
números decorativos para evitar solapamientos al mostrar el panel.

Un ResizeObserver solo cambia el modo al cruzar el límite de anchura; no remonta
el editor. La barra está memorizada y recibe solo los campos de UI que consume,
no la escena ni todo el AppState en cada trazo. No añade guardados, suscripciones
a Convex ni cambios de identidad, tema o recuperación.

`pnpm audit:whiteboard:browser -- --mobile-layout` comprueba en Chrome el SDK
real y los estilos de la aplicación a 320, 390, 844, 1024 y 1280 px: dibujo táctil,
grupos de herramientas, propiedades, menús,
exportación, búsqueda, reset, deshacer/rehacer, salida a la galería y solo
lectura. También comprueba la presentación en móvil y escritorio. Es una
adaptación con APIs públicas y CSS a la estructura de 0.18.1, no la nueva barra
interna del SDK; hay que revisarla al actualizarlo. No sustituye las pruebas en dispositivos
físicos ni en Safari.

## Fase 2: hojas y persistencia

La base está desplegada. La corrección del enlace automático de las sesiones
descrita aquí está pendiente de publicación; no se ejecutó una migración masiva.

- `convex/courseNotebook.ts` define el cuaderno lógico del curso: inicialización,
  archivo, creación/renombrado y consultas paginadas de hojas. Los cursos nuevos
  se inicializan al crearlos; los existentes, de forma idempotente al abrir el
  cuaderno. No se crean hojas vacías por cada clase.
- `courseNotebookPages` contiene metadatos y una miniatura opcional, no la escena.
  Cada hoja tiene un manifiesto propio por `pageId`. El manifiesto predeterminado
  de una sesión se enlaza a una hoja, sin copiar sus bloques. Al expirar la sesión
  se retiran `roomName` y el token de grabación, pero no su contenido.
  Comparte los bloques, versiones, conflictos e historial reciente de la pizarra
  mediante `model/whiteboardSceneStorage.ts`, sin duplicar el motor de guardado.
- `courseNotebookFiles.ts` guarda las imágenes por hoja. El endpoint autenticado
  de subida verifica contenido, tamaño y permiso antes y después de recibir el
  archivo. Solo el servidor vincula archivos a la hoja; las referencias se leen
  en grupos de hasta 64. Las imágenes de elementos borrados se retienen para
  deshacer/rehacer.
- `CourseNotebook` ofrece la galería paginada y el diálogo del editor desde el
  tab del curso. Carga el editor bajo demanda. `NotebookPageEditor` adapta el
  mismo editor común a la hoja, sin LiveKit y sin otro autosave.
- Los borradores usan `notebook:<pageId>` en el almacenamiento común: IndexedDB
  para dibujos e imágenes, con la compatibilidad y protección existentes frente
  a fallos de cuota. Las claves de las pizarras en vivo no cambian.
- Las miniaturas se generan con `exportToBlob` tras una confirmación durable,
  solo al cerrar o cambiar de hoja, hasta 480 px y 256 KiB. No se programa una
  miniatura durante la edición. El cierre captura la revisión final, y espera
  sus guardados e imágenes visibles pendientes: nunca finaliza una confirmación
  anterior por accidente. La carga tardía de una imagen conserva sus binarios
  aunque el canvas ya se haya desmontado, sin otro guardado de escena.
  Los reintentos de imágenes conservan su límite de tres intentos al cerrar:
  la misma cola termina las subidas pendientes (máximo dos simultáneas) y las
  descargas necesarias, sin escribir ni añadir archivos a un canvas destruido.
  Lectores y pizarras temporales no mantienen estas tareas después de cerrarse.
  Una revisión reservada en el servidor descarta resultados atrasados; sustituir una miniatura
  elimina la anterior. Se reutilizan la firma de contenido y los tres intentos
  acotados existentes; consultar contenido sin cambios no vuelve a exportarlo.
- Al salir de una hoja vacía confirmada, el servidor comprueba su firma y la
  ausencia de elementos visibles en la misma transacción. La retira de los
  índices de galería y búsqueda, y elimina solo su miniatura; no genera un PNG
  vacío. Las firmas pequeñas por bloque incluyen `hasContent`, sin releer toda
  la escena. Los registros antiguos preparan como máximo un bloque por llamada.
  `retiredAt` es opcional y las hojas existentes siguen visibles sin migración.
- La retirada es reversible: no destruye la identidad, los borradores, imágenes
  ni tombstones necesarios para recuperar y deshacer desde otro editor. Un
  guardado canónico con contenido vuelve a mostrar la misma hoja. Por ello no
  equivale a liberar inmediatamente todo su almacenamiento: la eliminación
  física sigue el ciclo de vida del curso. Los lectores ya abiertos y las
  grabaciones conservan el acceso autorizado a su escena.
- Renombrar una hoja no vuelve a abrirla ni cambia la selección si la respuesta
  llega después de cerrar el editor o abrir otra hoja.
- Al terminar el curso se archiva el cuaderno sin borrar sus datos. Las acciones
  manuales siguen siendo independientes del chat. Solo eliminar el curso inicia
  la limpieza por lotes de sus hojas, imágenes, miniaturas y bloques.

No hay importación masiva de pizarras antiguas. Al abrir una sesión existente
con permiso de edición (o al guardar un delta en ella), se adopta su manifiesto
y se transfieren una sola vez sus referencias de imágenes, nunca los bytes.
La pizarra inicial vacía permanece oculta en la galería hasta su primer contenido.
Se conserva «Save as image» de Excalidraw; la exportación conjunta es posterior.

## Fase 3: hojas dentro de la clase en vivo

- El botón Board (icono BookOpen, como el tab) vive dentro del editor, tanto en
  la hoja del curso como en la pizarra auxiliar de la llamada. Usa
  `renderTopRightUI` y sustituye el disparador Library mediante el componente
  público `DefaultSidebar.Trigger`, sin modificar el SDK ni buscar nodos del DOM.
  La biblioteca deja de mostrarse como botón; las herramientas, búsqueda del
  canvas y exportación conservan sus acciones oficiales. El menú usa `MainMenu`
  con `SaveAsImage`, `SearchMenu`, `ClearCanvas` y el fondo existente, sin Help ni
  redes sociales. Reset conserva confirmación, tombstones y deshacer/rehacer;
  la hoja vacía solo se retira por el cierre seguro existente.
- El panel del curso usa el modo no modal de Radix para no bloquear los portales
  de Excalidraw en `body`. Conserva backdrop, navegación circular por teclado y
  cierre explícito; el listado cubierto queda inerte. Interactuar con un diálogo
  del SDK no cierra ni remonta el editor, y Escape pertenece a la ventana activa.
- `NotebookPagePicker` reutiliza la misma galería `CourseNotebook` bajo demanda:
  búsqueda, paginación, creación y archivo conservan sus permisos. La galería
  sustituye al editor en el mismo contenedor, sin abrir otro diálogo ni cambiar
  sus dimensiones. Al abrirla se desmonta la pizarra y se finaliza la hoja mediante
  el flujo compartido de guardado, preview y recuperación. No quedan canvas
  ocultos activos; solo terminan las tareas pendientes de persistencia.
  El editor del curso actualiza también el nombre de la hoja seleccionada sin
  navegar a otra página. El título superior es editable según permisos y guarda
  tras una pausa de 600 ms, al perder foco o al cerrar; no hay formulario ni botón
  de renombrado duplicados. Las respuestas tardías no cambian otra hoja abierta.
  La confirmación conserva el nombre aunque la hoja salga del filtro de búsqueda;
  cada petición tiene identidad propia para ignorar fallos antiguos. Ocultar o
  abandonar la pestaña inicia el guardado pendiente y la navegación avisa mientras
  falta confirmación, sin prometer que el navegador complete trabajo al cerrarse.
  El adaptador de LiveKit usa la selección autorizada
  existente y espera su confirmación antes de montar el editor de la selección.
  Volver reabre la última fuente sin cambiar la presentación. Mientras se busca,
  los estudiantes siguen viendo la hoja presentada, nunca la galería.
- La acción manual de archivar está temporalmente oculta para todos. Se mantiene
  la restauración administrativa de Boards archivados y el archivo automático
  al finalizar el curso; ocultar el botón no cambia datos ni permisos del backend.
- En vivo permite elegir una hoja existente o crear una nueva. Atrás reabre la
  selección actual; no hay un segundo botón de retorno a una pizarra temporal.
  El botón Presentar conserva su función de
  mostrar u ocultar la pizarra a los participantes.
- Los espectadores de la llamada y las grabaciones no montan este navegador
  de hojas. La galería no se transmite: los estudiantes reciben la escena
  seleccionada mediante el canal y la persistencia existentes.
- El manifiesto de la sesión conserva su hoja inicial por `pageId` y la selección
  alternativa por `presentedPageId`. No se copian escenas
  ni imágenes: el editor usa la clave estable de la hoja, sus borradores y los mismos
  bloques persistentes, también al editar fuera de la clase.
- Seleccionar exige gestionar la clase activa y poder editar esa hoja del
  mismo curso. Los guardados conservan los permisos del cuaderno y usan su API de página independiente de
  la selección: un guardado pendiente termina en su hoja original, nunca en la
  siguiente. La hoja inicial mantiene su clave de borrador `roomName`, para
  recuperar los borradores anteriores incluso con almacenamiento lleno. El campo
  opcional `sessionDraftKey` conserva esa misma identidad al abrirla desde el
  curso, al presentarla en otra clase y después de limpiar la sesión. Las hojas
  creadas fuera de una sesión usan `notebook:<pageId>`. No se mueve ni elimina el borrador local.
  Las
  lecturas incluyen `expectedPageId` y se suscriben a los
  bloques de la hoja y a sus imágenes visibles en grupos de 64.
- El canal rápido mantiene sus ámbitos de sala, activación, manifiesto y
  generación. Puntero y viewport distinguen las hojas seleccionadas mediante
  `sourceId`; la hoja inicial conserva los paquetes sin ámbito de versiones
  anteriores, para que clientes ya abiertos sigan viendo puntero y seguimiento.
  La identidad de persistencia no cambia ese contrato de presentación. El guardado durable
  y las miniaturas siguen usando los motores compartidos.
- Estudiantes y grabaciones usan los permisos de la clase y solo pueden obtener
  la hoja presentada, no navegar por todo el cuaderno con el token de grabación.
  Archivar el cuaderno retira su presentación; la limpieza de la llamada solo
  elimina la referencia y sus datos temporales, nunca el cuaderno.

El cierre de la pestaña o del navegador solo permite trabajo asíncrono de mejor
esfuerzo (`pagehide`); no se promete finalizar una miniatura durante un cierre
forzado. Se conserva la protección existente de cambios pendientes y la
recuperación del dibujo al recargar. Cerrar/cambiar una hoja dentro de la app sí
mantiene la tarea en vuelo, separada de la vida del canvas.

## Contrato de permisos y siguientes fases

- Un cuaderno lógico por curso; hojas independientes de la sesión en vivo.
- Profesores y tutores asignados, y administrativos dentro de su ámbito, editan
  según las capacidades existentes del curso; estudiantes autorizados consultan.
  Solo los administrativos pueden archivar/restaurar manualmente el cuaderno.
- Archivo automático al terminar el curso, como el chat. Archivar conserva los
  datos. Las acciones manuales de chat y cuaderno son independientes: archivar,
  restaurar o vaciar el chat no cambia el cuaderno.
- Galería paginada compartida entre el tab del curso y la vista dentro de la
  pizarra. Solo carga metadatos y miniaturas; abrir una hoja carga su escena.
- Nombre inicial de hoja según su fecha de creación y zona horaria institucional
  existente. Miniaturas limitadas mediante `exportToBlob`, fuera del camino de
  cada trazo y protegidas contra resultados atrasados.
- La sesión en vivo referencia la hoja presentada; no es propietaria de los
  dibujos ni imágenes del cuaderno. La limpieza de una sesión no debe borrarlos.
- Se reutilizarán fragmentación, recuperación y subida verificada. No se aceptarán
  identificadores de archivos arbitrarios ni se ampliará el acceso de invitados
  de una llamada al resto del cuaderno.
- La exportación actual de imagen sigue disponible. La exportación del cuaderno
  completo es una fase posterior.

## Referencias

- `.agents/examples/excalidraw-room/Collab.tsx`: entrega y persistencia separadas.
- `.agents/examples/excalidraw/with-script-in-browser/components/ExampleApp.tsx`:
  integración y personalización con APIs públicas.
- [API pública de Excalidraw](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api).
- [Prácticas de Convex](https://docs.convex.dev/understanding/best-practices/).
- [Transporte y guardado actuales](whiteboard-realtime.md).
