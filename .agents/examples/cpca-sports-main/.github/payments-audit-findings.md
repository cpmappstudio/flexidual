# Auditoría técnica de Payments (MVP)

Fecha: 2026-02-06
Estado: Revisión estática de código (sin cambios funcionales aplicados)

## Resumen ejecutivo

La base del producto está bien orientada para MVP (separación por dominio y estructura clara), pero existen riesgos críticos de seguridad y confiabilidad que deben resolverse antes de escalar o abrir más clientes.

## Hallazgos por severidad

### Critical

1. Operación sensible expuesta sin autorización en `createPaymentLink`.
- Impacto: cualquier cliente podría intentar crear links de pago si conoce IDs válidos.
- Evidencia: `convex/square.ts:16`, `convex/square.ts:27`, `convex/square.ts:37`.

2. Queries públicas con datos sensibles sin control de acceso.
- Impacto: posible fuga de datos entre tenants (usuarios, membresías, organizaciones, templates).
- Evidencia: `convex/members.ts:23`, `convex/members.ts:42`, `convex/members.ts:93`, `convex/users.ts:80`, `convex/organizations.ts:18`, `convex/organizations.ts:32`, `convex/formTemplates.ts:64`, `convex/formTemplates.ts:80`.

3. Webhooks responden `200` aunque falle el procesamiento.
- Impacto: se detienen reintentos del proveedor y se pueden perder eventos (desincronización).
- Evidencia: `convex/http.ts:120`, `convex/http.ts:124`, `convex/http.ts:169`, `convex/http.ts:173`.

### High

4. `downPaymentPercent` no se aplica de forma efectiva al cobro online.
- Impacto: el sistema puede cobrar el total restante en vez del mínimo esperado.
- Evidencia: `convex/square.ts:52`, `convex/square.ts:56`, `convex/square.ts:71`.

5. Posible desajuste de centavos al distribuir pagos proporcionalmente.
- Impacto: inconsistencias contables por redondeo en asignación de montos.
- Evidencia: `convex/square.ts:315`, `convex/square.ts:323`, `convex/square.ts:351`.

### Medium

6. Uso intensivo de `collect()` sin paginación y filtros en memoria.
- Impacto: degradación de rendimiento a medida que crece el volumen de datos.
- Evidencia: `convex/applications.ts:401`, `convex/applications.ts:403`, `convex/transactions.ts:80`, `convex/documents.ts:118`, `convex/fees.ts:74`.

## Fortalezas actuales

1. Buena separación por dominio en Convex (`applications`, `fees`, `documents`, `transactions`, `square`, `http`).
2. Varios flujos críticos sí validan acceso correctamente (`verifyApplicationAccess` en fees/documents/transactions).
3. Guard de tenant activo en layout de shell.
- Evidencia: `app/[locale]/[tenant]/(shell)/layout.tsx:21`.

## Conclusión

No está en estado "production-ready" por los puntos `Critical`.

Sí es una base válida para MVP, siempre que se atiendan primero los riesgos de seguridad y confiabilidad de webhooks.

## Siguiente paso recomendado

Corregir primero en este orden:
1. Controles de autorización en funciones públicas y queries sensibles.
2. Estrategia de respuesta/retry en webhooks.
3. Lógica de monto mínimo/down payment en pagos online.
4. Paginación e índices para crecimiento.


Hallazgos (priorizados)**
1. **Medio - Costo de render innecesario por diálogo recurrente en cada item.**  
`components/sections/shell/applications/detail/payments/fee-card.tsx:559` monta `RecurringFeeEditDialog` por card aunque esté cerrado; ese diálogo calcula bastante estado/memo (`components/sections/shell/applications/detail/payments/recurring-fee-edit-dialog.tsx:307`). Con muchas cuotas puede degradar UI.

2. **Medio - Componentes muy grandes (SRP/maintainability).**  
`components/sections/shell/applications/detail/payments/payment-actions.tsx:92` y `components/sections/shell/applications/detail/payments/recurring-fee-edit-dialog.tsx:307` concentran demasiadas responsabilidades (UI + reglas + distribución + validaciones). Funciona, pero dificulta cambios y pruebas.

3. **Medio - Riesgo funcional en filtro por fecha fin de rango.**  
`components/sections/shell/applications/detail/payments/application-transaction-history.tsx:47` usa `isWithinInterval` con `end: dateRange.to` directo; puede excluir transacciones del mismo día en horas posteriores (según hora del `Date` seleccionado).

4. **Bajo - Código muerto / API sobrante.**  
Props no usadas en `components/sections/shell/applications/detail/payments/fee-card.tsx:62` y `components/sections/shell/applications/detail/payments/fee-card.tsx:63`.  
Campos de `StatusConfig` no usados en `components/sections/shell/applications/detail/payments/fee-card.tsx:89`, `components/sections/shell/applications/detail/payments/fee-card.tsx:90`, `components/sections/shell/applications/detail/payments/fee-card.tsx:91`.  
Esto rompe la regla de “no unused code” de tus instrucciones.

5. **Bajo - Inconsistencia con design system (checkbox nativo).**  
Se usan `<input type="checkbox">` en `components/sections/shell/applications/detail/payments/payment-actions.tsx:593` y `components/sections/shell/applications/detail/payments/recurring-fee-edit-dialog.tsx:790` (y similares), en lugar de `Checkbox` de UI; no rompe funcionalidad, pero sí consistencia/a11y visual.

6. **Bajo - Formateo de fechas no totalmente homogéneo i18n.**  
Hay mezcla de `date-fns format` e `Intl`/locale en `components/sections/shell/applications/detail/payments/date-range-popover.tsx:33` y `components/sections/shell/applications/detail/payments/application-transaction-history.tsx:60`. Para locales, conviene estandarizar.

**Validación técnica**
1. `pnpm exec eslint components/sections/shell/applications/detail/payments/*.tsx` pasó sin errores.
2. `pnpm exec tsc --noEmit` pasó sin errores.
3. `pnpm lint` falla por script base (`next lint`) mal configurado en este repo (no por estos archivos).

**Conclusión**
No veo **bloqueadores críticos** en esta carpeta para que empieces pruebas funcionales del MVP.  
Sí hay deuda técnica **media** (sobre todo tamaño de componentes y montaje del diálogo) que conviene atacar después de validar flujo en QA.
