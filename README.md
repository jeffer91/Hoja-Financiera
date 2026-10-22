# Hoja Financiera

Aplicación web para generar hojas financieras institucionales de **Clases de refuerzo por carrera**.

## Funciones

- Control exclusivo del período lectivo desde el administrador: crea, activa o desactiva períodos en Firebase; el docente utiliza el período activo automáticamente sin poder seleccionarlo.
- Consulta automática del nombre del docente mediante cédula en Firebase Realtime Database (`patrociniosGenerados/{cedula}`).
- Alta manual de docentes nuevos si no constan en Firebase o falla la consulta. El nombre, el título y la carrera pueden ingresarse manualmente y enviarse en la hoja, marcada con `origenDocente: manual` para revisión administrativa. No modifica el padrón `patrociniosGenerados`.
- Registro de título superior y carrera detectada.
- Registro de clases con fecha, valor hora, horas trabajadas, observaciones y evidencia opcional.
- Cálculo automático de horas y valor estimado.
- Vista previa institucional en tiempo real.
- Página adicional de evidencias cuando existen enlaces de grabación.
- Descarga en PDF e impresión A4.
- Borrador local en el navegador.

## GitHub Pages

El repositorio incluye un workflow para desplegar el sitio estático con GitHub Pages mediante GitHub Actions.

- Docentes: `https://jeffer91.github.io/Hoja-Financiera/`
- Administrador: `https://jeffer91.github.io/Hoja-Financiera/administrador/`

El formulario docente continúa en GitHub Pages. El administrador completo ahora se ejecuta localmente, sin login ni Firebase Authentication, con un puente privado que conecta a Firebase mediante una cuenta de servicio guardada fuera del repositorio. Para instalarlo, consulta `desktop-admin/INSTRUCCIONES.md`.

## Firebase

La aplicación utiliza el proyecto `Repaso-Fire` y consulta el nodo `patrociniosGenerados` por cédula. La seguridad de los datos depende de las reglas configuradas en Firebase Realtime Database.

## Configuración de períodos

Es necesario integrar y publicar en Firebase Realtime Database las reglas del nodo `periodosHojaFinanciera` (lectura pública de fechas, escritura de administradores) y la validación de las nuevas hojas indicadas en `FIREBASE-ADMIN.md`. Cuando no existe un período activo, el formulario permite guardar borradores, pero bloquea imprimir, descargar PDF y enviar.

## Administrador directo, sin login

1. Descarga el repositorio y consulta [las instrucciones de Windows](desktop-admin/INSTRUCCIONES.md).
2. Guarda la credencial privada de servicio de Firebase fuera del repositorio, en `%APPDATA%\HojaFinanciera\service-account.json`. **No la compartas ni la subas a GitHub.**
3. Ejecuta `desktop-admin/iniciar-administrador.cmd`. El panel se abre en `http://127.0.0.1:8765/desktop-admin/`, sin usuario, PIN ni Firebase Authentication.
4. El [enlace público del administrador](https://jeffer91.github.io/Hoja-Financiera/administrador/) ahora dirige al panel local y muestra instrucciones, sin exponer la base financiera.

GitHub Pages no puede ofrecer lectura y escritura privadas sobre la base financiera si se retira todo mecanismo de autorización. No se han publicado reglas abiertas para cédulas ni datos de pago. La credencial técnica del servidor local es necesaria para mantener la conexión segura; no requiere que el usuario inicie sesión en la aplicación.
