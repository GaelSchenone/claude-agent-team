---
name: design-direction
description: Dirección estética del equipo (minimalismo tipo Apple, Swiss/International Style y Bauhaus, moderno). Usar SIEMPRE antes de proponer o revisar wireframes, mood boards, paletas, tipografías, style guides, tokens CSS o mockups de una interfaz, y al evaluar el aspecto visual de una app o sitio. No usar para lógica de backend ni bases de datos.
---

# Dirección de diseño

Criterio visual de base para cualquier interfaz del equipo. Es un punto de partida para
elegir, no una receta: la decisión estética final la toma la persona que usa el proyecto.

## Principios comunes
- La función manda. Cada elemento tiene que justificar su lugar; si no comunica, se saca.
- La jerarquía se logra con tamaño, peso y espacio, no con decoración.
- Mucho espacio en blanco, una idea principal por pantalla.
- Grilla visible en la estructura: todo se alinea a algo.
- Contraste alto y legibilidad antes que efecto.

## Qué se toma de cada influencia
**Swiss / International Style**
- Grilla modular (12 columnas) y ritmo vertical sobre una base de 4 u 8 px.
- Una sola familia tipográfica grotesca y neutra, 2 o 3 pesos, escala modular (~1.25).
- Texto alineado a la izquierda, composición asimétrica, mucho aire.

**Bauhaus**
- La forma sigue a la función. Geometría básica (círculo, cuadrado, triángulo) como único ornamento.
- Primarios (rojo, amarillo, azul) más negro y blanco, usados en bloques con intención, no esparcidos.
- Tipografía geométrica en pesos fuertes, composición con tensión (diagonales, escalas contrastadas).

**Apple-like**
- Moderación y detalle cuidado. Tipografía clara y generosa, espaciado amplio.
- Profundidad sutil: sombras suaves; blur solo en capas funcionales (barras, paneles flotantes).
- Animación breve y con propósito. Modo oscuro. Áreas táctiles de al menos 44 px.

## Tensiones y cómo resolverlas
Apple tira a lo suave (radios grandes, blur) y Swiss/Bauhaus a lo riguroso (ángulos, bloques de color).
No se mezclan dentro de una misma dirección: se elige una política explícita para cada cosa.

| Decisión | Swiss-Apple | Bauhaus moderno | Apple minimalista |
|---|---|---|---|
| Radios | 0 a 4 px | 0 px o círculo completo | 10 a 16 px |
| Color | neutros + 1 acento | bloques primarios + negro | neutros + 1 acento |
| Sombras / blur | casi ninguna | ninguna | suaves; blur solo funcional |
| Tipografía | grotesca neutra | geométrica, pesos fuertes | sistema, grande |
| Ornamento | ninguno | formas geométricas | ninguno |

## Tres direcciones estándar (punto de partida)
Siempre se presentan las tres, con variaciones propias del proyecto. Los hex son orientativos.
- **A. Swiss-Apple:** fondo #F5F5F3, tinta #111111, acento #0A5CFF. Grilla de 12 columnas, `Inter` o `system-ui`.
- **B. Bauhaus moderno:** blanco hueso #F4F1EA, negro #111111, rojo #E03A2F, amarillo #F2C230, azul #1F4FD8. Titulares en `Jost` en peso 700.
- **C. Apple minimalista:** fondo #FFFFFF y #F5F5F7, tinta #1D1D1F, acento #0071E3. `system-ui`, escala grande, radios generosos.

## Tipografías
- Para el aspecto Apple usar el stack `system-ui, -apple-system, "Segoe UI", sans-serif`. No auto-hospedar SF Pro: su licencia es solo para plataformas Apple.
- Alternativas abiertas: Inter (A y C), Jost (B). Confirmar la licencia de cada una antes de incluirla.
- Los HTML deben verse bien sin cargar fuentes externas: siempre un fallback del sistema.

## Evitar lo genérico
- Gradientes violeta a azul, glassmorphism por defecto, sombras idénticas en todas las tarjetas.
- Tres tarjetas iguales en fila como solución a todo. Centrar todo.
- Iconos o emojis decorativos. Texto de relleno (usar copy realista del proyecto).
- Paletas arbitrarias: cada color tiene un rol (fondo, tinta, acento, estado).
- Nunca poner texto claro sobre amarillo; con amarillo va tinta oscura. Verificar el contraste de cada par.

## Entregables HTML
- Cada archivo es autocontenido (CSS y JS inline, sin build ni dependencias externas) y se abre con doble clic.
- Los colores, tipografías, espaciados y radios salen de variables CSS en `:root` (después se exportan a `tokens.css`).
- Soportar `prefers-color-scheme` y `prefers-reduced-motion`. HTML semántico, foco visible, responsive.
- Contraste mínimo: 4.5:1 en texto normal y 3:1 en texto grande y componentes.
- Mood board: cada referencia lleva link de origen, qué se toma, qué no se toma y observaciones de uso. No copiar imágenes de terceros al repositorio: guardar links, notas y la paleta extraída.
- Mockups y wireframes con datos ficticios. Nunca datos reales de clientes o empleados (Ley 25.326).
- Si el proyecto tiene manual de marca, es la base y esta guía solo completa lo que el manual no define.

## Proceso
1. Brief. 2. Wireframes en grises. 3. Mood board con las tres direcciones. 4. **Esperar la elección del usuario.**
5. Style guide y `tokens.css` de la dirección elegida. 6. Mockups hi-fi usando solo los tokens.

## Control final
- ¿Se entiende la jerarquía sin mirar los colores?
- ¿Todo está alineado a la grilla y usa la escala de espaciado?
- ¿Cada color y cada forma cumple un rol?
- ¿Pasan los contrastes y se ve bien en modo oscuro y en pantalla chica?
