# Oretron Dashboard

Panel de control para los proyectos, leads y métricas de Oretron.

## De dónde salen los datos

El gadget **no inventa nada**. Consulta el proyecto de Supabase del
cliente a través del gatekeeper que el usuario conectó en el panel de
conexiones del OS.

Por qué no hace la consulta él mismo: el código de un gadget no puede
hacer peticiones de red. El único camino hacia un servicio externo es un
*binding* hacia su gatekeeper, y cada lectura pasa por la cola de
aprobación — así que el usuario ve y acepta exactamente qué se consulta.

## Puesta en marcha

1. Creá el gadget desde este blueprint.
2. En el panel de conexiones, conectá **Supabase** (OAuth). Sin esa
   conexión el panel lo dice en vez de mostrar números falsos.
3. Aprobá las lecturas cuando aparezcan: cada consulta a la base pide
   permiso.

## Qué consulta

Solo `SELECT`, y solo lo justo para mirar:

| Dato | De dónde |
|---|---|
| Proyectos recientes | `projects` |
| Últimos leads | `leads` |
| Total de documentos | `project_documents` |
| Agentes activos | `agent_config` |

Una tabla que no exista en el esquema del cliente no tumba el panel: se
avisa en un banner y el resto sigue mostrándose.

## Notas

- Identidad: negro/blanco/ore de Oretron (`#9A5B3D`), no azul.
- Si el gatekeeper está desconectado o algo falla, el panel **lo dice**.
  La versión anterior mostraba proyectos y leads ficticios, que es peor
  que no mostrar nada porque se confundían con datos reales.
