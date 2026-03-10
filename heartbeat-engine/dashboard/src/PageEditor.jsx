import { useState, useEffect, useRef, useCallback } from 'react';
import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import gjsBlocksBasic from 'grapesjs-blocks-basic';
import gjsPresetWebpage from 'grapesjs-preset-webpage';
import gjsPluginForms from 'grapesjs-plugin-forms';

export default function PageEditor({ editor: editorData, onClose, onSaved }) {
  // editorData = { fileId, name, content }
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [deviceMode, setDeviceMode] = useState('desktop');

  // Boot GrapesJS once the container div is mounted
  useEffect(() => {
    if (!containerRef.current) return;

    const gjs = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      width: '100%',
      storageManager: false, // we handle saves ourselves
      undoManager: { trackSelection: false },
      selectorManager: { componentFirst: true },
      components: editorData.content || '',
      style: '',
      plugins: [gjsPresetWebpage, gjsBlocksBasic, gjsPluginForms],
      pluginsOpts: {
        [gjsPresetWebpage]: {
          navbarOpts: false,
          countdownOpts: false,
        },
        [gjsBlocksBasic]: {
          flexGrid: true,
        },
        [gjsPluginForms]: {},
      },
      canvas: {
        styles: [
          'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@400;500;600;700&family=Playfair+Display:wght@400;700&family=Montserrat:wght@400;600;700&display=swap',
        ],
      },
      deviceManager: {
        devices: [
          { name: 'Desktop', width: '' },
          { name: 'Tablet', width: '768px', widthMedia: '992px' },
          { name: 'Mobile', width: '375px', widthMedia: '480px' },
        ],
      },
    });

    // Clean up default panels (we render our own toolbar above)
    gjs.Panels.removePanel('devices-c');
    gjs.Panels.removePanel('options');
    gjs.Panels.removePanel('views');

    editorRef.current = gjs;

    return () => {
      gjs.destroy();
      editorRef.current = null;
    };
  }, []); // only once

  // Device switching
  const switchDevice = useCallback((mode) => {
    const gjs = editorRef.current;
    if (!gjs) return;
    const map = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };
    gjs.setDevice(map[mode]);
    setDeviceMode(mode);
  }, []);

  // Save — collect HTML + CSS from GrapesJS, post to server
  const handleSave = useCallback(async () => {
    const gjs = editorRef.current;
    if (!gjs) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const html = gjs.getHtml();
      const css = gjs.getCss();
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
  }, [editorData]);

  // Undo / Redo
  const undo = () => editorRef.current?.UndoManager.undo();
  const redo = () => editorRef.current?.UndoManager.redo();

  // Preview toggle
  const [previewing, setPreviewing] = useState(false);
  const togglePreview = () => {
    const gjs = editorRef.current;
    if (!gjs) return;
    if (previewing) {
      gjs.stopCommand('preview');
    } else {
      gjs.runCommand('preview');
    }
    setPreviewing(p => !p);
  };

  return (
    <div style={styles.overlay}>
      {/* ── Top Toolbar ── */}
      <div style={styles.toolbar}>
        {/* Left: title + close */}
        <div style={styles.toolbarLeft}>
          <button onClick={onClose} style={styles.closeBtn} title="Close editor">
            ←
          </button>
          <span style={styles.title} title={editorData.name}>
            {editorData.name}
          </span>
        </div>

        {/* Center: device switcher */}
        <div style={styles.deviceGroup}>
          {[
            { id: 'desktop', icon: '🖥', label: 'Desktop' },
            { id: 'tablet',  icon: '📱', label: 'Tablet'  },
            { id: 'mobile',  icon: '📱', label: 'Mobile'  },
          ].map(d => (
            <button
              key={d.id}
              onClick={() => switchDevice(d.id)}
              title={d.label}
              style={{
                ...styles.deviceBtn,
                background: deviceMode === d.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                borderColor: deviceMode === d.id ? 'rgba(255,255,255,0.4)' : 'transparent',
              }}
            >
              {d.id === 'desktop' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              ) : d.id === 'tablet' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                </svg>
              ) : (
                <svg width="14" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                </svg>
              )}
            </button>
          ))}
        </div>

        {/* Right: undo/redo, preview, save */}
        <div style={styles.toolbarRight}>
          <button onClick={undo} style={styles.iconBtn} title="Undo">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 7v6h6"/><path d="M3 13C5.5 7 12 5 17 8s7 9 4 15"/>
            </svg>
          </button>
          <button onClick={redo} style={styles.iconBtn} title="Redo">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{transform:'scaleX(-1)'}}>
              <path d="M3 7v6h6"/><path d="M3 13C5.5 7 12 5 17 8s7 9 4 15"/>
            </svg>
          </button>

          <div style={styles.divider}/>

          <button
            onClick={togglePreview}
            style={{
              ...styles.iconBtn,
              background: previewing ? 'rgba(255,255,255,0.12)' : 'transparent',
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 12,
              fontWeight: 600,
              gap: 5,
              display: 'flex',
              alignItems: 'center',
            }}
            title={previewing ? 'Exit Preview' : 'Preview'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            {previewing ? 'Exit' : 'Preview'}
          </button>

          <div style={styles.divider}/>

          {saveMsg && (
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: saveMsg.type === 'ok' ? '#4ade80' : '#f87171',
              whiteSpace: 'nowrap',
              marginRight: 6,
            }}>
              {saveMsg.type === 'ok' ? '✓ ' : '✕ '}{saveMsg.text}
            </span>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              ...styles.saveBtn,
              opacity: saving ? 0.65 : 1,
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── GrapesJS Canvas Area ── */}
      <div style={styles.editorArea}>
        <div ref={containerRef} style={styles.gjsContainer} />
      </div>
    </div>
  );
}

// ── Build a complete standalone HTML document ──────────────────────────────
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
    img { max-width: 100%; height: auto; }
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    background: '#1a1a2e',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  toolbar: {
    height: 52,
    minHeight: 52,
    background: '#16213e',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    gap: 12,
    flexShrink: 0,
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    flex: '0 0 auto',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontFamily: 'inherit',
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e2e8f0',
    maxWidth: 200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  deviceGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: '3px 4px',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  deviceBtn: {
    width: 32,
    height: 28,
    borderRadius: 6,
    border: '1px solid transparent',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flex: '0 0 auto',
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
  },
  divider: {
    width: 1,
    height: 20,
    background: 'rgba(255,255,255,0.1)',
    margin: '0 4px',
  },
  saveBtn: {
    height: 32,
    padding: '0 18px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #F4A261, #E76F8B)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: 0.3,
    fontFamily: 'inherit',
  },
  editorArea: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
  },
  gjsContainer: {
    flex: 1,
    height: '100%',
    overflow: 'hidden',
  },
};
