# Hoja Financiera ITSQMET

[Formulario docente](https://jeffer91.github.io/Hoja-Financiera/)

## Flujo actual

1. Seleccionar período y consultar la cédula o ingresar los datos manualmente.
2. Registrar de 1 a 80 clases, con fecha dentro del período, horas entre 0,25 y 24 en intervalos de 0,25 y observaciones. Los enlaces HTTP/HTTPS son opcionales.
3. Revisar los totales y descargar el PDF A4 o imprimirlo. El proceso termina aquí: no se solicita subir un documento firmado.

La tarifa queda vacía para Talento Humano y se mantienen tres espacios de firma. La página de evidencias aparece solamente cuando hay enlaces. Los enlaces conservan su URL; los permisos de acceso a grabaciones deben configurarse en el servicio donde están alojadas.

Los borradores se guardan automáticamente en este navegador. No se sincronizan entre dispositivos. La descarga no envía datos ni archivos al servidor ni crea estadísticas de recepción.

La consulta por cédula usa Firebase con espera limitada; si falla, se permite completar los datos manualmente. El catálogo de períodos se consulta a la API, con Febrero–Agosto 2026 como alternativa local. No hay dependencia de Firebase Storage para generar documentos.

## Historial administrativo

[Administrador](https://jeffer91.github.io/Hoja-Financiera/administrador/)

Se conserva para consultar documentos recibidos anteriormente y gestionar períodos. Las estadísticas corresponden a esas entregas históricas, no a nuevas descargas. El formulario actual no permite enviar ni reenviar documentos. Los endpoints y archivos existentes se conservan para no eliminar información histórica. La configuración privada se documenta en FIREBASE-ADMIN.md.

## Validación

`node --test tests/audit.test.cjs`

Las pruebas verifican integridad de controles, validaciones, ausencia de carga en el formulario y protección del historial. Para verificar PDF hay que probar también el navegador: varias páginas, enlaces extensos, campos largos y ausencia de evidencias.
