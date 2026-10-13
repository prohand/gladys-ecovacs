# Ecovacs

Controle sus **robots aspiradores Ecovacs Deebot** y sus **cortacéspedes
robot Ecovacs GOAT** desde Gladys: inicie y detenga la tarea, envíe el robot de
vuelta a su base, ajuste la potencia de aspiración, siga la batería, los
errores y el desgaste de las piezas.

La integración pasa por la **nube de Ecovacs**, con la cuenta de la aplicación
**Ecovacs Home**: Ecovacs no ofrece conexión local. Gladys necesita acceso a
Internet, y el robot debe aparecer en la aplicación.

## Antes de empezar

1. Instale la aplicación **Ecovacs Home** y añada en ella sus robots.
2. Anote el **correo electrónico** y la **contraseña** de la cuenta, así como
   el **país** elegido al crear la cuenta.
3. Cuenta creada con el inicio de sesión de Google, Apple o Facebook: no tiene
   contraseña. Defina una en la aplicación (Perfil, ajustes de la cuenta).

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Introduzca el **correo electrónico**, la **contraseña** y el **país de la
   cuenta**.
3. Elija el **intervalo de actualización** (1 minuto por defecto).
4. Guarde y luego pulse **Probar la conexión**: el mensaje enumera los robots
   encontrados.
5. Abra la pestaña **Descubrir** y añada sus robots.

### Verificación del dispositivo

Ecovacs puede pedir que confirme Gladys como nuevo dispositivo (el mensaje lo
indica, la nube responde con el código 1013 «Please update to the latest
version»):

1. Pulse **Enviar el código de verificación**: Ecovacs envía un código al
   correo electrónico de la cuenta (revise también la carpeta de spam).
2. Introdúzcalo en **Confirmar el dispositivo** y pulse: los robots aparecen en
   la lista.

Gladys conserva el mismo identificador de dispositivo para la cuenta, incluso
tras un reinicio.

La contraseña nunca se envía en claro: solo su huella MD5 llega a Ecovacs, como
hace la aplicación.

## Qué obtiene

| Función                                     | Aspirador | Cortacésped | Detalle                                                                         |
| ------------------------------------------- | --------- | ----------- | ------------------------------------------------------------------------------- |
| Estado                                      | ✔         | ✔           | Detenido, en marcha, en pausa, error, volviendo a la base, cargando, en la base |
| Limpieza / Siega                            | ✔         | ✔           | 1 inicia (o reanuda tras una pausa), 0 detiene                                  |
| Volver a la base / estación                 | ✔         | ✔           | 1 envía el robot de vuelta                                                      |
| Potencia de aspiración                      | ✔         |             | Silencioso, Estándar, Máx., Máx.+ (según el modelo)                             |
| Batería, Cargando                           | ✔         | ✔           | En %                                                                            |
| Último error                                | ✔         | ✔           | Texto en inglés con su código, vea la tabla más abajo                           |
| Cepillo principal, Cepillo lateral, Filtro  | ✔         |             | Vida útil restante en %, leída cada 30 minutos                                  |
| Cuchillas, Cepillo de la lente de la cámara |           | ✔           | Vida útil restante en %, leída cada 30 minutos                                  |

Una insignia **Nube** aparece en la tarjeta del robot cuando responde, e
**Inaccesible** cuando deja de responder (apagado, fuera del alcance de la red
wifi).

## Acciones

- **Probar la conexión**: inicia sesión y enumera los robots encontrados.
- **Enviar el código de verificación** / **Confirmar el dispositivo**:
  verificación del dispositivo, cuando Ecovacs la pide (vea más arriba).
- **Localizar un robot**: el robot reproduce su sonido «Estoy aquí».

## Escenas (Gladys 5.1 o posterior)

La integración añade sus propias tarjetas al editor de escenas, en
**Integraciones**. Cada desencadenador puede limitarse a un robot; si se deja
vacío, se aplica a todos. Variable común: `{{triggerEvent.data.name}}` (nombre
del robot).

Desencadenadores:

- **Limpieza o siega iniciada**: el robot empieza a trabajar (no cuando reanuda
  tras una pausa).
