# Acceso al administrador sin formulario de login

Enlaces:
- Docentes: `https://jeffer91.github.io/Hoja-Financiera/`
- Administrador: `https://jeffer91.github.io/Hoja-Financiera/administrador/`

El formulario docente no requiere iniciar sesión. El panel del administrador tampoco solicita correo ni contraseña. Firebase Authentication identifica **automáticamente** cada navegador; únicamente los navegadores previamente autorizados pueden leer y modificar hojas financieras. **La autorización no debe quitarse**: GitHub Pages es público y las hojas contienen nombres, cédulas y valores de pago.

## 1. Activar acceso automático en Firebase

En el proyecto `repaso-fire-d8ceb`:

1. Abre **Firebase Console > Authentication > Sign-in method**.
2. Habilita **Anónimo (Anonymous)**. No es necesario crear cuentas con correo/contraseña para el nuevo acceso.
3. Abre la URL del administrador en el navegador que utilizarás normalmente. Se creará una identidad anónima persistente y aparecerá su **UID de navegador** mientras no esté autorizada.
4. En **Realtime Database**, crea el nodo con ese UID exacto:
   ```text
   administradores
     UID_DEL_NAVEGADOR
       activo: true
   ```
5. Actualiza la página: el panel abrirá directamente, sin pedir login.

El UID no es una contraseña y no debe tratarse como un secreto. La seguridad depende de la identidad autenticada por Firebase y de las reglas de la base de datos. No basta con escribir un UID diferente desde el navegador para obtener acceso.

**Importante:** cada navegador o dispositivo nuevo necesita autorización propia. Borrar los datos del navegador puede generar otro UID. Para revocar un navegador, cambia `activo` a `false` o elimina su nodo. El navegador autorizado no debe compartirse con personas no autorizadas.

### Si aparece «No se pudo iniciar el acceso automático»

El panel ahora muestra el **código real del error** y permite reintentar sin correo ni contraseña.

- `auth/operation-not-allowed`, `auth/admin-restricted-operation` o `auth/configuration-not-found`: habilita **Authentication → Sign-in method → Anónimo** en el proyecto `repaso-fire-d8ceb`.
- `auth/network-request-failed`: revisa conexión, bloqueadores y restricciones de red.
- `auth/app-not-authorized` o `auth/unauthorized-domain`: comprueba las restricciones de API Key y dominios en Firebase.
- Si muestra un **UID**, Firebase ya logró autenticar el navegador; solo falta añadir `administradores/UID/activo = true` con valor booleano en Realtime Database y pulsar **Reintentar**.
- Si las reglas impiden la comprobación de permisos, restaura únicamente el acceso del UID autenticado, nunca abras todos los registros al público.

El acceso anónimo y la autorización de UID son operaciones **distintas**. Publicar cambios en GitHub Pages no activa Authentication ni publica las reglas de Realtime Database.

## 2. Reglas de Firebase Realtime Database

Integra estas condiciones en las reglas existentes sin eliminar reglas de otros sistemas que usan el proyecto. Estas reglas distinguen la creación de hojas por docentes sin cuenta de la administración protegida.

```json
{
  "administradores": {
    "$uid": {
      ".read": "auth != null && auth.uid === $uid",
      ".write": false
    }
  },
  "periodosHojaFinanciera": {
    ".read": true,
    ".write": "auth != null && root.child('administradores').child(auth.uid).child('activo').val() === true"
  },
  "hojasFinancieras": {
    ".read": "auth != null && root.child('administradores').child(auth.uid).child('activo').val() === true",
    "$id": {
      ".write": "!data.exists() || (auth != null && root.child('administradores').child(auth.uid).child('activo').val() === true)",
      ".validate": "data.exists() || (newData.hasChildren(['cedula', 'docente', 'tituloSuperior', 'periodo', 'actividades', 'estado', 'totales', 'fechaEnvio']) && newData.child('version').val() === 2 && newData.child('estado').val() === 'Enviada' && newData.child('origen').val() === 'Hoja-Financiera' && newData.child('cedula').isString() && newData.child('cedula').val().matches(/^[0-9]{10}$/) && newData.child('docente').isString() && newData.child('docente').val().length > 0 && newData.child('docente').val().length <= 150 && newData.child('tituloSuperior').isString() && newData.child('tituloSuperior').val().length > 0 && newData.child('tituloSuperior').val().length <= 200 && newData.child('actividades').hasChildren() && newData.child('totales').child('valor').val() === 0 && newData.child('totales').child('horas').isNumber() && newData.child('totales').child('horas').val() > 0 && root.child('periodosHojaFinanciera').child('activoId').isString() && newData.child('periodo').child('id').val() === root.child('periodosHojaFinanciera').child('activoId').val() && newData.child('periodo').child('etiqueta').val() === root.child('periodosHojaFinanciera').child('periodos').child(root.child('periodosHojaFinanciera').child('activoId').val()).child('etiqueta').val())"
    }
  }
}
```

