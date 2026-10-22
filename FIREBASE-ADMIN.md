# Administrador web — Hoja Financiera ITSQMET

La versión actual **no requiere Firebase Authentication ni software instalado**. Utiliza un panel web abierto para estadísticas generales y un enlace privado para descargar PDF firmados y realizar operaciones sensibles.

Lee [README.md](README.md) para revisar el flujo docente, el panel administrativo, la configuración obligatoria del servicio Render y las medidas de seguridad.

**Importante:** las instrucciones anteriores de habilitar Authentication anónimo y autorizar UID en Realtime Database ya no aplican a la arquitectura actual.

**Pendiente fuera de GitHub:** configurar en Render la variable secreta `FIREBASE_SERVICE_ACCOUNT_JSON` con una credencial autorizada de Firebase y activar/configurar Firebase Storage en el proyecto. No conviertas las reglas de Realtime Database o Storage en públicas para solucionar errores de permisos.

- [Docentes](https://jeffer91.github.io/Hoja-Financiera/)
- [Panel de administración](https://jeffer91.github.io/Hoja-Financiera/administrador/)
- [Render, variables secretas](https://dashboard.render.com/web/srv-dbd7i7uq1p3s73cpv3l0/env)
