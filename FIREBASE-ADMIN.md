# Configuración del administrador

La aplicación ya incluye dos áreas:

- Docentes: `https://jeffer91.github.io/Hoja-Financiera/`
- Administrador: `https://jeffer91.github.io/Hoja-Financiera/administrador/`

## 1. Firebase Authentication

En Firebase Console, abre **Authentication > Sign-in method** y habilita **Correo electrónico/Contraseña**.

Crea la cuenta que utilizará el administrador.

## 2. Autorizar el UID

Después de crear la cuenta, copia su UID y agrega en Realtime Database:

```text
administradores
  UID_DEL_USUARIO
    activo: true
```

El panel administrativo comprueba este nodo antes de mostrar las hojas.

## 3. Reglas recomendadas para estos nodos

Estas condiciones deben integrarse en las reglas existentes del proyecto, sin reemplazar reglas de otros sistemas que ya utilicen Repaso-Fire.

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

La regla de escritura permite que el formulario docente cree una hoja nueva, pero impide que un visitante anónimo lea, edite o elimine hojas existentes. Los administradores autorizados pueden leer y actualizar.

## Datos guardados

Cada envío se almacena en `hojasFinancieras/{id}` con docente, cédula, título, carrera, período, clases, horas, valor estimado, evidencias, estado, observación administrativa y fechas de envío/actualización.
