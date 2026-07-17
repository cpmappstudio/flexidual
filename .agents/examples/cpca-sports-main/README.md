Implementación de **sistema multitenant de gestión de inscripciones y pagos** para múltiples compañías (“organizaciones”). El MVP cubre: alta de organizaciones, administración de “ofertas” (antes “etiquetas”), prerregistro de usuarios, revisión y admisión, gestión de cuentas registradas y asignación/registro de **fees** (cargos) con pagos en línea o en efectivo.

---
## Alcance y contexto
- **Multitenancy**: cada organización opera aislada del resto; todas las entidades de negocio llevan `organization_id`.
- **Portal público por organización**: `https://cpca/{org_slug}/` expone ingreso y prerregistro.
- **Panel interno**: `https://cpca/{org_slug}/admin` para el personal autorizado (admin y staff).

---
## Actores y roles
- **Superadmin (plataforma)**: crea organizaciones y su usuario administrador inicial.
- **Administrador de organización (admin)**: configura ofertas, fees, formularios; gestiona usuarios, staff y solicitudes; ve toda la información de su organización.
- **Staff**: usuario interno con acceso **restringido por oferta(s)** asignada(s); gestiona únicamente solicitudes y datos vinculados a esas ofertas.
- **Solicitante**: persona externa que realiza un **prerregistro**.
- **Usuario registrado (miembro)**: solicitante aceptado que ya posee cuenta y acceso a su panel de estado y finanzas.

```mermaid
mindmap
  root((Actores y Roles))
    Superadmin
      Crea organizaciones
      Invita/crea admin inicial
      Ámbito: plataforma
    Admin de organización
      Configura ofertas y formularios
      Define fees - templates
      Gestiona staff y solicitudes
      Acceso: toda la organización
    Staff
      Acceso restringido por ofertas
      Revisa/edita solicitudes
      Adjunta archivos y asigna responsable
      Puede registrar pagos en efectivo
    Solicitante
      Realiza prerregistro
      Selecciona oferta y envía formulario
    Usuario registrado -miembro
      Accede a su panel
      Consulta estado y finanzas
      Realiza pagos en línea
```

---
## Modelo de dominio (conceptos principales)
### Organización
- **Campos**: `name`, `slug` (p. ej., “A”), `status {active,inactive}`.
- Creada por **Superadmin** junto con el **admin** inicial (“adminA”).
### Oferta (también “objeto de cobro”)
Unidad de inscripción y cobro, e. g., _fútbol_, _baloncesto_, _curso X_.
- **Campos**: `name`, `description`, `status {active,inactive}`.
- **Asociación a fees**: conjunto de **fees predefinidos** (con indicador de obligatoriedad) que podrán asignarse a los usuarios registrados de esa oferta.

> Nota de nomenclatura: “**Oferta**” es más general que “objeto de cobro” y refleja que puede implicar inscripción y pagos. Internamente puede usarse el término `offering`.
### Fee
- **Dos niveles**:
    1. **FeeTemplate** (definición a nivel de oferta): `name`, `description`, `amount`, `currency`, `is_required`, `periodicity {one_time,recurring}`, `status`.
    2. **FeeAssignment** (asignación a un usuario registrado): referencia al template o **fee ad-hoc** (monto y descripción personalizados), `due_date`, `status {pending,paid,void,failed}`, `notes`.
### Formulario de prerregistro (FormTemplate)
- **Campos**: `name`, `json_schema` (definición de campos), `version`, `is_public`.
- **Relación**: una o varias **ofertas** pueden vincularse a un mismo formulario; una misma oferta puede aceptar múltiples formularios si procede.
### Solicitud / Aplicación (Application)
Instancia de prerregistro enviada por un solicitante para una **oferta** concreta.
- **Campos**: `applicant_email`, `data` (respuestas), `status {draft,submitted,under_review,changes_requested,approved,rejected}`, `assignee_user_id` (responsable), `attachments[]` (archivos añadidos por staff), `timestamps`.
- **Reglas**:
    - El **staff** puede **editar campos** y **adjuntar archivos** al evaluar.
    - El **rechazo** exige **motivo** (campo de texto obligatorio).
### Usuario registrado y pertenencias
- Al **aprobar** una solicitud se crea la **cuenta de usuario** (si no existe) y su **membresía** en la organización. En el caso de ya existir se añade la oferta adicional.
- Note que el usuario es creado con una oferta asociada.
### Pagos
- **Pasarela** para pagos en línea (p. ej., integración con una gateway; el texto contempla _Clerk Payments_ como alternativa).
- **Pagos en efectivo**: el staff puede **marcar manualmente** un fee como pagado; siempre se registra **fecha de pago** y **responsable** para auditoría.
- **Historial**: todos los pagos generan una **transacción** con `timestamp` para conciliación y filtros posteriores.

