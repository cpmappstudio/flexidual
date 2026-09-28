# Encuestas de PostHog: activación en producción

El código admite producción, pero publicar `main` **no activa la encuesta por sí solo**.
No se envían campañas masivas: se incorpora a cada profesor/director de campus cuando
visita la aplicación y PostHog confirma su elegibilidad. No aparece para estudiantes,
tutores, administradores ni superadministradores, ni dentro de una clase en vivo.
Las respuestas quedan en PostHog; Convex solo guarda participación y recordatorios.

## 1. Preparar la encuesta definitiva en PostHog

- Usa el proyecto US correspondiente al token público `phc_…` del frontend. El backend
  de recordatorios utiliza `https://us.i.posthog.com`; no configures un proyecto EU.
- Conserva la encuesta DEV separada. La encuesta encontrada durante la revisión fue
  `Your experience with Flexidual`, ID `01a0d5a5-3016-0000-c301-bf63d8647088`.
  Verifica que sea la definitiva antes de usar ese ID. Ambas encuestas tenían una
  condición de URL de localhost: no basta con que estén en estado activo.
- Configura la URL de visualización como `https://TU-DOMINIO/` con coincidencia
  `contains` (sin rutas específicas). Las invitaciones abren
  `/{en|es}/{campus}/catalog`. No uses condiciones de eventos, acciones, selector o
  dispositivo: este formulario tiene un flujo por página y rechaza esas condiciones.
- Revisa la audiencia y sus feature flags: debe permitir a profesores/directores
  reales (`role = teacher` o `principal`), sin restricciones a cuentas de prueba,
  localhost ni `environment = development`. Se identifica con el ID de Clerk y rol,
  no se envían emails para segmentación. Los eventos de respuesta incluyen
  `environment = production`.
- Comprueba preguntas/traducciones y publica la encuesta (fecha de inicio vigente,
  sin fecha de finalización). El SDK decide elegibilidad; no se fuerza su aparición.
- Si ya tiene respuestas históricas recogidas fuera de este flujo, **no actives los
  recordatorios de esa misma encuesta sin reconciliar completados**. No existe un
  backfill automático de PostHog a Convex. Para una nueva campaña, duplica la encuesta
  y usa el nuevo ID en ambos sistemas; conserva las respuestas de la anterior.

## 2. Desplegar el backend y configurar la campaña

En Convex selecciona **producción de flexidual**, `blessed-wombat-104`. Despliega el
backend del commit que contiene esta guía mediante tu flujo habitual de producción.
Que el frontend esté publicado no garantiza que Convex haya recibido ese código.

En Functions, ejecuta la función interna `surveyNotifications:configure`:

```json
{
  "surveyId": "ID_DE_LA_ENCUESTA_DEFINITIVA",
  "projectToken": "phc_TOKEN_PUBLICO_DEL_PROYECTO",
  "enabled": true,
  "origin": "https://TU-DOMINIO"
}
```

Usa el origen HTTPS exacto del frontend, sin rutas, parámetros, usuario ni contraseña.
No se necesita una clave personal de PostHog ni nuevas variables secretas en Convex:
estos valores se guardan en `surveyCampaigns` a través de esa función interna.
Repetirla para el mismo ID actualiza la campaña sin borrar completados o recordatorios.
Conserva el ID que devuelve; puedes ejecutar `surveyNotifications:refreshCampaign`
con `{"campaignId":"ID_DEVUELTO"}` para comprobar su estado activo, o esperar al
cron horario existente. No registres otro cron.

## 3. Configurar el frontend y reconstruir

En el alojamiento de Next.js (por ejemplo Vercel), entorno **Production**, configura:

```dotenv
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_TOKEN_PUBLICO_DEL_PROYECTO
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_SURVEY_ID=ID_DE_LA_ENCUESTA_DEFINITIVA
NEXT_PUBLIC_POSTHOG_NOTIFICATIONS_ENABLED=true
NEXT_PUBLIC_APP_URL=https://TU-DOMINIO
```

Los valores de token, ID y origen deben coincidir con la campaña de Convex. No uses
una clave personal `phx_…` como token público. Conserva `NEXT_PUBLIC_CONVEX_URL`
apuntando al deployment de producción.

`NEXT_PUBLIC_POSTHOG_TEST_SURVEY_ID` solo se utiliza en desarrollo sobre localhost;
no activa producción y no sirve como reemplazo del nuevo `SURVEY_ID`.
Los builds de preview quedan excluidos cuando su origen no coincide con `APP_URL`.
No copies el dominio de un preview a esta configuración de producción.

**Reconstruye y vuelve a desplegar Next.js después de cambiar estas variables.**
Son valores incorporados al JavaScript durante el build, no ajustes dinámicos.
Activa esto después de configurar Convex; si falta la campaña o está desactivada,
el formulario permanece oculto. Grabación de sesiones, autocapture y pageviews
continúan desactivados.

## 4. Comprobación final y desactivación

1. Con un profesor/director elegible que no haya respondido, entra al catálogo en el
   dominio real. Comprueba la encuesta y la invitación en la campana.
2. Minimiza con X, abre desde la campana y verifica que conserva las respuestas
   mientras sigue montada. Recargar la página no conserva un borrador no enviado.
3. Envía una respuesta de prueba acordada y verifica su recepción en PostHog. Convex
   recibe el reconocimiento del SDK; no es una confirmación de ingestión de PostHog.
