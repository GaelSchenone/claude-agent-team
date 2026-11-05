---
name: team-workflow
description: Protocolo del equipo de desarrollo (tech-lead y especialistas). Usar al coordinar o delegar trabajo entre agentes, al armar el plan de una tarea de desarrollo, al repartir carpetas, al decidir entre nivel normal y profundo, y al integrar o cerrar una entrega.
---

# Protocolo del equipo

## Equipo y carpetas
En Claude Code los agentes de este plugin se llaman con prefijo: `agent-team:explorer`, `agent-team:backend`, etc. (es el `subagent_type` de la herramienta Agent).

Cada agente trabaja solo en lo suyo. Si necesita algo fuera de su carpeta, lo pide a quien lo delegó; no lo hace por su cuenta.
**Importante:** en Claude Code esto se cumple por instrucción y por la lista de herramientas de cada agente, no por permisos
por carpeta. Las instrucciones se respetan casi siempre, pero no son una garantía: el `reviewer` revisa el diff justamente para detectarlo.

| Agente | Rol | Trabaja en | Modelo |
|---|---|---|---|
| tech-lead | Planifica, delega, integra. No escribe código | `docs/plans/**` | el de la sesión |
| explorer | Mapea el código existente (solo lectura) | nada | Haiku |
| designer | UX/UI: brief, wireframes, mood board, tokens | `design/**` | Sonnet (esfuerzo medio) |
| architect | Contratos (API, datos) y decisiones | `docs/architecture/**`, `docs/contracts/**`, `docs/decisions/**` | Sonnet |
| backend / backend-deep | API, lógica, integraciones, auth | `backend/**`, `api/**`, `server/**` | Sonnet / el del tech-lead |
| frontend | Interfaz, estado, accesibilidad | `frontend/**`, `web/**`, `client/**` | Sonnet |
| database / database-deep | Esquema, migraciones, consultas | `db/**`, `database/**`, `migrations/**`, `prisma/**`, `sql/**` | Sonnet / el del tech-lead |
| qa | Tests y reproducción de bugs | `tests/**`, `e2e/**`, `**/*.test.*`, `**/*.spec.*` | Haiku |
| reviewer | Revisión de código y seguridad (solo lectura) | nada | Sonnet |

Si el proyecto usa otras carpetas, se aclara en el encargo.

## Flujo por olas
1. **Ola 0, relevamiento:** `explorer` (y `designer` si hay interfaz nueva). Independientes entre sí.
2. **Ola 1, contrato:** `architect` fija el contrato de API y el modelo de datos en `docs/contracts/`.
3. **Ola 2, construcción:** `database`, `backend` y `frontend` en paralelo, cada uno contra el contrato.
4. **Ola 3, verificación:** `qa` y `reviewer` en paralelo.
5. **Integración:** el `tech-lead` junta los resultados, resuelve contradicciones y reporta.

Lo independiente se lanza junto, con varias llamadas a `Agent` en un mismo turno. Lo que depende de otra cosa va en la ola
siguiente. Los subagentes corren en segundo plano: el `tech-lead` espera el resultado de **todos** los de la ola antes de seguir.
Si solo hay backend, o solo interfaz, se saltean las olas que no aplican.

## Plan antes de delegar
El `tech-lead` presenta una tabla y **espera la aprobación del usuario** antes de lanzar nada:

| # | Tarea | Agente | Nivel | Por qué ese nivel | Depende de | Carpeta |
|---|---|---|---|---|---|---|

## Nivel normal o profundo
Por defecto se usa el nivel normal. Los niveles `-deep` usan el mismo modelo que el tech-lead (el más fuerte), así que se usan
solo con una razón concreta escrita en el plan:
- autenticación, permisos, pagos o datos personales;
- migraciones de datos riesgosas o irreversibles;
- lógica algorítmica compleja, concurrencia o rendimiento;
- un intento anterior del nivel normal falló.

## Cómo se delega
Cada encargo lleva: objetivo, contexto mínimo (archivos concretos), contrato aplicable, alcance (carpetas),
criterios de aceptación y qué NO hacer. No se pasa el chat entero: el contexto grande consume cupo.

## Cómo se entrega
Cada agente cierra con: archivos modificados, comandos que corrió con su resultado real, supuestos y pendientes.
Nadie afirma que algo funciona si no lo ejecutó. Las entregas son breves: resumen de hasta 15 líneas, rutas y resultados.

## Puntos de control con el usuario
- Aprobación del plan.
- Contrato que toque autenticación, permisos o datos personales.
- Migraciones: los agentes las generan; las aplica el usuario, nunca contra una base real.
- Nada se da por terminado sin `qa` y `reviewer` conformes.

## Cuando un agente no puede trabajar
Si un agente falla (límite de uso, error del modelo): no se lo reasigna a otro más caro ni lo hace el tech-lead. Se informa al
usuario qué quedó pendiente y se espera.

## Cuidado del cupo
Todos los subagentes consumen el mismo cupo del plan que la sesión principal, y varios en paralelo lo gastan rápido.
Encargos acotados, nivel normal por defecto, Haiku para lo mecánico, y abrir una sesión nueva cuando el contexto ya es muy grande.
