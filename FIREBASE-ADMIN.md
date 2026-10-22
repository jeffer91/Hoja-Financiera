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
  "hojasFinancieras": {
    ".read": "auth != null && root.child('administradores').child(auth.uid).child('activo').val() === true",
    "$id": {
      ".write": "!data.exists() || (auth != null && root.child('administradores').child(auth.uid).child('activo').val() === true)"
    }
  }
}
```

La lectura y la edición de hojas existentes requieren autorización; la creación de registros nuevos desde el formulario docente continúa sin inicio de sesión. Las reglas anteriores son un mínimo de compatibilidad, no sustituyen validaciones de contenido y mecanismos antispam para nuevas hojas.

## 3. Comprobación

- Navegador **no autorizado**: muestra el UID de autorización, **no** muestra los registros.
- Navegador **autorizado**: entra directamente al panel de hojas.
- Si el proyecto tiene deshabilitado **Anónimo**: aparece un mensaje que indica qué habilitar.
- Para confirmar que el envío, la edición y el filtrado funcionan, prueba con registros controlados y verifica las reglas publicadas en Firebase Console.

Cada hoja se almacena en `hojasFinancieras/{id}` con cédula, docente, carrera, actividades, totales y estado de revisión.