4. Abre otra sesión del mismo usuario: no debe volver a aparecer ni recibir recordatorios.
   Verifica otra cuenta, inglés/español y móvil; estudiantes y clases en vivo quedan excluidos.
5. Si sigue pendiente: máximo tres recordatorios separados por siete días, reutilizando
   una sola notificación. El cron revisa cada hora, no exactamente al minuto.

Para detener formulario e invitaciones, vuelve a ejecutar `configure` con los mismos
datos y `enabled: false`. No borres participaciones ni marcadores de completado.
Detener la encuesta en PostHog también impide nuevas visualizaciones según la evaluación
del SDK; Convex deja de recordar y oculta invitaciones al refrescar (hasta una hora).
Apagar la variable del frontend requiere rebuild y **no detiene por sí solo** el cron:
desactiva también la campaña en Convex.

## Referencias

- [Variables públicas y build en Next.js](https://nextjs.org/docs/15/app/guides/environment-variables#bundling-environment-variables-for-the-browser)
- [Encuestas personalizadas de PostHog](https://posthog.com/docs/surveys/implementing-custom-surveys)
- [Flags API de PostHog](https://posthog.com/docs/api/flags)

## Historial de validación local (anterior a la habilitación de producción)

## Local validation status — 2026-09-24

- Enabled the local frontend switch in the ignored `.env.local` (the committed example remains disabled).
- Configured the DEV campaign for survey `01a0d5d2-2f5f-0000-c878-21ee6142c8cc` on `dev:dynamic-meerkat-158`, restricted to `http://localhost:3000`. No production activation or code deployment was performed for this configuration step.
- The PostHog DEV survey was active when checked. Ran the campaign refresh on DEV.
- After activation, verified a real DEV participation with its initial `survey_invitation`, zero reminders sent and a next reminder scheduled. No survey answers were submitted by the agent.
- Re-ran all 493 tests successfully (134 unit, 234 component, 125 Convex) and TypeScript with `--noEmit --incremental false`.
- **Manual acceptance still pending:** refresh localhost as an eligible test teacher who has not completed this DEV survey, minimize with X, and open it from the bell. Complete it and check another session of the same account. Safari automation permissions were unavailable, so these real-browser checks have not been claimed as passed.
- Do not clear an existing completion marker to force another invitation; use another eligible test account. Completed users should remain excluded.
- At that time production rollout was explicitly deferred. The production steps above now supersede that local-only restriction.

## Behavior

- Reuses the existing notification bell. Clicking an invitation opens the catalog and expands the selected survey; it never bypasses SDK eligibility.
- Enrolls an authenticated teacher/principal on their first eligible survey visit. This is not an automatic broadcast to staff who have never visited the survey.
- One initial invitation, then at most three reminders, each at least seven days after the previous delivery. Reminders resurface the same notification row.
- Convex stores only completion/delivery state. Answers stay in PostHog. Completion is the authenticated user's SDK completion acknowledgement, **not** an ingestion receipt from PostHog. A local completion marker is retried on reconnect/next visit.
- Completion hides the invitation across devices. A paused/ended PostHog survey suppresses reminders and hides invitations after the hourly refresh. This is not instantaneous synchronization.
- Re-checks active status, campus role, destination and PostHog audience/linked flags before sending. Internal already-seen flags are replaced by our per-user completion state, matching the repeatable local panel. External failures defer delivery.
- Bounded processing: 10 campaigns per cron page, 25 due recipients per campaign per hourly run. Larger bursts drain over subsequent runs. Ineligible recipients are reconsidered the following day without spending a reminder.
- Read notifications disappear from the UI seven days after `readAt`; unread notifications remain. Database records, chat read markers and deduplication keys are not deleted. The open feed refreshes its clock every minute.

## Enable a controlled DEV test

Nothing is activated by checking in these files. The frontend switch defaults to false and there are no campaign seeds.

1. Confirm the Convex target is **dev**, not production. With approval, deploy the backend/schema changes to that development deployment. Do not run `pnpm dev` against an unchecked target (it starts the backend watcher).
2. In that DEV dashboard, run the **internal** `surveyNotifications:configure` function with `surveyId` = the DEV survey ID, `projectToken` = its public PostHog project token, `enabled` = true, `origin` = `http://localhost:3000`. No personal PostHog API key is required.
3. Set `NEXT_PUBLIC_POSTHOG_NOTIFICATIONS_ENABLED=true` in the local environment and restart **only** `pnpm dev:frontend`. Keep `NEXT_PUBLIC_POSTHOG_TEST_SURVEY_ID` pointing to the same DEV survey.
4. Log in as a test teacher/principal in a campus. The SDK must find the survey eligible before creating a participation record. Verify the notification opens the minimized survey with draft answers intact.
5. Complete it and verify another browser/account session for the same user does not receive further invitations. Test another staff account for isolation.
6. Stop the survey in PostHog and run internal `surveyNotifications:refreshCampaign` on DEV (or wait for the hourly refresh): its notification should be hidden. Resume, repeat the refresh and verify no completed user is notified.

To disable notification delivery, configure the campaign with `enabled: false`. Existing invitations become invisible immediately in Convex. Disable the frontend switch if the backend is rolled back.

## Verification and release boundary

Unit tests use `convex-test` and mock every PostHog request; no real invitations or analytics events are sent. Production activation remains an operator step, documented above. Existing completed responses from browsers without our completion marker are not backfilled from PostHog; reconcile these before reusing a campaign with historical responses.

PostHog audience evaluation uses the documented [flags API](https://posthog.com/docs/api/flags).
