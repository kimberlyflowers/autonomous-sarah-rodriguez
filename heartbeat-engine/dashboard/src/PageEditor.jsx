import { useRef } from 'react';
import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import GjsEditor from '@grapesjs/react';
import gjsBlocksBasic from 'grapesjs-blocks-basic';
import gjsPresetWebpage from 'grapesjs-preset-webpage';
import gjsPluginForms from 'grapesjs-plugin-forms';
import { useState } from 'react';

export default function PageEditor({ editor: editorData, onClose, onSaved }) {
  // editorData = { fileId, name, content }
  const gjsRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  // Called once GrapesJS is fully initialised
  const onEditor = (editor) => {
    gjsRef.current = editor;

    // Load the existing HTML into the canvas
    if (editorData.content) {
      editor.setComponents(editorData.content);
    }
  };

  const handleSave = async () => {
    const editor = gjsRef.current;
    if (!editor) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const html = editor.getHtml();
      const css  = editor.getCss();
      const fullHtml = buildFullHtml(html, css, editorData.name);

      const r = await fetch(`/api/files/artifacts/${editorData.fileId}/apply-raw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fullHtml }),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Server ${r.status}: ${txt.substring(0, 120)}`);
      }
      setSaveMsg({ type: 'ok', text: 'Saved' });
      if (onSaved) onSaved(editorData.fileId, fullHtml);
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      console.error('PageEditor save error:', err);
      setSaveMsg({ type: 'err', text: err.message || 'Save failed' });
      setTimeout(() => setSaveMsg(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      background: '#1a1a2e', fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* ── Top Toolbar ── */}
      <div style={{
        height: 52, minHeight: 52, flexShrink: 0,
        background: '#16213e',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 14px', gap: 12,
      }}>
        {/* Left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.06)',
            color: '#e2e8f0', cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'inherit',
          }}>←</button>
          <span style={{
            fontSize: 13, fontWeight: 600, color: '#e2e8f0',
            maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{editorData.name}</span>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {saveMsg && (
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: saveMsg.type === 'ok' ? '#4ade80' : '#f87171',
            }}>
              {saveMsg.type === 'ok' ? '✓ ' : '✕ '}{saveMsg.text}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              height: 34, padding: '0 20px', borderRadius: 8, border: 'none',
              background: saving ? '#555' : 'linear-gradient(135deg,#F4A261,#E76F8B)',
              color: '#fff', fontWeight: 700, fontSize: 13,
              cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit', letterSpacing: 0.3,
            }}
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {/* ── GrapesJS (Default UI mode — keeps all built-in panels) ── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <GjsEditor
          grapesjs={grapesjs}
          onEditor={onEditor}
          options={{
            height: '100%',
            storageManager: false,
            undoManager: { trackSelection: false },
            plugins: [gjsPresetWebpage, gjsBlocksBasic, gjsPluginForms],
            pluginsOpts: {
              [gjsPresetWebpage]: { navbarOpts: false, countdownOpts: false },
              [gjsBlocksBasic]:   { flexGrid: true },
              [gjsPluginForms]:   {},
            },
            canvas: {
              styles: [
                'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@400;500;600;700&family=Montserrat:wght@400;600;700&display=swap',
              ],
            },
            deviceManager: {
              devices: [
                { name: 'Desktop', width: '' },
                { name: 'Tablet',  width: '768px',  widthMedia: '992px' },
                { name: 'Mobile',  width: '375px',  widthMedia: '480px' },
              ],
            },
          }}
        />
      </div>
    </div>
  );
}

// ── Assemble full HTML document ───────────────────────────────────────────
function buildFullHtml(body, css, title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escapeHtml(title || 'Page')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@400;500;600;700&family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
    img  { max-width: 100%; height: auto; }
    ${css || ''}
  </style>
</head>
<body>
  ${body || ''}
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
