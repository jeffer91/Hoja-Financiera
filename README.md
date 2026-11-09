# Hoja Financiera ITSQMET

[Formulario docente](https://jeffer91.github.io/Hoja-Financiera/)

## Flujo actual

1. Seleccionar período e ingresar manualmente la cédula, los apellidos y los nombres en campos separados, el título superior y, opcionalmente, seleccionar la carrera (con opción de escribir otra).
2. Registrar de 1 a 80 clases, con fecha dentro del período, horas entre 0,01 y 24,00 en intervalos de 0,01 (hasta dos decimales) y observaciones. Cada clase exige un enlace HTTPS de grabación o evidencia, compartido con permisos de visualización para revisión. Las horas declaradas deben coincidir con la evidencia.
3. Revisar los totales y descargar el PDF A4 o imprimirlo. El proceso termina aquí: no se solicita subir un documento firmado.

La tarifa queda vacía para Talento Humano y se mantienen tres espacios de firma. La página de evidencias se incluye en el PDF generado tras validar todas las clases. Los enlaces conservan su URL; los permisos de acceso deben configurarse en el servicio donde están alojadas. El formulario verifica la presencia y el formato HTTPS, pero no puede comprobar automáticamente los permisos reales ni la duración de las grabaciones. Sin evidencia accesible y congruente, las horas no se validarán para el pago hasta corregir la observación.

Los borradores se guardan automáticamente en este navegador. No se sincronizan entre dispositivos. La descarga no envía datos ni archivos al servidor ni crea estadísticas de recepción.

El formulario no consulta docentes por cédula ni autocompleta sus datos. Todos los campos personales son editables; un borrador guardado puede recuperarse en el mismo navegador. El catálogo de períodos se consulta a la API, con Febrero–Agosto 2026 como alternativa local. No hay dependencia de Firebase Storage para generar documentos.

## Historial administrativo

[Administrador](https://jeffer91.github.io/Hoja-Financiera/administrador/)

Se conserva para consultar documentos recibidos anteriormente y gestionar períodos. Las estadísticas corresponden a esas entregas históricas, no a nuevas descargas. El formulario actual no permite enviar ni reenviar documentos. Los endpoints y archivos existentes se conservan para no eliminar información histórica. La configuración privada se documenta en FIREBASE-ADMIN.md.

## Validación

`node --test tests/audit.test.cjs`

Las pruebas verifican integridad de controles, validaciones, ausencia de carga en el formulario y protección del historial. Para verificar PDF hay que probar también el navegador: varias páginas, enlaces extensos y campos largos. La ausencia de enlace debe impedir avanzar y exportar.

Los apellidos y los nombres se solicitan por separado, y se presentan juntos (en ese orden) al revisar y generar el PDF. Los borradores antiguos conservan su nombre completo para que el docente lo separe sin perder información.
