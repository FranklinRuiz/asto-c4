# TOGAF with C4

TOGAF is a **method** for enterprise architecture (the Architecture Development Method, ADM), not a diagram
notation. Its own notation is ArchiMate; this skill does **not** draw ArchiMate, because it would compete with C4.
Instead, TOGAF frames the C4 diagrams and adds the deliverables an architecture board expects, in the companion
document written with `--doc`.

## Where each C4 view sits

TOGAF works in four architecture domains: Business, Data, Application and Technology (ADM phases B, C and D).

| C4 view | TOGAF place (written in the document) |
|---|---|
| System Context | Business and Application Architecture (phases B and C): the system in its environment |
| Container | Application and Data Architecture (phase C) |
| Component | Application Architecture (phase C), in detail |
| Dynamic | Application Architecture (phase C): behaviour of one use case |
| Deployment | Technology Architecture (phase D) |
| BIAN Impact View | Business Architecture (phase B): the capabilities the project touches |

## What to add to the spec

**Architecture principles** (`togaf.principles`), 3 to 5, in TOGAF's template:

- `name`: short and memorable ("Interoperabilidad por estándares").
- `statement`: the rule, in one sentence.
- `rationale`: why it matters for the business.
- `implications`: what it means for this solution, concretely.

Propose principles that come from what the user told you (regulation, availability, standards, security), not
generic ones. Ask the user to confirm or edit them.

**Building blocks** (`togaf.building_blocks`): for each main capability, the **Architecture Building Block**
(ABB, *what* is needed, technology-neutral: "Ejecución de pagos") and the **Solution Building Block** (SBB,
*how* it is built: "Servicio de pagos (Spring Boot)"), with the ids of the elements that realise it. Skip
purely technical elements unless they are a deliberate building block (an API gateway can be one).

**Architecture decisions** (`decisions`): TOGAF expects the decisions behind the architecture to be recorded.
Write them as ADRs (context, decision, consequences, status), 2 to 4 per diagram, only for choices that shaped
the design.

**Notes** (`notes`): gaps and decisions to follow up ("No hay un servicio de conciliación", "Definir RPO/RTO
del core").

## Rules

- Do not invent ADM artefacts the user did not ask for (no fake roadmaps, migration plans or stakeholder maps).
- Keep the diagram pure C4: TOGAF lives in the document.
- Combine freely with BIAN: BIAN Service Domains are a good source for the ABB names in a bank.
