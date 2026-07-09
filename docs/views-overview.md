# Mapa de vistas de Üticket

Resumen de todas las pantallas de la aplicación: quién puede verlas, qué se muestra y qué se puede hacer en cada una. Última actualización: 2026-07-09.

> Nota: la interfaz está en español (voseo), pero las rutas están en inglés. Las URLs viejas en español (`/eventos`, `/pedidos`, etc.) siguen funcionando por redirecciones permanentes.

---

## Roles y control de acceso

Hay tres roles de usuario, más el visitante anónimo:

| Rol | Cómo se obtiene | Para qué sirve |
|-----|-----------------|----------------|
| **Anónimo** | Sin iniciar sesión | Navegar el catálogo público |
| **Comprador** (`BUYER`) | Registro normal | Comprar boletos y gestionar sus pedidos |
| **Organizador** (`ORGANIZER`) | Marcando "quiero organizar" al registrarse, o desde *Quiero organizar eventos* | Crear venues/eventos, cobrar y verificar boletos |
| **Administrador** (`ADMIN`) | Solo asignado por base de datos | Aprobar eventos, gestionar usuarios y la plataforma |

**Cómo se protege cada zona** (definido en `src/proxy.ts`):

- `/dashboard/**` → solo Organizador o Admin (si no, redirige al inicio).
- `/admin/**` → solo Admin.
- `/orders/**` y `/account/**` → cualquier usuario con sesión (si no, redirige a login y vuelve tras iniciar sesión).
- `/login` y `/register` → si ya iniciaste sesión, te redirige al inicio.
- **Comprar requiere correo verificado**: aunque cualquiera puede armar el carrito, crear el pedido exige tener el correo verificado.
- **Propiedad de datos**: los organizadores solo ven y editan *sus propios* venues, eventos y pedidos. El admin puede pasar por encima de esa restricción.

### Matriz de acceso rápida

| Vista | Anónimo | Comprador | Organizador | Admin |
|-------|:------:|:---------:|:-----------:|:-----:|
| Inicio, Catálogo, Detalle de evento, Carrito | ✅ | ✅ | ✅ | ✅ |
| Login / Registro / Olvidé contraseña | ✅ | — | — | — |
| Verificar correo | ✅ | ✅ | ✅ | ✅ |
| Mi cuenta | — | ✅ | ✅ | ✅ |
| Mis pedidos / Detalle de pedido | — | ✅ | ✅ | ✅ |
| Quiero organizar eventos | — | ✅ | (redirige) | (redirige) |
| Panel `/dashboard/**` | — | — | ✅ | ✅ |
| Administración `/admin/**` | — | — | — | ✅ |

---

## Vistas públicas

### Inicio — `/`
**Quién:** todos.
**Qué muestra:** hero con el eslogan "Tu entrada en un clic", tres tarjetas de propuesta de valor (eventos únicos, pago con QR, boleto digital) y una grilla de hasta 3 próximos eventos aprobados.
**Qué se puede hacer:**
- Botón **Explorar eventos** → catálogo.
- Botón secundario que cambia según el rol: visitante → *Registrarse*; comprador → *Quiero organizar un evento*; organizador/admin → *Crear un evento*.
- Clic en cualquier evento destacado → su detalle.

### Catálogo de eventos — `/events`
**Quién:** todos.
**Qué muestra:** todos los eventos **aprobados y futuros**, en grilla de tarjetas (portada, categoría, fecha, venue, ciudad y precio "desde").
**Qué se puede hacer:**
- Filtrar por **categoría, ciudad, fecha y precio máximo**.
- Ver el conteo de resultados y un estado vacío si no hay coincidencias.
- Clic en una tarjeta → detalle del evento.

### Detalle de evento — `/events/[id]`
**Quién:** todos (solo eventos aprobados; si no existe/está aprobado → página "no encontrado").
**Qué muestra:** portada, categoría, organizador, título, descripción, fecha/hora, venue y dirección, más el **mapa de asientos** o las zonas de cupo libre con disponibilidad y precios.
**Qué se puede hacer:**
- Seleccionar asientos numerados o cantidades por zona; el panel **Tu selección** calcula el total.
- Continuar al carrito.
- Si las ventas están cerradas (por el límite de horas antes del evento que fija el admin), se muestra **"Venta cerrada"** y se oculta la selección.

### Carrito / Resumen del pedido — `/cart`
**Quién:** todos (el carrito vive en el navegador).
**Qué muestra:** los ítems seleccionados de un evento, con subtotales y total.
**Qué se puede hacer:**
- Ajustar cantidades por zona (hasta el máximo permitido) o vaciar el carrito.
- Botón **Continuar al pago**: **requiere sesión y correo verificado** (si no hay sesión, redirige a login y vuelve). Al confirmar se crea el pedido con reserva de asientos por 15 minutos y se va a la pantalla de pago.

