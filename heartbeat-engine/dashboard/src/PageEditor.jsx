import { useRef, useState, useEffect } from 'react';
import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import GjsEditor from '@grapesjs/react';
import gjsBlocksBasic from 'grapesjs-blocks-basic';
import gjsPresetWebpage from 'grapesjs-preset-webpage';
import gjsPluginForms from 'grapesjs-plugin-forms';

export default function PageEditor({ editor: editorData, onClose, onSaved }) {
  const gjsRef  = useRef(null);
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [aiAssets, setAiAssets] = useState([]);
  const [assetSearch, setAssetSearch] = useState('');

  // Load AI image library on mount
  useEffect(() => {
    fetch('/api/files/images?limit=200')
      .then(r => r.json())
      .then(d => { if (d.assets) setAiAssets(d.assets); })
      .catch(() => {});
  }, []);

  // Refresh search results
  const refreshAssets = (search = '') => {
    const url = search ? `/api/files/images?limit=200&search=${encodeURIComponent(search)}` : '/api/files/images?limit=200';
    fetch(url).then(r => r.json()).then(d => {
      if (d.assets && gjsRef.current) {
        gjsRef.current.AssetManager.clear();
        gjsRef.current.AssetManager.add(d.assets.map(a => ({ src: a.src, name: a.name, category: a.category })));
      }
    }).catch(() => {});
  };

  const onEditor = (editor) => {
    gjsRef.current = editor;

    // ── Load existing HTML ───────────────────────────────────────────
    if (editorData.content) {
      editor.setComponents(editorData.content);
    }

    // ── Seed Asset Manager with AI image library ─────────────────────
    if (aiAssets.length) {
      editor.AssetManager.add(aiAssets.map(a => ({ src: a.src, name: a.name, category: 'AI Generated' })));
    }

    // ── Refresh library when asset manager opens ──────────────────────
    editor.on('asset:open', () => {
      fetch('/api/files/images?limit=200')
        .then(r => r.json())
        .then(d => {
          if (d.assets) {
            editor.AssetManager.clear();
            editor.AssetManager.add(d.assets.map(a => ({ src: a.src, name: a.name, category: 'AI Generated' })));
          }
        })
        .catch(() => {});
    });

    // ── Append href/target traits to button type after editor loads ────
    // grapesjs-plugin-forms already owns 'button' type with Text+Type.
    // addType() is ignored because forms plugin registers first.
    // Correct approach: get the existing type and push new traits onto it.
    editor.on('load', () => {
      try {
        const btnType = editor.Components.getType('button');
        if (btnType) {
          const proto = btnType.model.prototype;
          const existing = (proto.defaults && proto.defaults.traits) || [];
          const alreadyHasHref = existing.some(t => (t.name || t) === 'data-href');
          if (!alreadyHasHref) {
            proto.defaults = {
              ...proto.defaults,
              traits: [
                ...existing,
                {
                  type: 'text',
                  name: 'data-href',
                  label: 'Link URL',
                  placeholder: 'https://example.com or #section',
                },
                {
                  type: 'select',
                  name: 'data-target',
                  label: 'Open in',
                  options: [
                    { id: '',       label: 'Same window' },
                    { id: '_blank', label: 'New tab' },
                  ],
                },
              ],
            };
          }
        }
      } catch(e) { console.warn('button trait extend failed:', e); }
    });

    // ── On selection: auto-select parent <a> if clicked child; switch panel ─
    editor.on('component:selected', (component) => {
      // Bubble up to parent <a> if clicked a child element inside one
      try {
        const tag = (component.get('tagName') || '').toLowerCase();
        if (['span', 'i', 'strong', 'em'].includes(tag)) {
          const parent = component.parent();
          if (parent && (parent.get('tagName') || '').toLowerCase() === 'a') {
            editor.select(parent);
            return;
          }
        }
      } catch (e) { /* ignore */ }

      // Switch to Traits (gear) for <a> and <button>, Styles for everything else
      try {
        const tag = (component.get('tagName') || '').toLowerCase();
        const showTraits = tag === 'a' || tag === 'button' || component.get('type') === 'link';
        const panelBtn = showTraits
          ? editor.Panels.getButton('views', 'open-tm')
          : editor.Panels.getButton('views', 'open-sm');
        if (panelBtn) panelBtn.set('active', true);
      } catch (e) { /* ignore */ }
    });
  };

  const handleSave = async () => {
    const editor = gjsRef.current;
    if (!editor) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const html     = editor.getHtml();
      const css      = editor.getCss();
      const fullHtml = buildFullHtml(html, css, editorData.name);

      const r = await fetch(`/api/files/artifacts/${editorData.fileId}/apply-raw`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: fullHtml }),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Server ${r.status}: ${txt.substring(0, 120)}`);
      }
      setSaveMsg({ type: 'ok', text: 'Saved' });
      if (onSaved) onSaved(editorData.fileId, fullHtml);
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      console.error('PageEditor save:', err);
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
      {/* ── Toolbar ── */}
      <div style={{
        height: 52, minHeight: 52, flexShrink: 0,
        background: '#16213e',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 14px', gap: 12,
      }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {saveMsg && (
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: saveMsg.type === 'ok' ? '#4ade80' : '#f87171',
            }}>
              {saveMsg.type === 'ok' ? '✓ ' : '✕ '}{saveMsg.text}
            </span>
          )}
          <button onClick={handleSave} disabled={saving} style={{
            height: 34, padding: '0 20px', borderRadius: 8, border: 'none',
            background: saving ? '#555' : 'linear-gradient(135deg,#F4A261,#E76F8B)',
            color: '#fff', fontWeight: 700, fontSize: 13,
            cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit', letterSpacing: 0.3,
          }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {/* ── GrapesJS Default UI ── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <GjsEditor
          grapesjs={grapesjs}
          onEditor={onEditor}
          options={{
            height: '100%',
            storageManager: false,
            undoManager: { trackSelection: false },
            assetManager: {
              // Upload new images directly to BLOOM
              upload: '/api/files/images/upload',
              uploadName: 'file',
              // Pre-populate with AI library (refreshed on open via event above)
              assets: aiAssets.map(a => ({ src: a.src, name: a.name, category: 'AI Generated' })),
              // Show asset categories
              showUrlInput: true,
            },
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
  <script>
    // Convert data-href buttons to real navigating buttons
    document.querySelectorAll('button[data-href]').forEach(btn => {
      const url = btn.getAttribute('data-href');
      const target = btn.getAttribute('data-target') || '_self';
      if (url) btn.addEventListener('click', () => window.open(url, target));
    });
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