---
## Flujos operativos
```mermaid
erDiagram
  ORGANIZATION ||--o{ MEMBERSHIP : "has"
  USER ||--o{ MEMBERSHIP : "has"
  ORGANIZATION ||--o{ OFFERING : "owns"
  ORGANIZATION ||--o{ FORMTEMPLATE : "owns"
  OFFERING }o--o{ FORMTEMPLATE : "allowed via OFFERING_FORM_TEMPLATE"
  OFFERING ||--o{ APPLICATION : "receives"
  FORMTEMPLATE ||--o{ APPLICATION : "instantiates"
  APPLICATION }o--o{ ATTACHMENT : "has"
  APPLICATION }o--o| USER : "assignee (staff) 0..1"
  APPLICATION ||--o{ REVIEW : "has"
  USER ||--o{ ENROLLMENT : "has"
  OFFERING ||--o{ ENROLLMENT : "for"
  ORGANIZATION ||--o{ ENROLLMENT : "owns"
  OFFERING ||--o{ FEETEMPLATE : "defines"
  ENROLLMENT ||--o{ FEEASSIGNMENT : "gets"
  FEETEMPLATE o{--o| FEEASSIGNMENT : "based_on 0..1"
  FEEASSIGNMENT ||--o{ INVOICE : "generates"
  INVOICE ||--o{ TRANSACTION : "has"
  MEMBERSHIP ||--o{ MEMBERSHIP_OFFERING : "scope"
  OFFERING  ||--o{ MEMBERSHIP_OFFERING : "scope"

  %% --- Entities with attributes ---
  ORGANIZATION {
    uuid id
    string name
    string slug
    enum status
    datetime created_at
  }
  USER {
    uuid id
    string email
    string name
    datetime created_at
  }
  MEMBERSHIP {
    uuid id
    uuid organization_id
    uuid user_id
    enum role  
    datetime created_at
  }
  OFFERING {
    uuid id
    uuid organization_id
    string name
    string description
    string slug
    enum status
    datetime created_at
  }
  FORMTEMPLATE {
    uuid id
    uuid organization_id
    string name
    json  json_schema
    int   version
    bool  is_public
    datetime created_at
  }
  OFFERING_FORM_TEMPLATE {
    uuid id
    uuid organization_id
    uuid offering_id
    uuid form_template_id
  }
  APPLICATION {
    uuid id
    uuid organization_id
    uuid offering_id
    uuid form_template_id
    string applicant_email
    json   data
    enum   status
    uuid   assignee_user_id
    datetime created_at
    datetime submitted_at
  }
  ATTACHMENT {
    uuid id
    uuid application_id
    uuid uploaded_by_user_id
    string path_or_url
    string description
    datetime created_at
  }
  REVIEW {
    uuid id
    uuid application_id
    uuid reviewer_user_id
    enum decision    
    string notes
    datetime created_at
  }
  ENROLLMENT {
    uuid id
    uuid organization_id
    uuid offering_id
    uuid user_id
    enum status      
    datetime created_at
  }
  FEETEMPLATE {
    uuid id
    uuid offering_id
    string name
    string description
    int    amount_cents
    string currency
    bool   is_required
    enum   periodicity  
    enum   status      
  }
  FEEASSIGNMENT {
    uuid id
    uuid organization_id
    uuid enrollment_id
    uuid fee_template_id
    int    amount_cents
    string currency
    date   due_date
    enum   status      
    string notes
  }
  INVOICE {
    uuid id
    uuid organization_id
    uuid fee_assignment_id
    int    amount_cents
    string currency
    enum   status      
    date   due_date
    datetime created_at
  }
  TRANSACTION {
    uuid id
    uuid invoice_id
    string provider      
    string provider_ref
    enum   status        
    datetime created_at
    datetime paid_at
  }
  MEMBERSHIP_OFFERING {
    uuid id
    uuid membership_id
    uuid offering_id
    datetime created_at
  }
```
### Alta de organización
1. **Superadmin** crea `Organization (A)` y **adminA**.
2. adminA accede a `cpca/A/admin`.
### Configuración inicial del admin
1. Crea **Ofertas** (e. g., _fútbol_, _baloncesto_) con `name`, `description`, `status`.
2. Define **FeeTemplates** por oferta (monto, obligatoriedad, periodicidad).
3. Crea **FormTemplates** (campos personalizados) y los **asocia** a una o varias ofertas.
4. Crea **staff**: `name`, `email`, `phone` y **ofertas asignadas** (una o varias).
    - El **ámbito de visibilidad** del staff queda limitado a sus ofertas.
### Prerregistro público
1. El solicitante visita `https://cpca/A/`.
    La vista ofrece **ingreso** y **opción de prerregistro** (la autenticación distingue roles y redirige).
2. El solicitante elige una **oferta**; el sistema muestra el **formulario** asociado.
3. Envía la **solicitud** → pasa a `submitted` y queda **visible en el panel** de “Solicitudes”.
### Revisión por staff/admin
1. **Listado de solicitudes**:
    - **Staff** ve **solo** las de sus **ofertas asignadas**.
    - **Admin** ve **todas** las de la organización.
