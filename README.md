# Soft_Inmo

Plataforma SaaS multi-tenant para empresas inmobiliarias.

```text
apps/
├── api/   Backend NestJS + Prisma (puerto 3001)
└── web/   Frontend Next.js (puerto 3000)
```

## Primera vez

1. Abre XAMPP y enciende **MySQL**.
2. En una terminal, dentro de `apps/api`:

   ```bash
   node scripts/setup-env.mjs
   pnpm install
   pnpm db:migrate --name inicio
   pnpm db:generate
   pnpm db:seed
   ```

3. Opcional, con la API ya arrancada (`pnpm dev`): carga datos de demostración.

   ```bash
   node scripts/demo-data.mjs
   ```

   `setup-env` crea el archivo `.env`. `db:migrate` crea la base de datos `soft_inmo` y sus tablas. `db:seed` carga los cuatro planes,
   un superadmin y una empresa de demostración.

## Arrancar

Dos terminales:

```bash
cd apps/api
pnpm dev
```

```bash
cd apps/web
pnpm dev
```

| Zona | Dirección | Usuario | Contraseña |
| --- | --- | --- | --- |
| Empresa demo | http://demo.localhost:3000 | admin@demo.com | Cambiar123! |
| Superadmin | http://admin.localhost:3000 | superadmin@softinmo.com | Cambiar123! |

Cada subdominio es una empresa. Una sesión de una empresa no funciona en otra.

## Comandos útiles (en `apps/api`)

| Comando | Qué hace |
| --- | --- |
| `pnpm db:migrate --name <nombre>` | Aplica cambios del esquema a la base de datos |
| `pnpm db:generate` | Regenera el cliente de Prisma; ejecútalo después de cada migración |
| `pnpm db:studio` | Abre un visor de la base de datos |
| `pnpm test` | Ejecuta las pruebas unitarias (incluye las de aislamiento de tenant) |
| `node scripts/smoke.mjs` | Prueba de punta a punta de toda la Fase 1; requiere base recién sembrada y la API en marcha |

## Qué incluye la Fase 1

| Zona | Pantallas |
| --- | --- |
| Portal público (`empresa.localhost:3000`) | Listado de propiedades con filtros, ficha de propiedad, formulario "Me interesa" y solicitud de visita |
| Panel de empresa (`/app`) | Inicio (qué hacer hoy), Gestión comercial (tablero, lista y expediente con los 8 pasos), Propiedades, Contactos, Leads, Visitas, Equipo y plan, Auditoría |
| Superadmin (`admin.localhost:3000`) | Empresas (alta, plan, agentes adicionales, suspensión), Planes (precios, límites y funciones) |

## Qué agrega la Fase 2

| Módulo | Qué hace |
| --- | --- |
| Negociaciones | Ofertas, contraofertas y reserva dentro del expediente, con historial completo; al aceptar una oferta se fija el cliente y su monto se propone como precio de cierre |
| Documentos | Archivos privados (PDF, imágenes, Word, Excel) en expedientes, propiedades y contactos; solo se descargan con sesión y acceso al registro |
| Postventa | Entrega, satisfacción, testimonio (publicable en el portal con autorización) y referidos que entran como leads |
| Matching | Clientes compatibles con cada propiedad y propiedades compatibles con cada cliente |
| Favoritos | El visitante guarda propiedades en el portal sin crear cuenta |
| QR y estadísticas | Código QR por propiedad; vistas por fuente (QR, WhatsApp, redes) y por día, siempre agregadas |
| Marketing | Vistas y leads por fuente, publicaciones por canal, campañas |
| WhatsApp | Plantillas con variables y enlace que abre WhatsApp con el mensaje listo; cada envío queda en el historial |
| Notificaciones | Avisos dentro del sistema por lead, visita solicitada, oferta, reserva, documento y referido |

Marketing y matching dependen del plan (`marketing`, `matching` en las funciones del plan).

## Qué agrega la Fase 3 (finanzas)

