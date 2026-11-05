---
name: open
description: Abre el canvas de agentes, el panel local en vivo con los agentes y subagentes de Claude Code. Solo se usa cuando el usuario lo pide con /agent-canvas:open.
disable-model-invocation: true
---

Levantá el servidor del canvas ejecutando con Bash exactamente este comando:

`agent-canvas start`

Después decile al usuario, en una o dos líneas, que abra la dirección que imprime el comando (por defecto http://127.0.0.1:7789) en el navegador.

Si el comando falla porque `agent-canvas` o `node` no existen, explicá que el canvas necesita Node 18 o superior instalado y no intentes otra cosa.
Para detenerlo: `agent-canvas stop`. Para que se inicie solo en cada sesión, el usuario puede definir la variable de entorno `AGENT_CANVAS_AUTOSTART=1`.