2. En cada solicitud: **editar campos**, **adjuntar archivos**, **asignar responsable** (opcional y solo con objeto de trazabilidad y organización).
3. **Decisión**:
    - **Aprobar** → crear cuenta (si aplica), membresía e inscripción; mover a “**Registrados**”.
    - **Rechazar** → motivo obligatorio; notificación al solicitante si está habilitada.
    - **Solicitar cambios** → vuelve a `changes_requested`.
### Gestión de usuarios registrados y finanzas
1. En el perfil del **usuario registrado**:
    - Ver y **editar datos** (según permisos).
    - **Asignar fees**: desde los **templates** de la oferta o **crear fee ad-hoc**.
2. **Balances** visibles para staff/admin y para el propio usuario:
    - **Pendiente (pending)**, **Pagado (paid)** y **Balance total**.
3. **Pagos**:
    - **En línea** (pasarela integrada).
    - **En efectivo**: staff marca como **pagado**, se registra **fecha** y **responsable**.
4. **Historial y filtros**:
    - Cada pago conserva su **fecha de pago** y estado para búsquedas, reportes y conciliación.

---
## Reglas de negocio clave
- Toda consulta y mutación se restringe por `organization_id`.
- **Staff** solo accede a datos **vinculados** a sus ofertas.
- **Rechazos** deben incluir **justificación** textual.
- **Pagos en efectivo** no sustituyen registros de la pasarela: generan **asientos** equivalentes con metadatos de auditoría.
- Los **FeeTemplates** marcan obligatoriedad; la **asignación efectiva** a cada usuario puede planificarse por fechas y periodicidad.
- **Estados** son inmutables en histórico (no se borran; se agregan **eventos** de corrección o reverso).

---
## Vistas del sistema (MVP)
### Panel del admin
- Resumen general (solicitudes por estado, montos pendientes/pagados).
- CRUD de **Ofertas**, **FeeTemplates**, **FormTemplates**.
- Gestión de **staff** y **permisos por oferta**.
- Listados globales: **Solicitudes**, **Registrados**, **Pagos**.
### Panel del staff
- **Solicitudes** de sus ofertas: filtros por estado, responsable, fecha.
- Detalle de solicitud: edición de campos, adjuntos, asignación, decisión.
- **Registrados** de sus ofertas: ficha con datos y **finanzas** (asignación de fees, registro de pagos en efectivo).
### Panel del usuario registrado
- Estado de su(s) oferta(s) y **finanzas**: fees **pendientes** y **pagados**.
- Flujo de **pago en línea** y comprobantes.
### Portal público
- Ingreso (autenticación) y **prerregistro** por **oferta**.

```mermaid
architecture-beta
  group clients(cloud)[Clients]
    service admin(internet)[Admin Staff] in clients
    service member(internet)[Member] in clients
    service applicant(internet)[Applicant] in clients

  group web(cloud)[Frontend]
    service next(server)[Next App] in web

  group identity(cloud)[Clerk]
    service clerk_auth(server)[Clerk Auth] in identity
    service clerk_pay(server)[Clerk Payments] in identity

  group backend(cloud)[Convex]
    service convex_api(server)[Convex Functions] in backend
    service convex_db(database)[Convex Database] in backend
    service convex_storage(disk)[Convex Storage] in backend

  admin:R -- L:next
  member:R -- L:next
  applicant:R -- L:next

  next:B -- T:clerk_auth
  next:B -- T:clerk_pay

  next:R -- L:convex_api
  convex_api:R -- L:convex_db
  convex_api:B -- T:convex_storage

  clerk_pay:R --> L:convex_api

```
---
## Estados y transiciones (resumen)
- **Solicitud**: `draft → submitted → under_review → {approved | rejected | changes_requested} → (si changes) submitted`.
- **Asignación** de responsable: editable mientras `under_review`.
- **FeeAssignment**: `pending → paid | void | failed` (cada transición registra fecha y actor).
- **Usuario**: al **approved** se crea la cuenta/membresía; aparece en “Registrados”.

---
## Seguridad y cumplimiento
- **Control de acceso por rol y por oferta** (scoping fino).
- **Auditoría**: toda acción crítica (aprobación, rechazo, asignación, registro de pago en efectivo) registra usuario, marca de tiempo y justificación cuando aplique.
- **Trazabilidad financiera**: relación FeeAssignment ↔ Transacciones/Pagos (incluida la marca de “pago en efectivo”).

---
## Consideraciones de diseño (para guiar la implementación)
- Mantener **separación** entre _definición_ de fees (templates) y _asignaciones_ a usuarios.
- Formularios **versionados**; cada solicitud guarda `template_version`.
- URLs con `org_slug` para ruteo y aislamiento.
- Los **filtros por fecha de pago** y estado deben estar **indexados** para reportes.

---
## Glosario
- **Oferta (Offering)**: unidad de inscripción y cobro (sustituye a “etiqueta”).
- **FeeTemplate**: definición de cargo asociada a una oferta.
- **FeeAssignment**: cargo asignado a un usuario (puede ser ad-hoc).
- **Solicitud/Aplicación**: prerregistro que inicia el proceso.
- **Registrado/Miembro**: usuario aceptado con acceso a su panel.