| Módulo | Qué hace |
| --- | --- |
| Comisiones | Se generan solas al cerrar una operación, según reglas configurables (porcentaje o monto fijo, por operación y por agente). El porcentaje acordado en la captación manda sobre la regla. |
| Cuentas por cobrar | La comisión de la empresa entra como cuenta por cobrar al propietario; admite pagos parciales y muestra días de atraso. |
| Cuentas por pagar | Proveedores y agentes. Una liquidación aprobada entra aquí sola. |
| Ingresos y gastos | Cada cobro y cada pago es un movimiento. No se borran: se anulan con motivo y revierten el saldo. |
| Liquidaciones | Comisiones aprobadas + bonificaciones − deducciones − anticipos. Aprobar la crea como cuenta por pagar; pagarla marca las comisiones como pagadas. |
| Flujo de caja | Ingresos − gastos = flujo neto por día, semana, mes, trimestre o año, con acumulado. |
| Rentabilidad | Por operación (comisión empresa − agente − gastos del expediente) y por agente. |
| Reportes | 11 reportes en Excel, PDF y CSV, con filtro de fechas. |
| Auditoría | Los cambios financieros guardan el valor anterior y el nuevo. |

Los montos no se convierten entre monedas: todo se muestra por separado en dólares y bolivianos.
Finanzas las gestionan el administrador y el contador; el agente solo ve "Mis comisiones".
Planes: `finance_basic` da ingresos, gastos y comisiones; `finance_full` agrega cuentas, liquidaciones, flujo de caja y rentabilidad.

Roles: el administrador ve toda la empresa; el agente solo lo que tiene asignado; el contador solo consulta.

## Qué agrega la Fase 4 (inteligencia y automatización)

- **Asistente** (`/app/asistente`, plan Empresa o superior): responde preguntas con los datos de la empresa — qué hacer hoy, leads sin seguimiento, demanda, propiedades estancadas, rendimiento, negociaciones, clientes para una propiedad y propiedades para un cliente. Las cifras salen de reglas probadas (`apps/api/src/insights`), no de un modelo: si no sabe, lo dice.
- **Generador de contenido** (en la ficha de la propiedad, plan Profesional o superior): título, descripción, anuncio, redes, WhatsApp, email y llamada a la acción. Usa solo datos públicos de la ficha.
- **Proveedor de IA opcional**: con `ANTHROPIC_API_KEY` en `apps/api/.env` los textos los redacta el modelo (`AI_MODEL`); sin clave se usan plantillas propias. Todo pasa por `apps/api/src/ai/ai.service.ts`, así que cambiar de proveedor es tocar un solo archivo.
- **Cupo mensual de IA por plan** (`aiRequests` en los límites del plan) y consumo por empresa en `/superadmin/ia`.
- **Analítica** (`/app/analitica`): embudo comercial, rendimiento por agente, demanda de cada propiedad (30 días contra los 30 anteriores), zonas más buscadas y tiempo promedio de cierre. El agente ve solo lo suyo.
- **Alertas** (`/app/alertas`, todos los planes): leads sin contactar, visitas por confirmar, ofertas sin respuesta, expedientes detenidos, captaciones por vencer, propiedades sin interesados, cobros vencidos.
- **Tareas** (`/app/tareas`): manuales y automáticas, con responsable, prioridad y fecha límite.
- **Automatizaciones** (`/app/automatizaciones`, solo administrador): 3 por evento (lead nuevo, visita realizada, operación ganada) y 6 diarias (recordatorio de visitas, leads sin seguimiento, ofertas sin respuesta, captaciones por vencer, cobros vencidos, resumen diario). La API las revisa cada hora y cada una corre una sola vez por día y empresa. Con varios servidores, deja `AUTOMATIONS_SCHEDULER="on"` solo en uno.
- **Portal del propietario** (`/propietario`, plan Empresa o superior): el administrador da acceso desde `/app/propietarios`; el propietario ve sus propiedades, vistas, interesados (solo el número), visitas, ofertas y avance de la gestión. Nunca ve nombres ni teléfonos de los interesados, ni comisiones.

Lo que esta fase **no** hace: predicción de precios o de probabilidad de cierre con modelos estadísticos (la "demanda" es una medición de hechos recientes), envío de emails o WhatsApp automáticos, ni descarga de documentos desde el portal del propietario.

## Qué agrega la Fase 5 (marca, integraciones y contabilidad)

