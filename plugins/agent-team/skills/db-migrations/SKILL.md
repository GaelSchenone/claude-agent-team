---
name: db-migrations
description: Buenas prácticas para diseñar esquemas, escribir migraciones y revisar consultas SQL (reversibilidad, índices, restricciones, tipos, datos personales). Usar al crear o modificar tablas, al escribir migraciones, al optimizar consultas o al revisar cambios de base de datos.
---

# Base de datos y migraciones

## Reglas de las migraciones
- Pequeñas y con un solo propósito. Cada una con su reversa (`up` y `down`) cuando la herramienta lo permite.
- Una migración aplicada nunca se edita: se agrega otra nueva.
- Nombres ordenables por fecha y descriptivos.
- Los agentes **generan** las migraciones y **no las ejecutan** contra ninguna base que no sea local y descartable.
  Aplicarlas es decisión del usuario.
- Antes de algo destructivo (borrar columna o tabla, cambiar un tipo, reescribir datos): explicar el riesgo,
  proponer un respaldo y, si se puede, hacerlo en pasos (agregar, copiar, cambiar el uso, recién después borrar).

## Diseño del esquema
- Clave primaria en toda tabla. Claves foráneas con restricción real y política de borrado explícita.
- Restricciones en la base (`NOT NULL`, `UNIQUE`, `CHECK`), no solo en el código.
- Tipos correctos: dinero en entero de la unidad menor o decimal exacto (nunca `float`), fechas en UTC,
  texto con longitud pensada, booleanos como booleanos.
- Normalizar por defecto; desnormalizar solo con una razón medida.
- Auditoría (`creado_en`, `actualizado_en`) donde tenga valor.

## Consultas e índices
- Índice para cada clave foránea y para los filtros y órdenes frecuentes. Índices compuestos con el orden de
  las columnas pensado según la consulta.
- Revisar: consultas N+1, `SELECT *` innecesario, funciones sobre columnas indexadas en el `WHERE`,
  falta de paginación, transacciones largas, bloqueos al migrar tablas grandes.
- Consultas siempre parametrizadas; nunca armar SQL concatenando entradas.

## Datos personales
- Guardar solo lo estrictamente necesario para la finalidad (Ley 25.326). Marcar en el esquema qué
  columnas son datos personales para que se traten con cuidado.
- Datos de prueba y semillas: siempre ficticios, nunca copias de datos reales.

## Qué se entrega
Archivos de migración, el esquema resultante documentado en `docs/contracts/data-model.md` si cambió,
los índices agregados con su motivo y los riesgos conocidos.
