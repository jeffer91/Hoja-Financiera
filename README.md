# Hoja Financiera

Aplicación web para generar hojas financieras institucionales de **Clases de refuerzo por carrera**.

## Funciones

- Selección de período lectivo por mes y año.
- Consulta automática del nombre del docente mediante cédula en Firebase Realtime Database (`patrociniosGenerados/{cedula}`).
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

El formulario docente puede enviar hojas terminadas a `hojasFinancieras` en Firebase. El panel administrativo permite revisar, filtrar, editar, observar, aprobar, imprimir y exportar a Excel. La configuración segura del acceso está documentada en `FIREBASE-ADMIN.md`.

## Firebase

La aplicación utiliza el proyecto `Repaso-Fire` y consulta el nodo `patrociniosGenerados` por cédula. La seguridad de los datos depende de las reglas configuradas en Firebase Realtime Database.