- **Mi empresa** (`/app/empresa`): datos, logo, dos colores de marca, redes, razón social y NIT. Los colores se aplican al portal, al panel y al portal del propietario; solo se aceptan colores sobre los que el texto claro se lee bien. Con la función `white_label` (plan Empresa o superior) se oculta "Funciona con Soft_Inmo".
- **Dominio propio** (función `custom_domain`): la empresa registra su dominio, crea el registro TXT `_softinmo.<dominio>` que le indica la pantalla y pulsa Verificar. Un dominio verificado abre su portal y su panel. El superadmin puede darlo por verificado en `/superadmin/dominios`. **En el hosting falta**: apuntar el dominio al servidor y emitir su certificado HTTPS.
- **App instalable (PWA)**: desde el navegador del celular, "Agregar a pantalla de inicio". Toma el nombre y color de la empresa. Sin conexión muestra un aviso; no guarda datos para trabajar sin internet. Necesita HTTPS (en `localhost` funciona sin él). No es una app nativa de tienda.
- **Integraciones** (`/app/integraciones`, función `integrations`, plan Corporativo):
  - Claves de API: se muestran una sola vez; en la base queda solo su huella.
  - API pública: `GET /api/v1/properties`, `GET /api/v1/properties/:code`, `POST /api/v1/leads`, con `Authorization: Bearer <clave>`. Límite de 120 llamadas por minuto por clave.
  - Webhooks: `lead.created`, `visit.scheduled`, `offer.received`, `case.won`, `case.lost`. Cada aviso lleva `x-softinmo-signature: sha256=<HMAC del cuerpo con el secreto>`. No se reintentan; el resultado de cada envío queda a la vista.
- **Facturas** (`/app/finanzas/facturas`, función `invoicing`): borrador, emisión con número correlativo, anulación con motivo, IVA incluido (13 %), importe en letras y PDF. **No son facturas electrónicas**: la conexión con Impuestos Nacionales (SIAT) exige que cada empresa se certifique y firme digitalmente. El punto de conexión es `sendToFiscalProvider` en `apps/api/src/invoicing/invoices.controller.ts`; hasta entonces el PDF dice que es un documento interno.
- **Contabilidad** (`/app/finanzas/contabilidad`, función `accounting`): plan de cuentas, doble partida, libro diario, libro mayor, sumas y saldos, estado de resultados y balance general, por moneda. Cada ingreso o gasto de Finanzas genera su asiento; un movimiento anulado genera el asiento inverso. Es **base de caja** (registra el dinero cuando entra o sale); las facturas no generan asientos.
- **Bancos** (`/app/finanzas/bancos`, función `bank_reconciliation`): importa el extracto en CSV, sugiere el movimiento de Finanzas que corresponde a cada línea y permite registrar el que falte. No hay conexión directa con bancos.
- **Seguridad**: 8 intentos fallidos de inicio de sesión bloquean ese email durante 15 minutos.

Los límites de llamadas y de intentos de login se guardan en memoria: valen con un solo servidor de API. Con varios, hay que moverlos a Redis.

## Qué agrega la etapa 6 (búsqueda, mapas, sucursales y pendientes)

- **Búsqueda global**: buscador arriba de cada pantalla del panel; encuentra propiedades, clientes, propietarios, leads, equipo, operaciones, negociaciones y documentos, con los mismos permisos de cada pantalla.
- **Comparador**: de 2 a 4 propiedades lado a lado (precio, precio por m², superficies, ambientes, antigüedad, zona y características), en el panel (`/app/propiedades/comparar`) y en el portal (`/comparar`, desde las propiedades guardadas). Los precios solo se comparan entre la misma moneda y operación.
- **Mapas** (Leaflet + OpenStreetMap, sin clave): ubicación con un clic al editar la propiedad, mapa del inventario (`/app/mapa`) y mapa en la ficha. En el portal la ubicación es **aproximada** (desplazada hasta 250 m y mostrada como zona): las coordenadas exactas nunca salen de la API pública. Para Mapbox o Google, cambia `NEXT_PUBLIC_MAP_TILES` y `NEXT_PUBLIC_MAP_ATTRIBUTION` en `apps/web/.env`.
- **Sucursales** (`multi_branch`, plan Empresa o superior): el agente pertenece a una sucursal y sus propiedades, clientes y operaciones también. Arriba del panel se elige "Toda la empresa" o una sucursal; la API lo recibe en la cabecera `x-branch`.
- **Permisos por usuario**: además del rol, el administrador ajusta "ver toda la empresa", "registrar propiedades", "gestionar campañas" y "exportar reportes" (agentes) y "registrar en finanzas" (contador). Se aplican al instante: la API lee el usuario en cada petición, y un usuario desactivado pierde la sesión de inmediato.
- **Tipo de cambio**: se registra por fecha (Bs por 1 USD) y el Resumen de Finanzas muestra el total equivalente en bolivianos. Los montos siguen guardados en su moneda.
- **Libros de compras y ventas IVA** (`/app/finanzas/libros-iva`): ventas desde las facturas emitidas (las de dólares se convierten con el tipo de cambio de su fecha), compras registradas a mano, débito y crédito fiscal, saldo, y exportación a Excel, CSV y PDF. Formato de referencia, no el oficial del SIN.
- **Proceso legal**: checklist de trámites por tipo de operación (venta, alquiler, anticrético) y **firma de documentos por enlace** (`/firmar/<código>`, función `legal_signatures`): el firmante abre el documento, escribe su nombre y acepta; queda la fecha, la IP y la huella SHA-256 del archivo. No es firma digital con certificado (ADSIB) ni reemplaza la notaría.
- **Portal del propietario**: ahora descarga sus contratos, autorizaciones y recibos.
- **Marca Soft_Inmo**: logo (techo con el guion lima) y tipografía Manrope, incluida en el proyecto (no depende de Google Fonts).

