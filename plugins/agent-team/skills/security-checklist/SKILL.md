---
name: security-checklist
description: Lista de control de seguridad para código y datos (secretos, validación de entradas, autenticación y autorización, inyecciones, XSS, datos personales). Usar al revisar código, al implementar autenticación, permisos, formularios o acceso a datos, y antes de dar por terminado un cambio sensible.
---

# Lista de control de seguridad

## Secretos
- Nunca en el código, en commits, en logs ni en el cliente. Van en variables de entorno o en un gestor de secretos.
- Si se detecta un secreto expuesto: avisarlo de inmediato, recomendar revocarlo y rotarlo, y reportarlo al área
  de Sistemas. No copiarlo ni repetirlo en mensajes.

## Entradas y salidas
- Validar y normalizar toda entrada en el servidor (tipo, largo, formato, rango).
- Consultas parametrizadas. Nunca concatenar SQL ni comandos con datos del usuario.
- Escapar la salida según el contexto para evitar XSS. Protección contra CSRF en acciones con sesión.
- Subida de archivos: validar tipo y tamaño, no confiar en el nombre, no ejecutar lo subido.

## Autenticación y autorización
- Verificar el permiso en cada operación, en el servidor, no solo ocultando botones.
- Contraseñas con un algoritmo de hash lento y apropiado. Sesiones y tokens con vencimiento.
- Mensajes de error que no revelan si un usuario existe ni detalles internos.
- Límite de intentos y de uso en los endpoints sensibles.

## Dependencias y configuración
- Dependencias mínimas, mantenidas y con versión fijada. Revisar avisos de vulnerabilidades conocidas.
- CORS, cabeceras de seguridad y modo depuración revisados para producción.

## Datos personales
- Tratar datos personales solo con una finalidad clara y recolectando lo mínimo (Ley 25.326). Quien tiene que
  autorizar el uso de datos de clientes o empleados es el área responsable: ante la duda, consultar a Legales.
- No registrar datos personales en logs. Enmascarar lo sensible en pantallas y en respuestas.
- Si el proyecto toca juego o apuestas, las reglas aplicables (LOTBA y normativa bonaerense) las define Legales:
  no inventar requisitos, señalar el punto y derivarlo.

## Qué se reporta
Hallazgos ordenados por gravedad, con archivo y línea, el riesgo concreto y una corrección sugerida.
Distinguir lo que se verificó de lo que es una sospecha.
