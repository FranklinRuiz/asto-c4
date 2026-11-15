# BIAN with C4

BIAN (Banking Industry Architecture Network) splits banking into **Service Domains**: each one is a single,
non-overlapping business capability (Payment Execution, Current Account, Fraud Evaluation…). They are grouped
into **Business Domains** (Payments, Loans and Deposits…), and those into **Business Areas** (Operations and
Execution, Sales and Service…).

The skill uses the **BIAN Service Landscape v12.0**, stored in `assets/bian-service-landscape-v12.json`
(source: https://bian.org/servicelandscape-12-0-0/views/view_51891.html). The script rejects any name that is not
in that file and suggests the closest ones, so **never invent a Service Domain**: pick one from the file.

## How it shows in the diagram

- `"bian": "<Service Domain>"` on an element places it, on a second page of the `.drawio` (the BIAN Impact View),
  inside its Service Domain, Business Domain and Business Area, looked up from the file. Technical elements without
  a Service Domain (gateways, databases, queues) are left out of that page, and what went through them is joined.
- The C4 page stays clean: no BIAN tags or groups. Only with `"bian_view": false` (no BIAN page) the Service Domain
  is added at the end of the element's `c4Description` (`(BIAN: Payment Execution)`), and `"group_by": "bian"` draws a library Group (dotted outline) for each BIAN Business Domain that holds **two or more**
  elements inside the boundary (a one-element group repeats what its tag already says). If other elements sit
  between them, the script skips the group and says so: the tags still carry the information.
- With `--doc`, the companion document lists every element with its Service Domain, Business Domain and
  Business Area.

## Rules

- **One Service Domain per element**: the main capability it owns. If an element covers several, tag the main
  one and write the others in `notes` (it is a hint that the element might be split).
- Tag containers (level 2) and components (level 3) of the system in scope. **Do not tag** people, external
  systems, or purely technical elements (API gateways, databases, buses, caches): they are not business
  capabilities.
- On a System Context diagram, BIAN usually adds little; prefer it from level 2 down.
- Propose the tags yourself from the list below and the file, then let the user confirm.

## Common mappings (all names are in v12.0)

| What the element does | Service Domain | Business Domain |
|---|---|---|
| Mobile app, web banking, merchant portal | eBranch Operations | Channel Specific |
| Call center | Contact Center Operations | Channel Specific |
| ATMs | ATM Network Operations | Channel Specific |
| Customer sign-in, credentials, MFA | Party Authentication | Cross Channel |
| Approving a transaction against limits and permissions | Transaction Authorization | Cross Channel |
| Customer / party master data, KYC data | Party Reference Data Directory | Party |
| Customer relationship, segments | Customer Relationship Management | Customer Management |
| Customer agreements and consents | Customer Agreement | Customer Management |
| Customer access rights to products | Customer Access Entitlement | Customer Management |
| Capturing a customer's payment request | Payment Initiation | Servicing |
| Validating and routing a payment order | Payment Order | Payments |
| Executing a payment (debit, credit, interbank) | Payment Execution | Payments |
| Connection to a payment rail or clearing house | Payment Rail Operations | Payments |
| Gateway to external financial networks | Financial Gateway | Payments |
| Current or wallet account and its balance | Current Account | Loans and Deposits |
| Savings account | Savings Account | Loans and Deposits |
| Term deposits | Term Deposit | Loans and Deposits |
| Consumer, mortgage or generic loans | Consumer Loan / Mortgage Loan / Loan | Loans and Deposits |
| Standing orders | Standing Order | Loans and Deposits |
| Ledger of account positions | Position Keeping | Account Management |
| Consolidated customer position | Customer Position | Account Management |
| Reconciliation | Account Reconciliation | Account Management |
| Real-time fraud scoring of a transaction | Fraud Evaluation | Account Management |
| Investigating suspected fraud | Fraud Diagnosis | Account Management |
| Resolving confirmed fraud cases | Fraud Resolution | Regulations and Compliance |
| Fraud models | Fraud Model | Models |
| Credit card account | Credit Card | Cards |
| Card authorization | Card Authorization | Cards |
| Card transaction capture | Card Transaction Capture | Cards |
| Merchant acquiring, QR merchant acceptance | Merchant Acquiring Facility | Cards |
| Merchant relationship | Merchant Relations | Cards |
| Card clearing / settlement | Card Clearing / Card Financial Settlement | Payments |
| Card e-commerce gateway | Card eCommerce Gateway | Payments |
| Credit scoring of customers | Customer Credit Rating | Customer Management |
| Credit decision for a product | Underwriting | Sales |
| Product offers | Customer Offer | Sales |
| Product catalogue | Product Directory | Product Management |
| Billing customers for fees | Customer Billing | Operational Services |
| Collections of overdue debt | Collections / Delinquent Account Handling | Collateral Administration / Operational Services |
| Customer complaints and cases | Customer Case Management / Servicing Issue | Servicing |
| Notifications and letters to customers | Correspondence | Document Management and Archive |
| Documents and archive | Document Services / Archive Services | Document Management and Archive |
| Regulatory reports (e.g. suspicious operations to the FIU) | Regulatory Reporting | Regulations and Compliance |
| Compliance checks (AML rules, sanctions) | Regulatory Compliance | Regulations and Compliance |
| General ledger | Financial Accounting | Regulations and Compliance |
| Treasury and liquidity | Corporate Treasury / Asset And Liability Management | Bank Portfolio and Treasury |