## Qué agrega la etapa 7 (tema oscuro, niveles de comisión y cierre de gestión)

- **Tema oscuro**: botones Automático / Claro / Oscuro en el menú del panel y en el pie del portal. "Automático" sigue la configuración del equipo; la elección se recuerda en el navegador. El logo de Soft_Inmo y los colores de cada empresa no cambian.
- **Colores de estado**: éxito, aviso, error e información salen de variables (`--color-success`, `--color-warning`, `--color-danger`, `--color-info` y sus versiones `-soft`) en `apps/web/src/app/globals.css`, con su versión para oscuro. Siempre van con texto, nunca solos.
- **Comisión por nivel**: cada regla puede tener hasta 6 niveles ("desde tanto vendido, el agente recibe tanto %"). Se suma lo cerrado por el agente en el mes o en el año, en la misma moneda, incluida la operación actual. La comisión muestra el nivel aplicado (por ejemplo "· nivel 2").
- **Cierre de gestión** (Contabilidad > Cierre de gestión): lleva la utilidad o pérdida del año a la cuenta **3201 Resultados acumulados**, deja ingresos y gastos en cero y bloquea las fechas de ese año para toda la empresa (movimientos, cobros, pagos, liquidaciones, asientos manuales y conciliación). Se cierra en orden; solo el administrador reabre la última gestión cerrada.
- **Jefe de sucursal**: permiso nuevo para agentes con sucursal. Ve todo lo de su sucursal (sin elegir otra) y asigna propiedades, clientes, leads, visitas y tareas solo a agentes de su sucursal.
- **Corrección**: varias pantallas de Contabilidad abiertas a la vez ya no generan asientos con el mismo número (los asientos de una empresa se registran de a uno).
- **Nota para compilar**: si cambias `globals.css` y el estilo no se actualiza, borra la carpeta `apps/web/.next` y vuelve a ejecutar `pnpm build`.

## Qué agrega la etapa 8 (portal público)

- **Portada nueva**: título dinámico ("Encuentra tu próxima casa / tu próximo departamento… en <ciudad>") según lo que la empresa tiene publicado, con el total de propiedades, botones por operación, tipo de inmueble y zonas populares.
- **Búsqueda en vivo** (`GET /api/public/search`): filtra mientras se escribe; entiende frases ("casa en venta en Equipetrol 3 dormitorios hasta 150000"), acentos y una letra mal escrita. Sugiere zonas y, si no hay coincidencias, muestra **alternativas parecidas** indicando en qué cambian ("Es departamento", "Precio un poco mayor", "En otra zona"). La lógica está en `apps/api/src/public/search.ts`, con pruebas.
- **Foto de perfil**: cada persona la sube en **Mi perfil** (`/app/perfil`, desde su nombre en el menú) y el administrador puede cambiarla en Equipo. La ficha pública muestra al agente con su foto, su calificación y sus últimas reseñas.
- **Reseñas por enlace**: en Postventa, en una operación ganada (venta, alquiler o anticrético), "Pedir reseña" genera el enlace `/resena/<código>` y lo envía por WhatsApp. El cliente califica con estrellas y comenta una sola vez; si lo autoriza, la reseña se publica sola en la portada y en la ficha del agente. El agente no puede editarla; el administrador puede ocultarla o volver a mostrarla.
- **Pie de página** con los colores de la marca: contacto con íconos, botón de WhatsApp y redes sociales (WhatsApp, Facebook, Instagram, TikTok y sitio web, según lo cargado en Mi empresa).

