# Industry standards outside banking

For these domains the skill only **detects and suggests** the standard: it uses its vocabulary in names,
descriptions and relationship technology, lists it in the companion document (`frameworks`), and adds `notes`.
There is no catalogue or validation as there is for BIAN, so stay with names you are sure of and ask the user to
confirm them.

| Domain (signals) | Standard | How to use it in C4 |
|---|---|---|
| Telecom: subscribers, lines, plans, network services, billing of usage | **TM Forum**: eTOM (business processes), SID (information model), ODA (component architecture), Open APIs | Name APIs by their TM Forum Open API when the user uses them, e.g. TMF620 Product Catalog Management, TMF622 Product Ordering, TMF629 Customer Management, TMF641 Service Ordering, TMF678 Customer Bill Management. `frameworks: ["tmforum"]`. |
| Insurance: policies, claims, premiums, brokers, underwriting | **ACORD** data standards | Mention ACORD messages or forms in relationship technology when used (e.g. "ACORD XML"). `frameworks: ["acord"]`. |
| Health: patients, appointments, clinical records, prescriptions, labs | **HL7 FHIR** | Use "FHIR R4/HTTPS" (or the version in use) as relationship technology and FHIR resource names in descriptions (Patient, Encounter, Observation, MedicationRequest). `frameworks: ["fhir"]`. |
| Card payments: card numbers stored, processed or transmitted | **PCI DSS** | Not a framework option: suggest marking the cardholder data environment in the Deployment diagram (a deployment node such as "CDE - PCI DSS zone") and add a `notes` entry. |

TOGAF applies to any domain: offer it whenever the user wants an enterprise-architecture deliverable
(see `togaf.md`).
