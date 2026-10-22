# Hoja Financiera ITSQMET

Aplicación web institucional para registrar clases de refuerzo y recibir **PDF financieros firmados**.

## Enlaces

- [Docentes](https://jeffer91.github.io/Hoja-Financiera/)
- [Administrador web](https://jeffer91.github.io/Hoja-Financiera/administrador/)

No requiere instalación, servidor local, PIN ni Firebase Authentication. El panel público muestra **solo estadísticas generales**; la revisión de documentos y las modificaciones usan un **enlace privado de administrador** que funciona como credencial y que no debe compartirse.

## Funcionamiento docente

1. Ingresa su cédula. Si no consta en Firebase, registra datos manualmente para verificación.
2. Registra clases, horas y enlaces de grabación. El valor por hora permanece vacío.
3. Descarga un PDF A4 con primera página de horas, segunda página de evidencias y tres espacios de firma (Docente, Coordinación de Titulación, Vicerrectorado). El documento puede ocupar páginas adicionales.
4. Firma el PDF por el método que prefiera y selecciona **Subir PDF firmado**.
5. **Solo cuando la carga finaliza correctamente** se registra el documento como `Recibida`. El PDF sin firma no se almacena como archivo.
6. Con la cédula puede **consultar exclusivamente el estado**. Para recuperar y corregir los datos o subir un nuevo firmado después de una devolución se necesita el **enlace privado de esa hoja**, entregado al docente al subir el archivo.
7. Al aprobar la hoja, el docente ya no puede reemplazar el PDF. Los documentos firmados anteriores permanecen en el historial.

## Administrador

- Panel general público sin datos personales.
- Gestión privada por enlace personal de acceso: pendientes, filtros, descarga de PDF firmados, historial, devolución con observaciones, aprobación, exportación Excel y gestión de períodos.
- Solo una configuración de período activa a la vez. Las correcciones de hojas devueltas conservan el período original.
- Los documentos privados no pueden descargarse con solo conocer el número de cédula.

## Infraestructura

- Frontend estático: GitHub Pages.
- API con acceso privado a Firebase: [Render — hoja-financiera-api](https://dashboard.render.com/web/srv-dbd7i7uq1p3s73cpv3l0).
- Datos y estado de las hojas: Firebase Realtime Database, proyecto `repaso-fire-d8ceb`.
- Archivos PDF firmados: Firebase Storage, bucket `repaso-fire-d8ceb.firebasestorage.app`.
- Backend: `backend/server.mjs`.

## Configuración obligatoria del servicio Render

**El backend no puede leer Firebase ni guardar documentos hasta que la credencial privada esté configurada.** Realiza una sola vez la configuración siguiente:

1. En [Firebase Console → Cuentas de servicio](https://console.firebase.google.com/project/repaso-fire-d8ceb/settings/serviceaccounts/adminsdk), genera una clave privada para una cuenta de servicio autorizada.
2. En [Render → Environment](https://dashboard.render.com/web/srv-dbd7i7uq1p3s73cpv3l0/env) crea `FIREBASE_SERVICE_ACCOUNT_JSON` con el **contenido JSON completo** de esa clave (como variable secreta del servidor).
3. Confirma que Firebase Storage esté habilitado en ese proyecto y que el bucket configurado exista.
4. Render desplegará de nuevo el servicio. Abre `https://hoja-financiera-api.onrender.com/api/health`: `ok:true` verifica la inicialización, **no** confirma por sí sola permisos completos ni una carga de prueba.

**No publiques ni compartas la clave JSON ni la copies al frontend o a GitHub.**

`ADMIN_ACCESS_TOKEN` ya está configurado en el servidor Render; debe tener 32 caracteres o más. Se usa desde un enlace privado `/administrador/#clave=TOKEN` y permite acceso administrativo. Si el enlace se filtra, cambia el token de Render y genera un enlace nuevo.

## Pruebas

La acción de GitHub Pages ejecuta `node --test tests/audit.test.cjs` antes de publicar. Comprueba la estructura del formulario, las rutas de la API, validación básica de datos, estados, página de administración y protección de documentos. Estas pruebas automatizadas **no equivalen a** una prueba real con Firebase Storage; esa verificación requiere la credencial privada configurada.

## Seguridad

La cédula no es una contraseña. La consulta por cédula únicamente devuelve estados y fechas. El servidor valida el enlace privado para cambios y descargas. La URL privada de administración debe guardarse como una contraseña, aunque no muestre formulario de inicio de sesión.

Las reglas actuales de Firebase Realtime Database no se sustituyen ni se publican como acceso abierto. El servicio Render usa credenciales privadas del lado servidor para realizar las operaciones permitidas.
