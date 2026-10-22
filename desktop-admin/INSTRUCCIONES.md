# Administrador local de Hoja Financiera — acceso directo

Este administrador **no muestra login, PIN, UID ni pantalla de Firebase Authentication**. Abre directamente el panel con todas las funciones: períodos, revisión, observaciones, aprobación, historial, filtros, Excel y PDF.

La información de las hojas financieras es privada. GitHub Pages no puede leer y modificar esos datos sin conceder acceso público a toda persona. Por eso el administrador completo se ejecuta **solo en tu computadora** y utiliza una cuenta de servicio de Firebase en un servidor local que escucha exclusivamente en `127.0.0.1:8765`.

**Nunca envíes ni compartas el archivo JSON de cuenta de servicio ni lo subas a GitHub.**

## Instalar en Windows (solo la primera vez)

1. Descarga el repositorio completo como ZIP desde [GitHub](https://github.com/jeffer91/Hoja-Financiera/archive/refs/heads/main.zip) y descomprímelo en una carpeta de tu computadora.
2. Instala [Node.js 22 o superior](https://nodejs.org/) si todavía no lo tienes.
3. Abre [Firebase Console: Cuentas de servicio](https://console.firebase.google.com/project/repaso-fire-d8ceb/settings/serviceaccounts/adminsdk), selecciona **Generar nueva clave privada** y descarga el JSON correspondiente al proyecto `repaso-fire-d8ceb`. Es una configuración técnica de la conexión, no un inicio de sesión para usar la aplicación.
4. En Windows, presiona **Win + R**, escribe `%APPDATA%\HojaFinanciera` y crea esa carpeta si no existe (dentro de `AppData\Roaming`). Guarda allí la clave con el nombre `service-account.json`.
5. Abre la carpeta `desktop-admin` del proyecto y haz doble clic en **iniciar-administrador.cmd**. Se instalarán automáticamente las dependencias si es la primera ejecución y se abrirá el panel.
6. Mantén abierta la ventana de terminal mientras utilizas el administrador. Para detenerlo, cierra esa ventana.

Acceso directo desde este equipo: <http://127.0.0.1:8765/desktop-admin/>.

La aplicación **no usa Firebase Authentication** para el administrador y no modifica las reglas de seguridad de Realtime Database. La cuenta de servicio se utiliza únicamente en tu equipo, nunca en JavaScript del navegador.

## Uso diario

Haz doble clic en `desktop-admin\iniciar-administrador.cmd`. Una vez iniciada, puedes usar el [enlace del administrador](https://jeffer91.github.io/Hoja-Financiera/administrador/) para entrar al panel local. Si ves un error de conexión, verifica que la ventana del administrador siga abierta.

## Seguridad y limitaciones

- El servidor se enlaza **solo a 127.0.0.1**, no a la red institucional ni a Internet.
- Las peticiones requieren un token aleatorio por sesión, verificado por el servidor. Se bloquean peticiones desde otros sitios web.
- Los datos de Firebase solo se sirven después de iniciar el servidor local con una cuenta de servicio válida.
- La clave tiene privilegios elevados: guárdala en un equipo de uso exclusivo, protegido por el inicio de sesión de Windows, con respaldo y controles adecuados; no la compartas con los docentes.
- No convierte el servidor en multiusuario ni verifica quién está sentado frente a la computadora. El historial marca los cambios como **operador local**, no como una persona identificada.
- Cuando se cambia de computadora necesitas instalar este administrador y configurar allí su credencial privada.
- Si la clave se filtra, revócala inmediatamente desde Google Cloud y genera otra.
- No hay ningún mecanismo que permita manejar una base privada de Firebase desde GitHub Pages sin autenticar a alguien o utilizar un entorno privilegiado. Publicar reglas de lectura/escritura abiertas expondría cédulas y datos de pago.

## Diagnóstico

Si el administrador no abre, comprueba `node --version` (debe ser 22 o superior), que existe el archivo `%APPDATA%\HojaFinanciera\service-account.json`, que corresponde a `repaso-fire-d8ceb` y que el servidor no esté abierto dos veces. El mensaje aparecerá en la terminal.

Si el panel abre pero no aparecen las hojas, comprueba la conexión a Internet y los permisos de la cuenta de servicio. El administrador mostrará un mensaje claro al fallar.

El formulario docente **continúa en GitHub Pages** y sus escrituras siguen sujetas a las reglas actuales de Firebase.
