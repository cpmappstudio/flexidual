# Vínculos de Abeka por currículo

## Reinicio elegido para este despliegue

El 1 de octubre de 2026 se eligió un reinicio de los datos de Abeka en desarrollo
y producción, en lugar de conservar y migrar los vínculos de prueba. Se
desconectaron las integraciones y se vaciaron exclusivamente las tablas `abeka*`.
No se ejecutó `migrateBatch` ni se borraron estudiantes, clases o currículos de
Flexidual. Las variables de entorno se conservan.

Después de publicar backend e interfaz, basta con conectar Abeka de nuevo y
crear las asociaciones. La conexión nueva habilita directamente el modelo de
currículos; no requiere los pasos de migración de abajo. Estos se documentan
solo para despliegues que todavía conserven conexiones anteriores.

## Modelo y alcance

`abekaCurriculumLinks` relaciona una materia del catálogo de una conexión con
un currículo de la misma institución. Un currículo tiene como máximo una
materia por conexión; una materia puede vincularse a varios currículos (50).
Los cursos resuelven la materia mediante `classes.curriculumId`.

No cambia la sincronización, los vínculos de estudiantes, las credenciales,
los reportes `abekaProgress` ni los cálculos de ninguno de los dos anillos.
El detalle del perfil mantiene sus controles de acceso y matrícula. El estado
de un estudiante no se comparte con otros alumnos que usan el mismo currículo.

## Compatibilidad de despliegue

Este cambio **no ejecuta la migración automáticamente**. Las conexiones nuevas
nacen con `curriculumLinksMigratedAt`. Las existentes siguen mostrando el
progreso mediante sus vínculos por clase hasta completar la migración.
El nuevo selector permanece deshabilitado, con una nota, mientras esto ocurre.

La tabla anterior se conserva como evidencia. Una vez iniciada la migración,
`abekaCatalog.linkCourse` rechaza modificaciones desde pestañas antiguas.
La API nueva solo acepta escrituras cuando la migración está completa.
El último lote activa el modelo nuevo en la misma transacción.

Entre lotes, las mutaciones de clases impiden cambiar el currículo o eliminar
una clase vinculada a esa conexión. La comprobación lee el estado de la conexión
dentro de la misma transacción que la edición, de modo que también queda cubierta
la concurrencia con el primer y último lote. Los cambios de nombre y las clases
sin vínculo no se bloquean. La protección se libera al completar la migración;
no depende del estado de conexión/sincronización de Abeka.

## Procedimiento (requiere autorización separada para producción)

1. Confirmar el deployment de destino y hacer un respaldo antes de migrar.
   No copiar credenciales ni datos de alumnos a logs o al repositorio.
2. Desplegar primero el backend compatible y después la interfaz. No quitar
   campos, índices ni endpoints antiguos en este despliegue.
3. Inventariar cada conexión con `abekaCurriculumLinks:previewMigration`:

   ```json
   {
     "connectionId": "ID_CONEXION",
     "paginationOpts": { "cursor": null, "numItems": 50 }
   }
   ```

   Repetir con `continueCursor` hasta `isDone`. Agrupar todas las páginas por
   `curriculumId`: varios registros de la misma materia son duplicados seguros;
   distintas materias para el mismo currículo necesitan una decisión humana.
   Un `curriculumId: null` identifica una referencia ausente o propiedad
   institucional inválida (incluye currículos legacy sin `schoolId`).
   La vista previa no modifica datos ni consulta a Abeka.

4. Resolver explícitamente las anomalías antes de migrar. No inferir propiedad
   por títulos ni escoger una materia arbitrariamente. Durante los lotes no
   modificar las referencias del inventario desde el dashboard de Convex,
   scripts o migraciones paralelas: esas escrituras administrativas no pasan por
   la protección de las mutaciones de la aplicación. No reanudar lotes iniciados
   con una versión sin esta protección sin revisar primero los datos ya copiados.
5. Ejecutar la función **interna** `abekaCurriculumLinks:migrateBatch`:

   ```json
   { "connectionId": "ID_CONEXION" }
   ```

   Cada llamada procesa hasta 50 vínculos; repetir exactamente los mismos
   argumentos hasta obtener `done: true`. El cursor se guarda en la conexión,
   junto con los vínculos del lote. No hay un cursor externo que pueda saltarse
   registros. Una conexión sin vínculos también debe pasar por este paso.

6. Si falla por `INVALID_LEGACY_LINK` o `CONFLICTING_CURRICULUM_LINKS`, detenerse.
   El lote completo se revierte y el perfil sigue leyendo los vínculos antiguos.
   No borrar staging ni modificar el marcador a mano. Revisar tanto el inventario
   original como los lotes ya copiados antes de acordar y ejecutar una reparación.
7. Verificar que cada currículo esperado aparece una sola vez, que el selector
   permite guardar y quitar asociaciones, y que el perfil conserva porcentaje,
   fecha, detalle de lecciones y progreso Flexidual. Comprobar otro curso/campus
   que use el mismo currículo, y un alumno sin reporte propio (sin anillo Abeka).
8. Comparar los documentos de progreso, estudiantes y secretos con el respaldo:
   esta migración no debe haberlos modificado. Probar desvincular y volver a
   vincular únicamente una asociación de prueba autorizada.

Repetir una migración terminada no escribe nada. Los vínculos legacy no son un
fallback después del marcador: no pueden resucitar asociaciones eliminadas.
No quitar `curriculumLinksMigratedAt` para hacer rollback; las modificaciones
posteriores al cambio solo existen en la tabla nueva. Conservar el backend
compatible si se revierte temporalmente la interfaz.

## Limpieza posterior

Solo después de verificar todas las conexiones, retirar los endpoints,
lecturas y tabla legacy en un cambio independiente. Nunca eliminar los
reportes ni recrear conexiones para realizar esta migración.

Referencias: [esquemas de Convex](https://docs.convex.dev/database/schemas),
[transacciones de mutaciones](https://docs.convex.dev/functions/mutation-functions#transactions).
