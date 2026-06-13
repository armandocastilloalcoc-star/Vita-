# Recuperar contraseña — Vita

Se agregó el flujo completo de recuperación de contraseña por correo.

## Qué se agregó

**Frontend (`vita-cloud.js`)**
- Link **"¿Olvidaste tu contraseña?"** en la pantalla de inicio de sesión.
- Pantalla para pedir el correo y enviar el enlace.
- Detección automática del enlace `?reset=TOKEN`: al abrirlo, aparece el formulario de nueva contraseña. Al guardarla, inicia sesión solo.

**Backend (`functions/api.js`)**
- Tabla nueva `password_resets` (token, usuario, vencimiento, usado).
- `POST /api/auth/forgot` → genera un token de un solo uso (vence en 60 min) y envía el correo vía Resend. Siempre responde igual, no revela si el correo existe.
- `POST /api/auth/reset` → valida el token (no usado, no vencido) y cambia la contraseña; invalida los demás enlaces pendientes.

## Configuración necesaria (1 sola vez)

Para que **se envíe el correo de verdad** necesitas una cuenta gratis de Resend y agregar variables en Netlify:

1. Crea una cuenta en **https://resend.com** (plan gratis: 3,000 correos/mes).
2. En Resend, ve a **API Keys → Create API Key** y copia la clave (empieza con `re_...`).
3. En **Netlify** → tu sitio Vita → **Site configuration → Environment variables**, agrega:

   | Variable | Valor |
   |---|---|
   | `RESEND_API_KEY` | tu clave `re_...` |
   | `RESEND_FROM` | *(opcional)* `Vita <no-reply@tudominio.com>` — requiere dominio verificado en Resend |
   | `APP_URL` | *(opcional)* `https://eloquent-horse-1e2377.netlify.app` |

4. Vuelve a desplegar el sitio (Netlify lo hace solo al hacer push, o desde **Deploys → Trigger deploy**).

### Notas importantes
- **Sin dominio propio:** si no configuras `RESEND_FROM`, se usa el remitente de prueba de Resend (`onboarding@resend.dev`), que **solo puede enviar correos a la dirección de tu propia cuenta de Resend**. Para enviar a cualquier usuario necesitas verificar un dominio en Resend y poner tu remitente en `RESEND_FROM`.
- **Sin `RESEND_API_KEY`:** el flujo no falla, pero no envía correo. El enlace de recuperación queda registrado en los logs de la función de Netlify (útil para probar).
- El enlace de recuperación vence en **60 minutos** y es de **un solo uso**.
