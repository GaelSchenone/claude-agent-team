---
name: frontend-conventions
description: Convenciones para implementar interfaces (uso de tokens de diseño, componentes, estados, accesibilidad, formularios, consumo de la API). Usar al construir o modificar pantallas y componentes de frontend, o al traducir mockups de design/ a código.
---

# Convenciones de frontend

## Diseño como fuente
- Colores, tipografías, espaciados, radios y sombras salen de `design/tokens.css`. Ningún valor visual suelto
  en el código. Si falta un token, se pide al `designer`, no se inventa.
- Los mockups de `design/mockups/` son la referencia visual. Cualquier desvío se avisa y se justifica.

## Componentes
- Pequeños, con una responsabilidad, y reutilizables antes de duplicar.
- Toda pantalla contempla los estados: cargando, vacío, error y éxito. Nunca queda en blanco sin explicación.
- La lógica de negocio no vive en los componentes de presentación.

## Accesibilidad
- HTML semántico; botones son `button` y enlaces son `a`.
- Todo se puede usar con teclado, con foco visible. Etiquetas asociadas a cada campo.
- Contraste mínimo 4.5:1 en texto normal y 3:1 en texto grande. Respetar `prefers-reduced-motion`.
- Áreas táctiles de al menos 44 px. La información no depende solo del color.

## Formularios
- Validar en el cliente para ayudar y en el servidor porque es la validación que vale.
- Mensajes de error concretos y junto al campo, en castellano rioplatense claro.
- Evitar pérdida de datos al fallar un envío. Deshabilitar el botón mientras se envía.

## Consumo de la API
- Se consume el contrato de `docs/contracts/` tal cual, con tipos derivados de él cuando se pueda.
- Manejo explícito de errores de red, de validación y de permisos. Reintentos solo en operaciones seguras.
- Ningún secreto, clave o token en el código del cliente.

## Calidad
- Responsive desde pantalla chica. Soportar modo oscuro si los tokens lo definen.
- Evitar renders innecesarios y dependencias pesadas para resolver cosas chicas.
- Cada componente con lógica propia lleva su test.
