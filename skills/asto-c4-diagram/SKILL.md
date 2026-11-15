---
name: asto-c4-diagram
description: Build a C4 model diagram — System Context, Container, Component, Dynamic or Deployment — from what the user describes, with a short focused interview for what is missing, and deliver it as a .drawio file built from the Asto C4 library elements, optionally combined with reference frameworks (BIAN and ISO 20022 for banking and payments, TOGAF for enterprise architecture, and suggestions for TM Forum, ACORD or HL7 FHIR), a BIAN Impact View, change status per element, document control and ADRs in a companion document. Use when the user wants to create, model or draw a C4 diagram (system context, containers, components, a dynamic view of a feature, or a deployment view) for draw.io / diagrams.net, or invokes /asto-c4-diagram.
---

# Asto C4 diagram

Build one C4 diagram (system context, container, component, dynamic or deployment) from what the user describes, then deliver a `.drawio` file. Every shape is an Asto C4 library element (https://github.com/FranklinRuiz/asto-c4) with exactly the properties that element has in the library and nothing else (c4Name, c4Type, c4Technology, c4Description…; relationships with c4Type, c4Description, c4Technology), nested in its boundary, node or group, so the user edits it with Edit Data as if they had dragged it from the library. Never invent properties: extra information goes into an existing one (document control at the end of the title's c4Description). With BIAN, the C4 view stays clean and the BIAN mapping is shown on the BIAN Impact View page.

Talk to the user in their language. Diagram text goes in the language they choose.

Requires Node.js 18 or later to run the bundled script (no packages to install). Paths such as `scripts/build_drawio.mjs` are inside this skill's folder; run them with their full path.

**Asking questions:** short, focused rounds (see step 1). If your environment has a tool for asking multiple-choice questions, use it; otherwise ask in plain chat with short numbered options. Either way, wait for the answers before moving on.

Respect the limits of such tools, or the call fails with invalid parameters. Claude Code's AskUserQuestion takes **at most 4 questions per call, 2 to 4 options per question** (it adds "Other" by itself, so never add one), and a **header of 12 characters or fewer**. When there are more choices than fit, group them and ask a follow-up.

## 1. Short, focused interview

The skill exists to make diagrams easy *and* good. Interview the user when the request lacks what a sound architecture needs, but with **pointed questions that do not tire them**: propose concrete options built from what they said, so they mostly pick or tweak. If you can infer an answer or fill it with a sensible default, don't ask.

- **Small rounds:** 2–4 questions per round, usually 1–2 rounds before the draft. A third round only if an essential piece is still missing.
- **Ask what changes the architecture,** not details you can propose: who uses the system and for what, the main capabilities or flows, the systems it must integrate with, and constraints that shape the design (regulation, availability, sync vs. events, data ownership).
- **Never ask** for the language (use the user's), technologies you can propose, relationship wording, the starting point when it is obvious, document control, or the change status the user already described.
- **Offer options, not open questions:** "¿Los pagos interbancarios van por la CCE o por un banco socio?" beats "¿Cómo se integran los pagos?".
- **The summary is the final confirmation.** Show the draft once, with everything you assumed marked, and let the user correct it in a single reply.

What to cover, only where it applies:

- **Diagram**, if the request does not say it, with exactly these 4 options: System Context (level 1), Container (level 2), Component (level 3), and "Dynamic or Deployment". If they pick the last one, ask which in the next round.
- **Starting point**, only if there is a codebase or document and it is unclear whether to use it. If they choose the codebase, explore it (entry points, deployables, databases, queues, external API clients) and propose the elements from it; then ask only to confirm or correct.
- **Reference frameworks**, only when the domain matches (see 1b), in the first round.
- **Essentials still missing** after reading the request: the users and what they do, the main capabilities, the external systems, and any constraint that changes the design. Ask them as options proposed from the domain (e.g. for a wallet: "¿Se integra con: CCE, core bancario, RENIEC, proveedor de SMS?" as a multi-select).

## 1b. Reference frameworks

C4 is the base and the first option; a framework is added only if the user accepts it, and it never changes the C4 notation. When the domain matches, add **one** question to the first round (do not ask it separately):

- **Banking, wallets, payments, cards, loans, deposits**: "Solo C4 (Recommended)", "C4 + BIAN + ISO 20022", "C4 + TOGAF", "C4 + BIAN + ISO 20022 + TOGAF", each with a one-line description (BIAN: the banking capability of each element; ISO 20022: the payment messages on the arrows; TOGAF: principles, building blocks and decisions in a companion document).
- **Enterprise architecture work** (a target architecture, an architecture board): "Solo C4 (Recommended)", "C4 + TOGAF".
- **Telecom, insurance or health**: "Solo C4 (Recommended)", "C4 + <standard>" (TM Forum, ACORD or HL7 FHIR — see `references/frameworks/other-domains.md`).

If the user already named a framework, apply it without asking. If nothing matches, do not ask. When one is chosen, read its guide: `references/frameworks/bian.md`, `iso20022.md`, `togaf.md` or `other-domains.md`.

## 2. Draft the diagram

Build the whole draft yourself, keeping the C4 rules in mind (see "Notation rules"). Reuse anything gathered earlier in the conversation.

- **System Context:** the system, its users (internal or external) and the systems around it, with what each does with the system.
- **Container:** the deployable units and data stores (web app, SPA, mobile app, API, worker, database, bucket, queue, folder) with a proposed technology and responsibility, the people and external systems around them, and the relationships with a verb phrase and protocol ("Makes API calls to" [JSON/HTTPS]).
- **Component:** the components of one container (controllers, services, repositories, clients) with technology, plus the containers and systems they use. Containers of the same system get `in_system` (drawn inside the system boundary).
- **Dynamic:** only the elements of one feature, and the steps in order, including the replies that matter.
- **Deployment:** the nodes of one environment, outermost first (network → server or VM → runtime), with technology and instances, and which container runs where.

**Frameworks, if chosen:** with BIAN, the `.drawio` gets a second page with the BIAN Impact View of the same elements automatically (no question; `"bian_view": false` turns it off). The C4 page then carries no BIAN tags or BIAN groups, so it stays pure C4; do not propose `group_by`. Propose a BIAN Service Domain for each container or component (from `assets/bian-service-landscape-v12.json`; the table in `references/frameworks/bian.md` covers the usual cases), ISO 20022 messages on interbank relationships, and, with TOGAF, 3–5 principles and the building blocks. Leave people, external systems and technical elements without BIAN. Gaps go to `notes`.

**Project deliverables, without asking:**
- **Change status** (`status`): when the user describes a change ("se agrega", "se modifica", "nuevo servicio"), mark the elements `new`, `modified` or `out_of_scope`; the rest stay unchanged. Each status gets its own colour, explained in the legend.
- **Document control** (`meta`): when there is a status or a framework, add version `0.1`, today's date, author (the git `user.name` if there is a repository; otherwise leave it out) and status `draft`.
- **ADRs** (`decisions`): with TOGAF, or when the user mentions an architecture board or review, propose 2–4 decisions that shaped the design (context, decision, consequences, status `proposed`), in the companion document.

Keep ids, names and status the same across all views of one project.

### Completeness check and size (fix in the draft, don't ask)

Before the summary, fix these in the draft and mention what you added:

- Anything that delivers something to a person (notifications, e-mails, reports) has a relationship to that person.
- Every element has a relationship, every person uses something, every data store is read or written.

If the diagram is crowded (more than about 15 elements, 10 inside the boundary, 6 external systems, or cross-cutting services such as audit, monitoring or logging), say so in one line of the summary and suggest what to leave out, group or split. Never drop elements without the user's consent.

### Summary

Show the draft once, compactly: people / inside the boundary / outside, then the relationships, then (if any) BIAN, status, principles and ADRs. Mark what you assumed with "(propuesto)" or "(assumed)". End with one line such as "¿Lo genero así o cambias algo?". Apply the corrections and generate; show the summary again only if the changes were large.

## 3. Generate

1. Write the spec as JSON in a temporary folder, following `references/spec-format.md`. `references/examples/` has the five c4model.com Internet Banking diagrams (system context, container, component, dynamic, deployment) as specs: use them as models for structure, wording and level of detail.
2. Run:
   ```bash
   node scripts/build_drawio.mjs spec.json "<output>.drawio"
   ```
   If the user chose any reference framework, add `--doc "<output>.md"` to also write the companion document (views, BIAN mapping, ISO 20022 messages, TOGAF principles and building blocks, notes); set `frameworks` and `language` in the spec. `references/examples/6-container-bian-togaf.json` combines the three; `7-bian-impact.json` adds the BIAN Impact View, change status, document control and ADRs.

   Fix any `error:` it prints (unknown kind, missing id, bad relationship, a BIAN name that does not exist — it suggests the closest real ones) and rerun. Act on any `warning:` too: shorten long descriptions or add the missing relationships, then rerun. Warnings about too many elements are for the user to decide: mention them in one line (unless the summary already did) and keep the diagram as they choose.
3. Save the output in the user's working folder as `c4-<diagram>-<system-slug>.drawio` (e.g. `c4-deployment-internet-banking-development.drawio`), and the companion document next to it with the same name and `.md`, unless they name another place.

## 4. Deliver

Tell the user, briefly:
- Where the file is (as a clickable link).
- How to open it: double-click the file, open it with **File → Open** in draw.io, or open it in VS Code with the Draw.io Integration extension. To add it to a diagram that is already open: **File → Import from → Device**.
- That the layout follows the c4model.com examples (people on top, the system or boundary in the middle, external systems on the right, title bottom-left, the C4 legend of the Asto C4 library bottom-right) and they can rearrange freely.
- If frameworks were applied: where the companion document is, and one line on what it adds (e.g. "the BIAN mapping of each service, the ISO 20022 messages, the TOGAF principles and the ADRs").
- If you used change status: that the colour of each changed element is explained in the legend.
- With BIAN: that the file has a second page, the **BIAN Impact View**, with the same elements inside their BIAN Business Area, Business Domain and Service Domain (technical elements such as gateways and databases are left out there, and what went through them is joined).
- Offer the next useful diagram in one line, reusing what was gathered: the next level down, a Dynamic diagram of a key feature, or a Deployment diagram.

## Notation rules (from c4model.com)

- The legend lists only what the diagram uses: the C4 colours that appear and the status colours in use. The script builds it that way; never add entries for elements that are not drawn.
- Every element shows a name, a bracketed type and a short description. Persons and software systems carry **no technology**; containers and components should.
- **Keep text short so elements are not cluttered.** Names: 2–5 words. Descriptions: one sentence, about 12 words / 90 characters at most, saying *what it is or does*, not how. Example: "Cliente interno que registra tickets de tipo de cambio." instead of a full paragraph. Relationship labels: a short verb phrase (2–8 words).
- The system in scope is blue (`system`); systems around it are `external_system`. Persons outside the organisation can be `external_person`.
- Level 1 has no boundary. Level 2 draws a **system boundary** around the containers of the system in scope; level 3 draws a **container boundary** around the components, nested inside the system boundary.
- Titles follow c4model.com: `System Context View: <system>`, `Container View: <system>`, `Component View: <system> - <container>`, `Dynamic View: <system> - <container>`, `Deployment View: <system> - <environment>`, `BIAN Impact View: <project>`. Put only the part after the colon in `title`; the script adds the view name.
- Dynamic diagrams number every relationship in order (`1: Submits credentials to`); the script adds the numbers from the order of `relationships`.
- Deployment diagrams nest deployment nodes (grey boxes labelled `[Deployment Node: technology]`, with `xN` for several instances) and place the container instances inside them.
- Name relationships with a verb phrase that ends in a preposition so it reads source → target: "Makes API requests to", "Reads from and writes to", "Sends e-mails to customers using".
- Relationships are one-directional, labelled with a verb phrase that reads source → target ("Sends e-mails to"), plus technology for levels 2–3.
- Keep each diagram readable: about 5–15 elements. If the user lists far more, suggest grouping or splitting.
- Keep external systems to about 6. Cross-cutting services (audit, monitoring, logging, authentication used by every request) add lines without explaining the solution: ask whether they matter to this view, and otherwise leave them out or mention them in the description. External systems reached only through another external (a clearing house that settles with the central bank) may stay: they are drawn in a second column next to their partner.
