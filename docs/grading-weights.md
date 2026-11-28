# Ponderación institucional y por curso

La ponderación configura cómo se agruparán las notas en reportes. No calcula una
nota final ni cambia las notas, escalas, umbrales, borradores o publicaciones
existentes.

## Herencia

- `schools.gradingWeights` define los porcentajes institucionales.
- Un curso sin `classes.gradingWeights` hereda los valores institucionales
  **vigentes**, aunque se haya creado antes de configurar esos valores.
- Un curso con `gradingWeights` conserva un reparto propio completo. Cambiar la
  institución no modifica ese reparto.
- Desactivar «Personalizar ponderación de este curso» elimina únicamente la
  personalización y vuelve a los valores institucionales actuales.
- Si no existe ninguna configuración, la consulta devuelve `weights: null`.
  No se supone un reparto 50/50 ni se transforma la ausencia en cero.

Los cambios institucionales afectan al reparto efectivo de los cursos que heredan.
Por eso estos datos representan la configuración actual, no un historial de
ponderaciones para reconstruir reportes de fechas anteriores.

## Categorías y validación

`lib/grading-weights.ts` define las categorías admitidas, separadas de los
formatos `files` y `quiz`. Inicialmente son `assignment` y `quiz`; los nombres
visibles se traducen en `messages/`. Añadir otra categoría no requiere otro motor
de calificación ni columnas por categoría.

Cada entrada contiene `category` y `weightBps`: 20% se guarda como 2000 y 100%
como 10000. Se admiten dos decimales porcentuales y 0% para una categoría que no
contribuya. No se admiten duplicados, categorías desconocidas, valores fuera de
rango ni repartos cuya suma no sea exactamente 10000. Una categoría omitida tiene
peso cero; esto permite ampliar el catálogo sin redistribuir porcentajes guardados.

`courseTasks.gradingCategory` identifica la categoría de una actividad calificable.
Los editores nuevos proponen la categoría habitual, pero esta no se deduce al leer
registros antiguos. Una actividad existente puede clasificarse explícitamente;
una vez asignada una categoría y creada una evaluación, no se puede cambiar.
La escala y `expectedGrading` no incluyen porcentajes ni categorías.

## Responsabilidades y seguridad

- `lib/grading-weights.ts`: reglas puras y conversión de porcentajes del formulario.
- `convex/model/gradingWeights.ts`: validadores, resolución de herencia y
  comprobaciones de versiones/categoría.
- `academicSettings`: consultas y escritura institucional autorizadas.
- `classes.createWithSchedule` / `classes.update`: configuración propia del curso,
  con los permisos administrativos existentes.
- `GradingWeightsFields`: los mismos controles para institución y curso.

Los profesores que pueden calificar no reciben por ello permiso para editar el
reparto del curso. Las escrituras comprueban `expectedVersion` institucional o
`expectedGradingWeightsVersion` del curso. Un formulario antiguo que omita estos
campos conserva la configuración. Las lecturas solo resuelven curso/institución:
no recorren notas ni alumnos y no escriben datos.

## Límites de esta fase y los ocho puntos del estudio

1. No se crea un total que pueda revelar notas de quices ocultas.
2. No se mezclan unidades de notas: el motor numérico existente no cambia.
3. La categoría de evaluación es independiente del formato de actividad.
4. La herencia es explícita y vigente; los reportes históricos necesitarán su
   propio contrato temporal antes de implementarse.
5. No hay clasificación ni migración automática de actividades antiguas.
6. Se conservan los límites de permisos institucionales y del curso.
7. La configuración no añade escaneos de notas, contadores ni trabajos de resumen.
8. La ponderación está separada de `GradingPolicy` y del contexto de escritura de
   cada nota.

Los futuros reportes deben acordar el promedio por categoría, el tratamiento de
notas pendientes y las reglas de historial. Deben reutilizar la autorización y la
visibilidad del resultado, incluido el cierre de quices; no basta con sumar todo
lo almacenado en `published`. No se añaden todavía agregados ni trabajos de
recalcular notas.
