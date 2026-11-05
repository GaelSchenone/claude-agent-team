---
name: test-strategy
description: Estrategia de pruebas (qué testear en cada capa, cómo escribir tests deterministas, reproducir bugs antes de corregirlos, qué ejecutar y cómo reportar). Usar al escribir o ejecutar tests, al verificar el trabajo de otros agentes o al investigar un bug.
---

# Estrategia de pruebas

## Antes de empezar
Descubrí cómo se ejecutan las pruebas en este proyecto (`package.json`, `Makefile`, `pyproject.toml`, CI) y usá
esos comandos. No asumas el framework.

## Qué probar y dónde
- **Unitarias:** reglas de negocio y funciones puras. Rápidas y sin red ni base real.
- **Integración:** endpoints contra una base de prueba local, repositorios, colas.
- **End to end:** solo los flujos críticos de punta a punta; pocas y estables.
- Priorizar lo que, si falla, hace más daño: dinero, permisos, datos personales, estados irrecuperables.

## Cómo escribirlas
- Estructura preparar, actuar, verificar. Un comportamiento por test y nombres que dicen el caso.
- Deterministas: sin depender del reloj, del azar, del orden ni de servicios externos (usar dobles).
- Datos de prueba ficticios. Nunca datos reales de clientes o empleados.
- Probar caminos de error y bordes, no solo el camino feliz.

## Bugs
1. Reproducir el bug con un test que falla.
2. Recién entonces se corrige.
3. El test queda como regresión.

## Qué se ejecuta y cómo se reporta
- Ejecutar de verdad. Si no se puede (falta una dependencia o un servicio), decirlo, no suponer el resultado.
- Reportar: comando exacto, cantidad de tests que pasan y fallan, y para cada fallo el mensaje y el archivo.
- Distinguir un fallo del código de un fallo del test o del entorno.
- No debilitar ni borrar un test para que pase: si un test es incorrecto, explicar por qué y proponer el cambio.
