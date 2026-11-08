# Spec format for `build_csv.py`

```json
{
  "level": "containers",
  "title": "Internet Banking System",
  "description": "The container diagram for the Internet Banking System.",
  "boundary": { "name": "Internet Banking System", "type": "Software System" },
  "elements": [
    { "id": "customer", "kind": "person", "name": "Personal Banking Customer",
      "description": "A customer of the bank, with personal bank accounts." },
    { "id": "spa", "kind": "web_browser", "inside": true, "name": "Single-Page Application",
      "technology": "JavaScript and Angular",
      "description": "Provides all of the Internet banking functionality to customers via their web browser." },
    { "id": "api", "kind": "server_app", "inside": true, "name": "API Application",
      "technology": "Java and Spring MVC", "description": "Provides Internet banking functionality via a JSON/HTTPS API." },
    { "id": "mainframe", "kind": "external_system", "name": "Mainframe Banking System",
      "description": "Stores all of the core banking information." }
  ],
  "relationships": [
    { "from": "customer", "to": "spa", "description": "Views account balances, and makes payments using" },
    { "from": "spa", "to": "api", "description": "Makes API calls to", "technology": "JSON/HTTPS" },
    { "from": "api", "to": "mainframe", "description": "Makes API calls to", "technology": "XML/HTTPS" }
  ]
}
```

## Fields

| Field | Notes |
|---|---|
| `level` | `context` (level 1), `containers` (level 2) or `components` (level 3). |
| `title` | Name shown after the view prefix, e.g. `[Containers] Internet Banking System`. |
| `description` | One line under the title. |
| `boundary` | Only for `containers` and `components`. `name` is the system (level 2) or container (level 3) being zoomed into. `type` defaults to `Software System` / `Container`. |
| `elements[].id` | Unique, short, no spaces. Used by relationships. |
| `elements[].kind` | See the table below. |
| `elements[].inside` | `true` for elements drawn inside the boundary (the containers of the system, or the components of the container). |
| `elements[].type` | Optional override of the bracketed type, e.g. `Container` for a `database`. Defaults by kind. |
| `elements[].technology` | Omit for persons and software systems: the C4 notation shows no technology for them. |
| `relationships[]` | `from`, `to`, `description` (a verb phrase), optional `technology`. |

## Kinds

| Kind | Use for |
|---|---|
| `person` / `external_person` | Users, actors, roles (internal / outside the organisation). |
| `system` / `external_system` | Software systems: the one in scope (blue) and the ones around it (red). |
| `container` | Generic application or service. |
| `web_browser` | Single-page app or anything running in the browser. |
| `server_app` | Server-side process: API, backend, worker. |
| `mobile_app` | iOS / Android / cross-platform app. |
| `database` | Database schema. |
| `bucket` | Object storage (S3, Blob storage). |
| `message_bus` | Queue, topic, event stream (RabbitMQ, Kafka). |
| `folder` | File system directory, static content. |
| `component` | A component inside a container (level 3). |
| `infrastructure_node` | Load balancer, DNS, firewall (rare in levels 1–3). |

## Layout

The script places elements like the c4model.com examples:

- **Top:** people, plus outside elements that only call into the system (e.g. the SPA on a component diagram).
- **Middle:** the system in scope (level 1), or the boundary and its contents (levels 2–3), in rows by call depth: what the outside calls first, what those call below. A lone element sits under its caller.
- **Right:** external systems and every other outside element, in one column. Those that talk to the people go first.
- **Bottom-left:** the diagram title.

The order of `elements` breaks ties within a row. The user can rearrange in draw.io after importing.
