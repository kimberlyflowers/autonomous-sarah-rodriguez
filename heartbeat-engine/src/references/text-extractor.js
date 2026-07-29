const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json', 'text/html']);

export async function extractReferenceText(file, { onLocalPdfError = null } = {}) {
  const buffer = Buffer.from(file.data || '', 'base64');
  if (TEXT_TYPES.has(file.type) || /\.(txt|md|csv|json|html)$/i.test(file.name || '')) {
    return { text: buffer.toString('utf8').slice(0, 120000), method: 'plain_text' };
  }
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(file.name || '')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return { text: String(result.value || '').slice(0, 120000), method: 'docx' };
  }
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) {
    let localText = '';
    try {
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const document = await getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false }).promise;
      const pages = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => item.str || '').join(' '));
      }
      localText = pages.join('\n\n').replace(/\u0000/g, '').trim();
    } catch (error) {
      onLocalPdfError?.(error);
    }
    if (localText.length >= 20) {
      return { text: localText.slice(0, 120000), method: 'pdf_text', truncated: localText.length > 120000 };
    }
    return extractScannedPdfWithOcr(buffer, file.name);
  }
  return null;
}

export async function extractScannedPdfWithOcr(buffer, name = 'document.pdf') {
  const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) throw new Error('Scanned PDF needs OCR, but OPENROUTER_API_KEY is not configured');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'https://app.bloomiestaffing.com',
      'X-Title': 'Bloomie Tenant Reference OCR',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `Extract the readable text from ${name}. Preserve headings, paragraphs, and wording. Return only extracted text, without commentary or summary.` },
          { type: 'file', file: { filename: name, file_data: `data:application/pdf;base64,${buffer.toString('base64')}` } },
        ],
      }],
      plugins: [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }],
      temperature: 0,
      max_tokens: 16000,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `PDF OCR returned ${response.status}`);
  const content = payload?.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map(part => typeof part === 'string' ? part : part?.text || '').join('\n')
    : String(content || '');
  if (text.trim().length < 20) throw new Error('PDF OCR returned no readable text');
  return { text: text.trim().slice(0, 120000), method: 'mistral_ocr', truncated: text.length > 120000 };
}
