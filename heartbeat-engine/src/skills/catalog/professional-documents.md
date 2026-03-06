---
name: professional-documents
description: "Create polished professional documents: SOPs, reports, proposals, contracts, one-pagers, handbooks, onboarding docs, policy documents, and business plans. Triggers for any document, report, proposal, handbook, SOP, policy, contract, one-pager, memo, letter, or formal business document request. Creates real .docx Word documents with professional formatting — tables, headers, footers, page numbers, branded styling. Every document should look like it came from a $300/hr consultant."
---

# Professional Documents — Real .docx Word Documents

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
