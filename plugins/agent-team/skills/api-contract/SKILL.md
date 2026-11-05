---
name: api-contract
description: Cómo diseñar y documentar el contrato de una API (endpoints, esquemas, errores, autenticación, paginación, versionado) antes de implementarla. Usar al definir o cambiar una API, al implementar un endpoint contra un contrato existente o al consumirlo desde el frontend.
---

# Contrato de API primero

El contrato vive en `docs/contracts/api.md` (o `openapi.yaml` si el proyecto ya lo usa). Lo escribe el
`architect`; `backend` y `frontend` lo implementan y lo consumen. Un cambio al contrato pasa por el `architect`.

## Qué contiene
- Por endpoint: método, ruta, propósito, autenticación requerida, parámetros, cuerpo de pedido y de respuesta
  con un ejemplo real, códigos de estado posibles.
- Esquemas compartidos con nombre (por ejemplo `Usuario`, `Error`), para no repetirlos.
- Reglas transversales: autenticación, paginación, filtros, orden, versionado, límites de tamaño.

## Criterios de diseño
- Recursos en plural y sustantivos (`/usuarios/{id}`); los verbos van en el método HTTP.
- Códigos de estado correctos: 201 al crear, 204 sin cuerpo, 400 validación, 401 sin identidad,
  403 sin permiso, 404 inexistente, 409 conflicto, 422 regla de negocio, 429 límite de uso.
- Errores con un formato único y estable: `codigo` legible por máquina, `mensaje` para personas y,
  en validaciones, el detalle por campo. Nunca filtrar trazas ni datos internos.
- Paginación en toda lista (cursor u offset, explícito en el contrato) y tope máximo de tamaño de página.
- Operaciones que crean o cobran: idempotentes (clave de idempotencia) cuando un reintento puede duplicar.
- Fechas en ISO 8601 UTC. Dinero como entero en la unidad menor o decimal exacto, nunca coma flotante.
- Compatibilidad: agregar campos opcionales no rompe; quitar o renombrar sí, y requiere versión nueva.
- Datos personales: devolver solo lo necesario para el caso de uso.

## Al implementar
- `backend`: valida entradas contra el contrato, devuelve exactamente los esquemas definidos y agrega un
  test por endpoint que pruebe el camino feliz y los errores documentados.
- `frontend`: consume el contrato tal cual; si falta algo o hay algo ambiguo, lo reporta, no lo inventa.
- Si el contrato y la implementación divergen, gana el contrato hasta que el `architect` lo cambie.
