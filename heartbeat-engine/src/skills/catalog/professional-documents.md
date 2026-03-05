---
name: professional-documents
description: "Create professional documents, reports, proposals, and letters that build trust. Use when the task involves reports, proposals, grant applications, quarterly reports, donor letters, SOPs, one-pagers, or any polished document. Also triggers for Word docs, PDFs, memos, and formatted deliverables."
---

# Professional Documents

## How to Think About This

A document is a trust signal. The formatting, structure, and voice tell the reader whether this organization is serious. Data without story is a spreadsheet. Story without data is a newsletter. Together, they're compelling.

Check memory and Company Skills for brand colors, logo, preferred sign-off, and formatting guidelines.

## Document Types

### Impact/Quarterly Report
Lead with human impact, not numbers. Structure: Cover → TOC → Executive Summary → Key Metrics → Program sections (each a mini-story with data) → Financial overview (transparent) → Looking ahead (specific, measurable) → Personal note.

### Proposal/Pitch
Frame as THEIR opportunity. "Here's what you gain" > "Here's what we need."

### Thank-You/Donor Letter
Be specific: "$500 funded [specific thing]" > "Your generous gift supports our mission."

### SOP
Write for someone doing this for the first time. Every step so clear they can't do it wrong.

## Voice

- Professional but human. Not robotic, not casual.
- Honest about challenges. Transparency > spin.
- Specific over generic. Always.
- Use client's sign-off from Company Skills. Default: "In service," or "With gratitude,"

## Technical: Creating .docx Files

Use the `create_artifact` tool to output documents. When creating formal Word documents, use the `docx` npm library with these patterns:

### Page Setup
```javascript
// Always US Letter, not A4 (docx-js defaults to A4)
properties: {
  page: {
    size: { width: 12240, height: 15840 }, // 8.5"x11" in DXA (1440 DXA = 1 inch)
    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } // 1" margins
  }
}
```

### Styles
```javascript
styles: {
  default: { document: { run: { font: "Arial", size: 22, color: "2D2D2D" } } },
  paragraphStyles: [
    { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 36, bold: true, font: "Arial", color: "1B3A5C" },
      paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
    { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 28, bold: true, font: "Arial", color: "1B3A5C" },
      paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 } },
  ]
}
```

### Tables — Critical Rules
```javascript
// ALWAYS set both table width AND individual cell widths
// ALWAYS use WidthType.DXA, never PERCENTAGE (breaks Google Docs)
// ALWAYS use ShadingType.CLEAR, never SOLID (causes black backgrounds)
new Table({
  width: { size: 9360, type: WidthType.DXA }, // Full content width
  columnWidths: [4680, 2340, 2340], // Must sum to table width
  rows: [
    new TableRow({ children: [
      new TableCell({
        width: { size: 4680, type: WidthType.DXA }, // Match columnWidth
        borders: { top: border, bottom: border, left: border, right: border },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        shading: { fill: "1B3A5C", type: ShadingType.CLEAR }, // Header row
        children: [new Paragraph({ children: [new TextRun({ text: "Header", bold: true, color: "FFFFFF" })] })]
      })
    ]})
  ]
})
```

### Lists — NEVER use unicode bullets
```javascript
// ❌ WRONG: new Paragraph({ children: [new TextRun("• Item")] })
// ✅ CORRECT: Use numbering config
numbering: { config: [{
  reference: "bullets",
  levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
}]}
// Then: new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [...] })
```

### Other Critical Rules
- **Never use `\n`** — use separate Paragraph elements
- **PageBreak must be inside a Paragraph** — `new Paragraph({ children: [new PageBreak()] })`
- **ImageRun requires `type`** — always specify: `type: "png"`
- **TOC requires HeadingLevel** — headings must use `heading: HeadingLevel.HEADING_1`, no custom styles
- **Include `outlineLevel`** in heading styles — required for TOC (0 for H1, 1 for H2)
- **Never use tables as dividers** — cells have minimum height. Use paragraph borders instead.

### Formatting Standards
- Super light grey for backgrounds — never cream or eggshell
- Never pure black text: use #2D2D2D
- Alternating row shading on tables (very light background)
- Header row: dark background, white text
- Page numbers in footer, organization name in header
- Cover page: org name (large), title, date, accent line, "Prepared by"

## Output

Always deliver as a formatted file via `create_artifact`, not just markdown. The formatting IS the deliverable.
