---
name: asto-c4-diagram
description: Interview the user to build a C4 model diagram — level 1 System Context, level 2 Container or level 3 Component — and deliver it as a draw.io CSV import that uses the Asto C4 library notation. Use when the user wants to create, model or draw a C4 diagram (system context, containers, components) for draw.io / diagrams.net, or invokes /asto-c4-diagram.
---

# Asto C4 diagram

Build one C4 diagram (levels 1–3) by asking the user questions, then deliver a CSV that draw.io imports with **Arrange → Insert → Advanced → CSV…**. The styles come from the Asto C4 library (https://github.com/FranklinRuiz/asto-c4), so the result looks exactly like elements dragged from that library and stays editable (double-click → Edit Data with c4Name, c4Type, c4Technology, c4Description).

Talk to the user in their language. Diagram text goes in the language they choose.

Requires Python 3 (standard library only) to run the bundled script. Paths such as `scripts/build_csv.py` are inside this skill's folder; run them with their full path.

**Asking questions:** if your environment has a tool for asking the user multiple-choice questions, use it; otherwise ask in plain chat with short numbered options. Either way, wait for the answers before moving on.

## 1. Ask what to draw

Ask these together in the first round:

- **Level**: System Context (1), Container (2) or Component (3).
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
1. The container being zoomed into (boundary name) and its technology.
2. Its components — controllers, services, repositories, facades, clients: name, technology (e.g. Spring Bean, Spring MVC Rest Controller), responsibility.
3. Containers, people and systems outside the boundary that the components use or are used by (databases, other APIs, the SPA calling in).
4. Relationships with verb phrase and technology where meaningful.

Before generating, show a compact summary (elements grouped as people / inside boundary / outside, plus the relationship list) and ask the user to confirm or adjust. Loop until they confirm.

## 3. Generate

1. Write the spec as JSON in a temporary folder, following `references/spec-format.md`.
2. Run:
   ```bash
   python scripts/build_csv.py spec.json "<output>.txt"
   ```
   Fix any `error:` it prints (unknown kind, missing id, bad relationship) and rerun.
3. Save the output in the user's working folder as `c4-<level>-<system-slug>.txt` unless they name another place.

## 4. Deliver

Tell the user, briefly:
- Where the file is (as a clickable link).
- How to import: draw.io → **Arrange → Insert → Advanced → CSV…** → replace the sample text with the whole file → **Import**.
- That the layout follows the c4model.com examples (people on top, the system or boundary in the middle, external systems on the right, title bottom-left) and they can rearrange freely.
- Offer the next level down (e.g. after a Container diagram, a Component diagram of one container), reusing what was gathered.

## Notation rules (from c4model.com)

- Every element shows a name, a bracketed type and a short description. Persons and software systems carry **no technology**; containers and components should.
- The system in scope is blue (`system`); systems around it are `external_system`. Persons outside the organisation can be `external_person`.
- Level 1 has no boundary. Level 2 draws a **system boundary** around the containers of the system in scope; level 3 draws a **container boundary** around the components.
- Relationships are one-directional, labelled with a verb phrase that reads source → target ("Sends e-mails to"), plus technology for levels 2–3.
- Keep each diagram readable: about 5–15 elements. If the user lists far more, suggest grouping or splitting.