### Páginas de sistema
- **No encontrado** (`not-found`): mensaje amable con accesos a inicio y catálogo. La ven todos cuando una URL no existe o un evento no está disponible.
- **Error** (`error`): pantalla "Algo salió mal" con botón *Reintentar*, ante un error inesperado.

---

## Autenticación y cuenta

### Iniciar sesión — `/login`
**Quién:** visitantes sin sesión (si ya tenés sesión, redirige al inicio).
**Qué se puede hacer:** ingresar con correo y contraseña; con Google si está configurado; enlaces a **Registrarse** y **¿Olvidaste tu contraseña?**.

### Crear cuenta — `/register`
**Quién:** visitantes sin sesión.
**Qué se puede hacer:** registrarse con nombre, correo y contraseña, y marcar **"Quiero organizar eventos"** para nacer como organizador. Registro con Google opcional. Al registrarse se envía el correo de verificación.

### ¿Olvidaste tu contraseña? — `/forgot-password`
**Quién:** todos.
**Qué se puede hacer:** ingresar el correo para recibir un enlace de restablecimiento (válido 1 hora). Siempre responde con el mismo mensaje, sin revelar si el correo existe.

### Restablecer contraseña — `/reset-password?token=…`
**Quién:** quien tenga el enlace del correo.
**Qué se puede hacer:** definir una contraseña nueva (con confirmación). Si el enlace venció o ya se usó, ofrece pedir uno nuevo. Al restablecer, la cuenta también queda verificada.

### Verificar correo — `/verify-email?token=…`
**Quién:** quien tenga el enlace del correo.
**Qué muestra:** el resultado de la verificación (verificado ✅ / ya estaba verificado / enlace inválido o vencido), con acceso al catálogo.

### Mi cuenta — `/account`
**Quién:** cualquier usuario con sesión.
**Qué muestra:** nombre, correo (con distintivo *Verificado* / *Sin verificar*) y tipo de cuenta.
**Qué se puede hacer:** **cambiar la contraseña** (pide la actual + la nueva). Las cuentas que entran con Google ven un aviso en lugar del formulario, porque no tienen contraseña propia.

### Quiero organizar eventos — `/become-organizer`
**Quién:** compradores con sesión (los organizadores/admin son redirigidos directo a crear evento; sin sesión va a login).
**Qué muestra:** los beneficios de ser organizador.
**Qué se puede hacer:** activar la cuenta de organizador con un clic; al confirmar, la sesión se actualiza al nuevo rol y se abre el formulario para crear el primer evento.

---

## Vistas de comprador

### Mis pedidos — `/orders`
**Quién:** cualquier usuario con sesión (lista los pedidos donde sos el comprador).
**Qué muestra:** cada pedido con evento, fecha, monto, estado (*Esperando pago*, *En revisión*, *Confirmado*, *Cancelado*) y cantidad de boletos.
**Qué se puede hacer:** entrar al detalle de cada pedido. Estado vacío con acceso al catálogo si no hay pedidos.

### Detalle de pedido — `/orders/[id]`
**Quién:** el comprador dueño del pedido, el organizador del evento o un admin (si no, "no encontrado").
**Qué muestra y permite, según el estado:**
- **Esperando pago:** QR de pago del organizador, monto exacto, cuenta regresiva de 15 minutos, instrucciones y **formulario para subir el comprobante**. También se puede cancelar el pedido.
- **En revisión:** el comprobante enviado (ampliable), fecha de envío, y la opción de **reemplazar el comprobante** mientras el organizador no lo revise.
- **Confirmado:** mensaje de éxito y los **boletos con QR** (una tarjeta por boleto, con su código).
- **Cancelado:** motivo del rechazo (si lo hubo) y acceso para volver al evento e intentar de nuevo.

---

## Panel de organizador — `/dashboard/**`
*Requiere rol Organizador o Admin. Barra lateral con: Resumen · Pedidos · Mis eventos · Mis venues · Verificar boletos.*

### Resumen — `/dashboard`
**Qué muestra:** saludo personalizado, tarjetas de métricas (ingresos confirmados, boletos vendidos, eventos activos, pagos por confirmar, en revisión, cantidad de venues) y **ocupación por zona** de cada evento aprobado (barras de progreso).
**Qué se puede hacer:** accesos rápidos a *Nuevo venue* y *Nuevo evento*.

