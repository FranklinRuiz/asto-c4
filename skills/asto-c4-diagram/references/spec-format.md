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
| `level` | `context` (level 1), `containers` (level 2), `components` (level 3), `dynamic` or `deployment`. |
| `scope` | Only for `dynamic`: `context`, `containers` or `components` (default). The diagram is drawn like that level, with the same `boundary`, `system`, `inside` and `in_system` fields. |
| `title` | Shown after the view name: `Container View: Internet Banking System`. On level 3 use `<system> - <container>`, e.g. `Internet Banking System - Backend`. |
| `description` | One line under the title. |
| `boundary` | Only for `containers` and `components`. `name` is the system (level 2) or container (level 3) being zoomed into. `type` defaults to `Software System` / `Container`. |
| `system` | Only for `components`, optional: `{ "name": "Internet Banking System" }`. Draws the system boundary around the container boundary. |
| `elements[].in_system` | Only with `system`: `true` for other containers of the same system (the UI calling in, the databases). Callers go above the container boundary, the rest below it, inside the system boundary. |
| `elements[].id` | Unique, short, no spaces. Used by relationships. |
| `elements[].kind` | See the table below. |
| `elements[].inside` | `true` for elements drawn inside the boundary (the containers of the system, or the components of the container). |
| `elements[].type` | Optional override of the bracketed type, e.g. `Container` for a `database`. Defaults by kind. |
| `elements[].technology` | Omit for persons and software systems: the C4 notation shows no technology for them. |
| `relationships[]` | `from`, `to`, `description` (a verb phrase), optional `technology`. On a `dynamic` diagram, list them in step order: they are numbered 1, 2, 3… (or set `order`). A reply (B → A after A → B) is drawn beside the request. |
| `nodes[]` | Only for `deployment`: `id`, `name`, optional `technology`, `instances` and `parent` (the id of the node that contains it). List outer nodes first. |
| `elements[].node` | Only for `deployment`: the id of the node the element runs in. Elements without a node go in a column on the right. |

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

## Deployment example

```json
{
  "level": "deployment",
  "title": "Internet Banking System - Production",
  "description": "Production deployment of the Internet Banking System.",
  "nodes": [
    { "id": "dc", "name": "Big Bank Data Center", "technology": "Big Bank plc" },
    { "id": "api-srv", "name": "bigbank-api", "technology": "Ubuntu 24.04 LTS", "instances": 8, "parent": "dc" },
    { "id": "tomcat", "name": "Apache Tomcat", "technology": "Apache Tomcat 10.x", "parent": "api-srv" },
    { "id": "db-srv", "name": "bigbank-db01", "technology": "Ubuntu 24.04 LTS", "parent": "dc" }
  ],
  "elements": [
    { "id": "api", "kind": "server_app", "node": "tomcat", "name": "API Application", "technology": "Java and Spring MVC",
      "description": "Provides Internet banking functionality via a JSON/HTTPS API." },
    { "id": "db", "kind": "database", "node": "db-srv", "name": "Database", "technology": "Oracle 19c",
      "description": "Stores user accounts and access logs." }
  ],
  "relationships": [
    { "from": "api", "to": "db", "description": "Reads from and writes to", "technology": "JDBC" }
  ]
}
```

## Layout

The script places elements like the c4model.com examples:

- **Top:** people, plus outside elements that only call into the system (e.g. the SPA on a component diagram).
- **Middle:** the system in scope (level 1), or the boundary and its contents (levels 2–3), in rows by call depth: what the outside calls first, what those call below. Each element sits under what calls it; elements that talk to external systems take the rightmost column; an element that a relationship in its row would jump over moves to its own row.
- **Level 3 with `system`:** the container boundary nested in the system boundary, `in_system` callers above it and data stores below it, each under the component that uses it.
- **Right:** external systems in one column, each at the height of what it talks to. Those that talk to the people sit higher.
- **Bottom-left:** the diagram title.

- **Dynamic:** like its `scope`. Two-way pairs (a request and its reply) run side by side, with their labels on opposite sides.
- **Deployment:** nested node boxes; inside each node, its contents in rows by flow (what is called first on top), up to 3 per row.

The order of `elements` breaks ties within a row. The user can rearrange in draw.io after importing.
