# Capa de traducción al español

Traduce la interfaz **al compilar**, sin editar los archivos originales del
proyecto. Así, cuando se sincroniza con el repositorio original (`upstream`),
no aparecen conflictos por los textos.

## Cómo funciona

- `es.*.tsv`: el diccionario. Una línea por texto: `original => traducción`.
- `vite-plugin-i18n.mjs`: al compilar, sustituye cada texto inglés del
  diccionario por su traducción (texto de JSX, `placeholder`, `title`, `label`,
  avisos `toast`, condicionales dentro de la interfaz, etc.).
- `brand.json`: el nombre del producto. En las traducciones, `{{app}}` se
  sustituye por ese nombre (hoy "Carlos Ortega"). Para cambiarlo, se edita una
  sola línea.
- Lo que no está en el diccionario se queda en inglés. Nunca rompe nada.

## Mantenimiento

Tras sincronizar con el original, comprueba qué textos nuevos han llegado:

```bash
node custom/i18n/cli.mjs check
node custom/i18n/cli.mjs missing
```

- `check` resume cuántos textos hay, cuántos están traducidos y si alguna
  entrada del diccionario ya no coincide con el código (errata o texto que ha
  cambiado).
- `missing` lista los textos que faltan por traducir. Se añaden a un
  `es.N.tsv` nuevo.

## Formato del diccionario

- Las líneas que empiezan por `#` son comentarios.
- Una traducción puede empezar o acabar con `⎵` para conservar un espacio
  (útil en fragmentos que se pegan a un valor dinámico).
- Los textos que son siglas o comandos (CLS, CTR, `npx wrangler ...`) se dejan
  sin traducir a propósito.

## Qué no cubre

- Textos construidos con plantillas o con variables dentro de una cadena.
- Mensajes de error que genera el servidor.
- Datos que llegan de DataForSEO (categorías, nombres de países).
- Fechas y números: se formatean con la configuración regional del navegador.