### Mis eventos — `/dashboard/events`
**Qué muestra:** todos tus eventos con su estado (*Borrador, En revisión, Aprobado, Cancelado*), fecha, venue y precio.
**Qué se puede hacer:** crear un evento; ver la ficha pública (si está aprobado); editar (solo borradores o en revisión); y las acciones de estado (enviar a revisión, cancelar, etc.).

### Nuevo evento — `/dashboard/events/new`
**Qué muestra:** si no tenés venues, te pide crear uno primero; si tenés, el formulario de evento.
**Qué se puede hacer:** cargar título, descripción, categoría, fecha/hora, venue, precio base, imagen de portada y **QR de pago**. Se crea como borrador.

### Editar evento — `/dashboard/events/[id]/edit`
**Quién:** el organizador dueño (o admin). Solo eventos en borrador o en revisión.
**Qué se puede hacer:** modificar los mismos campos del formulario de creación.

### Mis venues — `/dashboard/venues`
**Qué muestra:** tus venues con tipo de mapa (por zonas / numerado / mixto), dirección, ciudad, capacidad, cantidad de zonas y de eventos.
**Qué se puede hacer:** crear, editar o eliminar venues.

### Nuevo venue / Editar venue — `/dashboard/venues/new` · `/dashboard/venues/[id]/edit`
**Qué se puede hacer:** definir nombre, dirección, ciudad y las **zonas** (numeradas con filas × asientos, o de cupo libre) con sus precios. La estructura del venue se bloquea una vez que tiene ventas.

### Pedidos — `/dashboard/orders`
**Qué muestra:** los pedidos de *tus* eventos, en tres secciones: **Comprobantes por revisar**, **Pendientes de pago** e **Historial**.
**Qué se puede hacer:**
- En *por revisar*: ver la miniatura del comprobante (se **amplía en la misma página** al tocarla) y **Verificar pago** (emite los boletos + correo al comprador) o **Rechazar** (con motivo opcional que se envía por correo, libera los asientos).
- Los pedidos sin comprobante también pueden confirmarse (ej. pago en efectivo).

### Verificar boletos — `/dashboard/verify`
**Qué muestra:** un escáner de QR con la cámara del dispositivo.
**Qué se puede hacer:** apuntar al QR del boleto en la puerta; el resultado aparece **en pantalla automáticamente** — *Entrada válida* / *Boleto ya utilizado* / *cancelado* / *inexistente* / *de otro organizador*. El escaneo es continuo (no hay que tocar "siguiente") y cada boleto se acepta **una sola vez**. También hay entrada manual del código. Solo el organizador del evento (o un admin) puede verificar sus boletos.

---

## Panel de administración — `/admin/**`
*Solo rol Admin. Barra lateral con: Resumen · Eventos · Usuarios.*

### Resumen — `/admin`
**Qué muestra:** métricas globales de la plataforma (ventas confirmadas, boletos emitidos, usuarios, organizadores, eventos totales/aprobados/por revisar, cuentas suspendidas) y un aviso si hay eventos esperando revisión.
**Qué se puede hacer:** editar la **configuración de la plataforma** → horas de cierre de ventas antes de cada evento (0 a 168). Acceso rápido a revisar eventos.

### Gestión de eventos — `/admin/events`
**Qué muestra:** los eventos **pendientes de aprobación** (con datos del organizador y si cargó el QR de pago) y, aparte, todos los demás con su estado y cantidad de pedidos.
**Qué se puede hacer:** **aprobar** (lo publica en el catálogo) o **rechazar** (lo devuelve a borrador) cada evento pendiente.

### Gestión de usuarios — `/admin/users`
**Qué muestra:** todas las cuentas con rol, distintivo de *Suspendido*, correo, fecha de registro y su actividad (eventos u órdenes).
**Qué se puede hacer:** filtrar por rol (todos / compradores / organizadores / admins) y **suspender o reactivar** cuentas (no se puede suspender a otros admins ni a uno mismo). Una cuenta suspendida no puede iniciar sesión.

---

## Elementos transversales (en todas las pantallas)

- **Barra superior (Navbar):** logo Üticket, enlace a *Eventos*; con sesión: *Mis pedidos*, *Mi panel* (organizador/admin), *Admin* (admin), tu nombre → *Mi cuenta*, y *Cerrar sesión*. Sin sesión: *Iniciar sesión* y *Registrarse*. Incluye el carrito, el cambio de tema claro/oscuro y un menú hamburguesa en móvil.
- **Aviso de verificación:** si tu correo no está verificado, aparece una franja bajo la barra con la opción de reenviar el correo.
- **Pie de página (Footer):** derechos de Üticket y una nota de marca.
- **Tema claro/oscuro:** disponible en toda la app y se recuerda entre visitas.
