---
name: asto-c4-diagram
description: Interview the user to build a C4 model diagram — System Context, Container, Component, Dynamic or Deployment — and deliver it as a draw.io CSV import that uses the Asto C4 library notation. Use when the user wants to create, model or draw a C4 diagram (system context, containers, components, a dynamic view of a feature, or a deployment view) for draw.io / diagrams.net, or invokes /asto-c4-diagram.
---

# Asto C4 diagram

Build one C4 diagram (system context, container, component, dynamic or deployment) by asking the user questions, then deliver a CSV that draw.io imports with **Arrange → Insert → Advanced → CSV…**. The styles come from the Asto C4 library (https://github.com/FranklinRuiz/asto-c4), so the result looks exactly like elements dragged from that library and stays editable (double-click → Edit Data with c4Name, c4Type, c4Technology, c4Description).

Talk to the user in their language. Diagram text goes in the language they choose.

Requires Python 3 (standard library only) to run the bundled script. Paths such as `scripts/build_csv.py` are inside this skill's folder; run them with their full path.

**Asking questions:** if your environment has a tool for asking the user multiple-choice questions, use it; otherwise ask in plain chat with short numbered options. Either way, wait for the answers before moving on.

Respect the limits of such tools, or the call fails with invalid parameters. Claude Code's AskUserQuestion takes **at most 4 questions per call, 2 to 4 options per question** (it adds "Other" by itself, so never add one), and a **header of 12 characters or fewer**. When there are more choices than fit, group them and ask a follow-up, as in step 1.

## 1. Ask what to draw

Ask these together in the first round:

- **Diagram**, with exactly these 4 options: System Context (level 1), Container (level 2), Component (level 3), and "Dynamic or Deployment". If they pick the last one, ask a follow-up with 2 options: Dynamic (how a feature or use case flows, step by step) or Deployment (where the containers run in one environment).
- **Language** of the diagram text (Spanish / English).
- **Starting point**: describe it from scratch, or read it from the current codebase / a document they point to. If they choose the codebase, explore it first (entry points, deployables, databases, queues, external API clients) and propose the elements instead of asking for each one; then ask only to confirm or correct.

## 2. Interview by level

Ask in small rounds (2–4 questions each), proposing concrete options built from earlier answers so the user mostly picks or tweaks. Never ask for something you can infer. Keep the C4 rules in mind — see "Notation rules" below.

**Level 1 — System Context**
1. The system in scope: name and one-sentence purpose.
2. People who use it: each role and what they do with it. Internal or external to the organisation.
3. Other software systems it talks to: name, what they do, whether owned by the same organisation.
4. Relationships: for each person/system, what it does with the system in scope (and vice versa). Technology is optional here.

**Level 2 — Container** (zooming into one system)
1. The system being zoomed into (the boundary name). Reuse level 1 answers if this conversation already has them.
2. Its containers — each deployable/runnable unit or data store: name, kind (web app, SPA in the browser, mobile app, API/backend, worker, database, bucket, queue/topic, file folder), technology, responsibility.
3. People and external systems around it (from level 1, or ask).
4. Relationships between all of them, each with a verb phrase and a technology/protocol (e.g. "Makes API calls to" [JSON/HTTPS], "Reads from and writes to" [SQL/TCP]).

**Level 3 — Component** (zooming into one container)
1. The container being zoomed into (boundary name) and its technology, and the software system it belongs to (drawn as an outer boundary, like the c4model.com example).
2. Its components — controllers, services, repositories, facades, clients: name, technology (e.g. Spring Bean, Spring MVC Rest Controller), responsibility.
3. Containers, people and systems outside the boundary that the components use or are used by (databases, other APIs, the SPA calling in). Mark the containers of the same system with `in_system` so they are drawn inside the system boundary: callers above the container, data stores below it.
4. Relationships with verb phrase and technology where meaningful.

**Dynamic** (one feature or use case, step by step)
1. The feature or use case (e.g. "Sign in", "Create an exchange ticket") and its scope: drawn like a container or a component diagram (`scope`), with the same boundaries.
2. The elements that take part — only those; reuse them from earlier diagrams in the conversation.
3. The steps in order: who calls whom, what for, and the technology. Include the replies that matter ("Returns user data to", "Sends back a session token to"): they are numbered and drawn beside the request.

**Deployment** (one environment: development, staging, production…)
1. The environment and the system it deploys.
2. The deployment nodes, outermost first: network or data center → server, VM or laptop → Docker container, JVM, runtime. For each: name, technology (e.g. "Ubuntu 24.04 LTS", "Docker Container", "nginx") and number of instances if more than one.
3. Which container (or external system) runs in which node, reusing the containers from the Container diagram. Add infrastructure nodes (load balancer, DNS, firewall) where they help.
4. Relationships between the deployed containers, with technology, as in the Container diagram.

Before generating, check that the diagram tells the whole story, then show a compact summary (elements grouped as people / inside boundary / outside, plus the relationship list) and ask the user to confirm or adjust. Loop until they confirm.

### Completeness check (do this before the summary)

A C4 diagram must let anyone understand the solution without extra explanation. Walk through it and fix gaps by proposing the missing pieces to the user:

- **Close the loop with people.** Anything that delivers something to a person needs a relationship to that person: a notification, e-mail or SMS service → "Sends notifications to" the user; a reporting system → "Sends reports to". A diagram where notifications go out but never reach anyone is incomplete.
- **No loose elements.** Every element has at least one relationship.
- **Every person has a way in.** Each person uses at least one element of the system (or, on level 3, the diagram shows how requests arrive).
- **Every data store is used.** Each database, bucket or queue is read or written by something.

## 3. Generate

1. Write the spec as JSON in a temporary folder, following `references/spec-format.md`. `references/examples/` has the five c4model.com Internet Banking diagrams (system context, container, component, dynamic, deployment) as specs: use them as models for structure, wording and level of detail.
2. Run:
   ```bash
   python scripts/build_csv.py spec.json "<output>.txt"
   ```
   Fix any `error:` it prints (unknown kind, missing id, bad relationship) and rerun. Act on any `warning:` too: shorten long descriptions or add the missing relationships, then rerun.
3. Save the output in the user's working folder as `c4-<diagram>-<system-slug>.txt` (e.g. `c4-deployment-internet-banking-development.txt`) unless they name another place.

## 4. Deliver

Tell the user, briefly:
- Where the file is (as a clickable link).
- How to import: draw.io → **Arrange → Insert → Advanced → CSV…** → replace the sample text with the whole file → **Import**.
- That the layout follows the c4model.com examples (people on top, the system or boundary in the middle, external systems on the right, title bottom-left) and they can rearrange freely.
- Offer the next useful diagram, reusing what was gathered: the next level down (a Component diagram of one container), a Dynamic diagram of a key feature, or a Deployment diagram of an environment.

## Notation rules (from c4model.com)

- Every element shows a name, a bracketed type and a short description. Persons and software systems carry **no technology**; containers and components should.
- **Keep text short so elements are not cluttered.** Names: 2–5 words. Descriptions: one sentence, about 12 words / 90 characters at most, saying *what it is or does*, not how. Example: "Cliente interno que registra tickets de tipo de cambio." instead of a full paragraph. Relationship labels: a short verb phrase (2–8 words).
- The system in scope is blue (`system`); systems around it are `external_system`. Persons outside the organisation can be `external_person`.
- Level 1 has no boundary. Level 2 draws a **system boundary** around the containers of the system in scope; level 3 draws a **container boundary** around the components, nested inside the system boundary.
- Titles follow c4model.com: `System Context View: <system>`, `Container View: <system>`, `Component View: <system> - <container>`, `Dynamic View: <system> - <container>`, `Deployment View: <system> - <environment>`. Put only the part after the colon in `title`; the script adds the view name.
- Dynamic diagrams number every relationship in order (`1: Submits credentials to`); the script adds the numbers from the order of `relationships`.
- Deployment diagrams nest deployment nodes (grey boxes labelled `[Deployment Node: technology]`, with `xN` for several instances) and place the container instances inside them.
- Name relationships with a verb phrase that ends in a preposition so it reads source → target: "Makes API requests to", "Reads from and writes to", "Sends e-mails to customers using".
- Relationships are one-directional, labelled with a verb phrase that reads source → target ("Sends e-mails to"), plus technology for levels 2–3.
- Keep each diagram readable: about 5–15 elements. If the user lists far more, suggest grouping or splitting.