- **Limpieza o siega terminada**: el robot ha dejado de trabajar (terminado,
  detenido o de vuelta a la base).
- **Robot de vuelta en su base**: el robot está en su base o estación,
  cargándose.
- **Error del robot**: el robot ha notificado un nuevo error. Variables
  `{{triggerEvent.data.code}}` y `{{triggerEvent.data.message}}` (en inglés).
  Perfecto para una notificación «robot atascado».
- **Consumible desgastado**: un cepillo, un filtro o una cuchilla ha bajado al
  10 % de su vida útil o menos. Puede limitarse por consumible; variables
  `{{triggerEvent.data.consumable_name}}` (en inglés) y
  `{{triggerEvent.data.percent}}`.

Acciones (salida `sent` o `located`: verdadero cuando el robot ha aceptado la
orden, para condicionar el resto de la escena):

- **Iniciar un robot** (reanuda si está en pausa), **Pausar un robot**,
  **Detener un robot**, **Enviar un robot a su base**, **Localizar un robot**.

## Widget del panel

Añada el widget **Robot Ecovacs** a un panel y elija el robot en sus ajustes.
Muestra:

- la batería, en directo;
- el estado, el último error, la potencia de aspiración, el desgaste de los
  consumibles (en naranja por debajo del 10 %) y la conexión;
- cuatro botones: **Iniciar** (o **Reanudar**, o **Pausa** mientras trabaja),
  **Detener**, **Base** y **Localizar**.

El widget usa la última lectura del robot: mostrarlo no cuesta ninguna petición
a la nube de Ecovacs.

## Códigos de error frecuentes

| Código | Significado                   |
| ------ | ----------------------------- |
| 101    | Batería baja                  |
| 102    | Robot atrapado en un bucle    |
| 103    | Problema de rueda             |
| 104    | Problema del sensor anticaída |
| 105    | Robot atascado                |
| 106    | Cepillo lateral desgastado    |
| 107    | Depósito de polvo lleno       |
| 108    | Cepillo lateral bloqueado     |
| 109    | Cepillo principal bloqueado   |
| 110    | Falta el depósito de polvo    |
| 111    | Problema del parachoques      |
| 112    | Problema del sensor láser     |
| 113    | Cepillo principal desgastado  |
| 115    | Problema de batería           |
| 118    | Filtro obstruido              |
| 119    | Problema del ventilador       |
| 120    | Problema del depósito de agua |
| 204    | Rueda atascada                |
| 312    | Sustituya la bolsa de polvo   |
| 1007   | Soporte de la mopa suelto     |

## Robots compatibles

- Deebots recientes (protocolo JSON): OZMO 920/950, T8, T9, T10, T20, T30, X1,
  X2, N8, N10… Los comandos de nueva generación (`_V2`) y los más antiguos se
  detectan automáticamente.
- Cortacéspedes GOAT: compatibilidad **por confirmar**, se agradecen los
  comentarios.
- **No compatibles**: los Deebots muy antiguos (primeras series 600/900,
  protocolo XMPP). «Probar la conexión» los nombra.

## Solución de problemas

- **«Ecovacs ha rechazado el correo electrónico o la contraseña»**:
  compruébelos en la aplicación y, sobre todo, el **país de la cuenta**. Tras un
  rechazo así, la integración deja de reintentar por sí sola (para no bloquear
  la cuenta): corrija la configuración o pulse **Probar la conexión**.
- **«Ecovacs pide confirmar Gladys como nuevo dispositivo»**: siga la
  [verificación del dispositivo](#verificación-del-dispositivo). Hasta
  entonces, la integración no reintenta por sí sola.
- **«Ecovacs ha rechazado el código de verificación»**: el código es incorrecto
  o demasiado antiguo; solicite uno nuevo.
- **«No se puede acceder a la nube de Ecovacs»**: compruebe el acceso a
  Internet de Gladys. La integración reintenta cada 5 minutos.
- **El robot está inaccesible**: está apagado o fuera del alcance de la red
  wifi; compruebe que responde en la aplicación Ecovacs Home.
- Los registros de la integración (interfaz de Gladys o `docker logs`) nunca
  contienen la contraseña ni los tokens.
