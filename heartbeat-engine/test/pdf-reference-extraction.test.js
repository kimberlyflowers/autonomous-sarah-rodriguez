import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractReferenceText } from '../src/references/text-extractor.js';
import fs from 'node:fs';

test('text PDFs are extracted locally and made ready for Bloomie references', async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('My distinctive writing style uses clear, warm, direct sentences for every reader.', {
    x: 48,
    y: 720,
    size: 14,
    font,
  });
  const bytes = await pdf.save({ useObjectStreams: false });
  const result = await extractReferenceText({
    name: 'old-book.pdf',
    type: 'application/pdf',
    data: Buffer.from(bytes).toString('base64'),
  });
  assert.equal(result.method, 'pdf_text');
  assert.match(result.text, /distinctive writing style/);
});

test('reference pipeline exposes PDF status and reprocessing for older uploads', () => {
  const api = fs.readFileSync(new URL('../src/api/references.js', import.meta.url), 'utf8');
  const extractor = fs.readFileSync(new URL('../src/references/text-extractor.js', import.meta.url), 'utf8');
  const ui = fs.readFileSync(new URL('../dashboard/src/components/ReferenceLibrary.jsx', import.meta.url), 'utf8');
  assert.match(api, /extraction_status: extraction\?\.text \? 'ready'/);
  assert.match(api, /router\.post\('\/:id\/reprocess'/);
  assert.match(extractor, /engine: 'mistral-ocr'/);
  assert.match(ui, /Process PDF/);
  assert.match(ui, /Text ready/);
});
