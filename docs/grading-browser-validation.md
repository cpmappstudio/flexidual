# Calificaciones: validación en Chrome

## Entorno y ejecución

Validado el 12 de noviembre de 2026 con Chrome real (canal `chrome`, headless),
Next.js local y Convex de desarrollo `dynamic-meerkat-158`. Se usan sesiones
independientes de Clerk de prueba, sin simular las consultas, mutaciones o subidas.

Con el frontend local y el backend de desarrollo actualizados:

```sh
pnpm run dev:frontend
# En otra terminal de la carpeta principal:
pnpm exec node scripts/audit-grading-browser.mjs
```

Si el frontend local está en otro puerto, por ejemplo 3001, ejecutar
`PORT=3001 pnpm exec node scripts/audit-grading-browser.mjs`.

El script rechaza otro despliegue o claves de Clerk que no sean de prueba.
Además, bloquea y considera un fallo cualquier petición del navegador al dominio
de producción de FlexiDual o a su despliegue Convex.

Con la fixture de desarrollo ya creada, la prueba de publicación masiva se
ejecuta por separado:

```sh
pnpm exec node scripts/audit-grading-browser.mjs --bulk-only
```

Usa una actividad nueva y 54 filas de estudiantes de prueba (20 visibles al
publicar).
Comprueba que una entrada inválida bloquea la publicación antes de enviar nada y
que, después de corregirla, se publican las 52 notas válidas en dos lotes. El
borrador inválido sembrado en el servidor y el de una entrega reemplazada por
el estudiante no se publican. El resultado queda en `bulk-report.json`.

## Casos comprobados

1. Borrador local: cerrar, reabrir y recargar conserva los valores sin publicar.
2. Guardar borrador: el estudiante no recibe su contenido, ni por interfaz ni por API.
3. Un estudiante autenticado no puede guardar ni publicar calificaciones.
4. Publicar muestra la nota al estudiante sin recargar y la conserva tras recargar.
5. Subir un PDF conserva la nota publicada y señala que debe revisarse la entrega.
6. Reentregar otro PDF impide publicar el borrador de la revisión anterior; una
   nueva evaluación conserva ambas publicaciones en el historial. No se permite
   retomar el borrador local de una entrega anterior.
7. Una actividad con evaluaciones rechaza cambiar su escala sin alterar las notas.
8. Cambiar la escala desde otra pestaña antes de la primera evaluación no
   reinterpreta el borrador abierto. Se rechaza una petición retrasada con la escala
   anterior, y el borrador sigue disponible tras recargar para su revisión.
9. Con `sessionStorage` realmente lleno, el borrador en memoria puede guardarse
   en Convex; después de recargar se recupera el guardado del servidor sin modificar
   la última nota publicada.
10. Un guardado demorado no borra un borrador escrito después de cerrar y reabrir
    la revisión. Si la entrega y la escala no cambiaron, «Conservar mi borrador»
    permite retomar la edición incluso después de recargar. Solo «Guardar borrador»
    envía los cambios a Convex y la nota sigue sin publicar.

## Datos y evidencias

El primer uso crea dos cuentas de prueba, un currículo y un curso identificados
como `GRADING CHROME AUDIT`. Cada repetición añade actividades nuevas a ese curso;
no reinicia ni borra notas publicadas por ejecuciones anteriores. No modifica la
política institucional, otros cursos ni sus entregas.

El registro de la fixture, el informe y las capturas quedan en
`scripts/data/grading-browser/`, que ya está excluido de Git. El script no guarda
contraseñas ni tokens de sesión. No añade endpoints de prueba al backend.

## Límites

Esto valida el flujo funcional de esta fase, no una prueba de carga ni todos los
navegadores. Si el navegador no permite guardar un borrador local y se cierra antes
de confirmarlo en Convex, no puede garantizarse su recuperación; el editor avisa de
cambios sin guardar. No se ha probado ni modificado producción.