La lectura y la edición de hojas existentes requieren autorización; la creación de registros nuevos desde el formulario docente continúa sin inicio de sesión.

**Importante sobre la integridad financiera:** estas condiciones adicionales impiden que un cliente anónimo cree hojas directamente en estado `Aprobada`, declare valores monetarios propios o invente un período distinto del autorizado. Se conserva la creación sin login para docentes; esta facilidad **no verifica su identidad ni evita completamente envíos automatizados**. Para uso de producción es recomendable agregar controles de identidad, tamaño, volumen y frecuencia de los envíos, y probar las reglas en Firebase Emulator Suite.

**Las reglas mostradas son fragmentos para integrar dentro de `rules`** en tu configuración existente, no un reemplazo completo del proyecto compartido. No modifiques reglas globales que puedan afectar otras aplicaciones del proyecto. Las reglas anteriores son un mínimo de compatibilidad, no sustituyen validaciones de contenido y mecanismos antispam para nuevas hojas.

## 3. Configurar períodos lectivos (obligatorio)

Desde el panel del administrador existe la sección **Períodos lectivos**. Selecciona mes y año de inicio y fin y pulsa **Crear y activar**. También puedes activar un período anterior o desactivar el vigente. Solo se mantiene **un período activo a la vez**.

Firebase guarda esos datos en `periodosHojaFinanciera`:

- `periodos/{id}` contiene mes/año inicial y final, su etiqueta y la fecha de creación.
- `activoId` identifica el único período habilitado; se elimina cuando se desactiva.

El docente no visualiza ni edita el período; su formulario lo consulta en tiempo real y lo registra automáticamente en cada hoja, incluyendo el PDF. Las hojas enviadas conservan el período con el que se crearon. Si no hay período activo, el docente puede guardar un borrador pero no imprimir, descargar ni enviar.

**Paso obligatorio fuera de GitHub:** actualiza manualmente las reglas de Realtime Database del proyecto `repaso-fire-d8ceb` integrando las condiciones del ejemplo de la sección 2. Publicar GitHub Pages **no cambia las reglas de Firebase**. El nodo `periodosHojaFinanciera` es público para lectura (solo nombres y fechas del período), pero las modificaciones requieren ser un administrador autorizado.

La regla `.validate` de `hojasFinancieras/$id` restringe las **nuevas hojas** al período activo. Los administradores autorizados pueden revisar las hojas anteriores sin que les afecte el nuevo período. La creación sin identificación de docentes necesita además validaciones de contenido y controles contra envíos automatizados según política institucional.

## 4. Comprobación

- Navegador **no autorizado**: muestra el UID de autorización, **no** muestra los registros.
- Navegador **autorizado**: entra directamente al panel de hojas.
- Si el proyecto tiene deshabilitado **Anónimo**: aparece un mensaje que indica qué habilitar.
- Comprueba que sin período activo el formulario docente impida imprimir, descargar y enviar.
- Crea y activa un período; verifica que el bloqueo desaparezca y la hoja/PDF incorporen la etiqueta automáticamente.
- Activa un período distinto y comprueba que las hojas anteriores conservan el suyo.
- Verifica con datos de prueba el envío, la edición y los filtros, además de las reglas publicadas en Firebase Console.

Cada hoja se almacena en `hojasFinancieras/{id}` con cédula, docente, carrera, actividades, totales y estado de revisión.