## Nueva captación

- En **Gestión comercial**, el botón **+ Nueva captación** abre un expediente en el paso 1. Con una **propiedad nueva** registra el inmueble y su propietario (uno existente o uno nuevo); con una **propiedad ya registrada** abre otra gestión, solo si no tiene una abierta.
- Se cargan también las condiciones de la captación: agente a cargo (administrador o jefe de sucursal), comisión acordada, vencimiento de la autorización y exclusividad. Al terminar se abre el expediente.
- API: `POST /api/properties` acepta `captation: { isExclusive, commissionPct, captationEnds }` y devuelve `caseId`; `GET /api/properties` indica en `cases` si ya hay una gestión abierta.

## Herramientas de captación (paso 1 del expediente)

- En **Ventas › Mensajes de presentación** (debajo de Gestión comercial) hay un **Mensaje de presentación** para escribirle por primera vez a un propietario sin conocer su nombre: se elige venta, alquiler o anticrético y hay 1.000 mensajes distintos por operación (`apps/web/src/lib/intro-messages.ts`); "Volver a generar" los recorre sin repetir, y se pueden copiar o enviar por WhatsApp.
- En el paso **Captación** del expediente aparecen tres herramientas, con un selector de operación **Venta / Alquiler / Anticrético** que adapta los cálculos y textos:
  - **Calculadora de comisión**: venta y anticrético en %, alquiler en meses de alquiler; muestra la comisión en USD y Bs (con el último tipo de cambio de Finanzas) y lo que recibe el propietario. Se puede guardar como comisión acordada del expediente.
  - **Propuesta al propietario**: texto editable que explica el precio (comparando el precio por m² con propiedades parecidas de la zona) y lo que incluye la comisión; se copia o se envía por WhatsApp.
  - **Acuerdo de trabajo**: PDF con el logo y el color de la empresa, cláusulas de objeto, precio, comisión, exclusividad y vigencia, y espacio para firmas. Se guarda en Documentos del expediente y puede aplicar comisión, exclusividad y vigencia al expediente. No es un contrato legal vinculante.
  - **Publicar en el portal**: revisión (fotos, descripción, ubicación, precio), carga de fotos y descripción, y botón para publicar o quitar del portal, con el enlace público.
- El proceso legal (checklist de trámites y firmas por enlace) se muestra solo en el paso 7, Legal, y en la postventa; ya no aparece en Captación.
- Lógica en `apps/api/src/captation/tools.ts` (con pruebas) y `apps/web/src/lib/captation.ts`; API `GET /api/captation/rate` y `POST /api/cases/:id/agreement`.

## Menú por módulos

- El menú lateral agrupa las pantallas en módulos desplegables: Mi día, Ventas, Inventario y clientes, Marketing, Finanzas, Contabilidad y fiscal y Configuración (y Plataforma en el superadmin). Cada persona ve solo los módulos de su rol y de su plan.
- El módulo de la pantalla actual se abre solo; lo que cada persona abre o cierra se recuerda en su navegador. Si un módulo cerrado tiene avisos sin leer, muestra un punto lima.
- Finanzas muestra sus pestañas por grupos (Día a día, Comisiones, Análisis, Contabilidad y fiscal) y Contabilidad agrupa sus vistas (Estados financieros, Libros, Configuración).
- Se definen en `PANEL_NAV` y `PANEL_SECTIONS` de `apps/web/src/components/Shell.tsx`.

## Reglas del proyecto

- Todo modelo de empresa lleva `tenantId` y se registra en `TENANT_MODELS`
  (`apps/api/src/prisma/tenant-scope.ts`).
- Los módulos usan `prisma.db` (filtra por empresa). `prisma.platform` es solo para login,
  resolución de empresa y superadmin.
- Toda ruta exige sesión salvo que lleve `@Public()`. Los roles se restringen con `@Roles(...)`.
- En producción la API solo debe ser accesible a través del frontend o un proxy propio,
  porque confía en la cabecera `x-forwarded-host` para saber qué empresa es.
