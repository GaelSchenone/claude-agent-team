# agent-team

Plugin de Claude Code con un equipo de agentes para desarrollo. El **tech-lead** recibe el pedido, arma el plan, elige qué agente y qué nivel usar, delega en paralelo e integra los resultados; no escribe código de la aplicación. Los especialistas trabajan cada uno en su carpeta y devuelven un reporte con lo que hicieron y lo que quedó pendiente.

## Agentes

- **tech-lead**: planifica, delega e integra. No toca código de la aplicación.
- **explorer**: mapea el código existente en solo lectura: estructura, convenciones, dependencias y comandos.
- **architect**: fija los contratos de API y de datos y registra las decisiones técnicas.
- **backend**: implementa API, lógica de negocio e integraciones contra el contrato.
- **backend-deep**: variante para autenticación, permisos, pagos, datos personales, concurrencia y rendimiento; usa el modelo del agente principal.
- **frontend**: implementa la interfaz desde los tokens y mockups de `design/`, con estados y accesibilidad.
- **database**: diseña esquemas, genera migraciones y optimiza consultas. No ejecuta migraciones contra bases reales.
- **database-deep**: variante para migraciones riesgosas, tablas grandes y modelado complejo; usa el modelo del agente principal.
- **qa**: escribe y ejecuta tests, reproduce bugs y verifica criterios de aceptación. No modifica código de la aplicación.
- **reviewer**: revisión de código y seguridad en solo lectura, con hallazgos clasificados por gravedad.
- **designer**: brief, wireframes, mood board, style guide, tokens y mockups en `design/`.

## Cómo se invocan

Los agentes se llaman con el prefijo del plugin: `agent-team:<nombre>`, por ejemplo `agent-team:explorer`, `agent-team:backend` o `agent-team:qa`. Ese es el valor que se pasa como `subagent_type` a la herramienta Agent.

El tech-lead carga la skill **`team-workflow`** antes de planificar o delegar: ahí está el protocolo del equipo (reparto de carpetas, flujo por olas, cuándo usar el nivel profundo y cómo cerrar la entrega).

## Skills incluidas

El plugin trae las skills `team-workflow`, `api-contract`, `db-migrations`, `design-direction`, `frontend-conventions`, `security-checklist` y `test-strategy`. Cada agente carga las que le corresponden; no hace falta instalarlas aparte.

## Instalación

```text
/plugin marketplace add GaelSchenone/claude-agent-team
/plugin install agent-team@gael-tools
```
