---
name: professional-documents
description: "Create polished professional documents: SOPs, reports, proposals, contracts, one-pagers, handbooks, onboarding docs, policy documents, and business plans. Triggers for any document, report, proposal, handbook, SOP, policy, contract, one-pager, memo, letter, or formal business document request. Creates real .docx Word documents with professional formatting — tables, headers, footers, page numbers, branded styling. Every document should look like it came from a $300/hr consultant."
---

# Professional Documents — Real .docx Word Documents

## MANDATORY PRE-BUILD GATE — NO EXCEPTIONS

**You MUST collect all required information via bloom_clarify BEFORE creating any document. This is a hard rule with zero exceptions.**

### The 5 things you MUST know before writing:
1. **Document type** — What kind of document? (SOP, proposal, report, handbook, contract, one-pager, memo)
2. **Audience** — Who will read this? (internal team, clients, investors, regulators, partners)
3. **Purpose** — What should this document accomplish? (inform, persuade, standardize, train, sell)
4. **Key sections** — What must be covered? Any required sections or topics?
5. **Brand & formatting** — Should it follow the brand kit? Any specific formatting needs?

### Discovery Flow — call bloom_clarify for each missing piece (one at a time):

**Question 1 — What type of document?**
Options: "SOP / Standard Operating Procedure", "Proposal or pitch", "Report (quarterly, annual, project)", "Handbook or guide", "Contract or agreement", "One-pager or memo", "Other (I'll describe)"
Context: "What kind of document are you creating? This determines the structure, tone, and formatting."

**Question 2 — Who is this for?**
Options: "My internal team / employees", "Clients or customers", "Investors or leadership", "Partners or vendors", "Regulatory / compliance audience"

**Question 3 — What should this document do?**
Options: "Standardize a process (SOP)", "Persuade or sell (proposal)", "Report results or findings", "Train or onboard someone", "Communicate a policy", "Other (I'll describe)"

**Question 4 — Key content (FREE TEXT — do not use buttons):**
Ask: "What are the main topics or sections this document needs to cover? Include any specific data, names, dates, policies, or details that must appear. The more context you give me, the more polished the output."

### SKIP LOGIC:
- If the user already specified the document type → skip Question 1
- If audience is clear from context → skip Question 2
- NEVER ask more than one bloom_clarify at a time

### HARD STOP: Do NOT create the document until at least Questions 1, 2, and 4 are answered.

---

## Rule #1: CREATE .DOCX FILES, NOT MARKDOWN
When a user asks for a document, report, handbook, SOP, proposal, or any professional deliverable:
- Use the `dispatch_to_specialist` tool with taskType "coding" to generate a Node.js script that uses the `docx` npm library
- The script creates a real .docx Word document with proper formatting
- Save the resulting .docx file using create_artifact
- NEVER output a plain .md or .txt file for professional documents
- Reference the docx-documents skill for the full API reference

## Rule #2: BRAND KIT INTEGRATION
If a Brand Kit is in your system prompt, use those colors for headers, accent borders, and table headers. If no Brand Kit, use professional navy + gold or the client's industry-appropriate colors.

## Rule #3: FILL IN REAL DETAILS
Never leave [brackets] or placeholder text. Use what you know about the client. If you don't know something specific, use realistic content and mark it with a comment.

## Document Quality Standards
- Title/cover page with document name, date, author
- Table of contents for docs over 3 pages
- Headers and footers with page numbers
- Professional tables with branded header rows
- Proper bullet lists (never unicode bullets)
- Consistent heading hierarchy
- US Letter size (12240 x 15840 DXA)
- 1 inch margins
- Arial or brand fonts
- Active voice, specific numbers, consultant-grade writing
