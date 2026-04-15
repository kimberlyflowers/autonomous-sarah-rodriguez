import { useRef, useState, useEffect } from 'react';
import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import GjsEditor from '@grapesjs/react';
import gjsBlocksBasic from 'grapesjs-blocks-basic';
import gjsPresetWebpage from 'grapesjs-preset-webpage';
import gjsPluginForms from 'grapesjs-plugin-forms';

// ─── CSS injected into canvas iframe so selected/hovered elements are obvious ─
const CANVAS_HIGHLIGHT_CSS = `
  .gjs-hovered {
    outline: 2px dashed rgba(244,162,97,0.7) !important;
    outline-offset: 1px !important;
  }
  .gjs-selected {
    outline: 2px solid #F4A261 !important;
    outline-offset: 1px !important;
  }
`;

export default function PageEditor({ editor: editorData, onClose, onSaved }) {
  const gjsRef    = useRef(null);
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [aiAssets, setAiAssets] = useState([]);

  useEffect(() => {
    fetch('/api/files/images?limit=200')
      .then(r => r.json())
      .then(d => { if (d.assets) setAiAssets(d.assets); })
      .catch(() => {});
  }, []);

  const onEditor = (editor) => {
    gjsRef.current = editor;

    if (editorData.content) {
      editor.setComponents(editorData.content);
    }

    if (aiAssets.length) {
      editor.AssetManager.add(
        aiAssets.map(a => ({ src: a.src, name: a.name, category: 'AI Generated' }))
      );
    }

    editor.on('asset:open', () => {
      fetch('/api/files/images?limit=200')
        .then(r => r.json())
        .then(d => {
          if (d.assets) {
            editor.AssetManager.clear();
            editor.AssetManager.add(
              d.assets.map(a => ({ src: a.src, name: a.name, category: 'AI Generated' }))
            );
          }
        })
        .catch(() => {});
    });

    editor.on('load', () => {
      // FIX 1: Inject highlight CSS into canvas iframe
      try {
        const doc = editor.Canvas.getDocument();
        if (doc) {
          const s = doc.createElement('style');
          s.textContent = CANVAS_HIGHLIGHT_CSS;
          doc.head.appendChild(s);
        }
      } catch (e) { console.warn('canvas highlight inject:', e); }

      // FIX 2: Button href/target traits
      try {
        const btnType = editor.Components.getType('button');
        if (btnType) {
          const proto    = btnType.model.prototype;
          const existing = (proto.defaults && proto.defaults.traits) || [];
          if (!existing.some(t => (t.name || t) === 'data-href')) {
            proto.defaults = {
              ...proto.defaults,
              traits: [
                ...existing,
                { type: 'text',   name: 'data-href',   label: 'Link URL', placeholder: 'https://...' },
                { type: 'select', name: 'data-target', label: 'Open in',
                  options: [{ id: '', label: 'Same window' }, { id: '_blank', label: 'New tab' }] },
              ],
            };
          }
        }
      } catch (e) { console.warn('button trait extend:', e); }

      // ── BLOOM Custom Blocks ────────────────────────────────────────────
      const bm = editor.BlockManager;

      bm.add('bloom-lead-form', {
        label: 'Lead Form',
        category: 'BLOOM',
        attributes: { class: 'fa fa-wpforms' },
        content: `<section style="background:#2563eb;color:#fff;padding:60px 20px;text-align:center">
  <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:12px">Get In Touch</h2>
  <div id="bloom-sub-count-contact" style="font-size:.85rem;opacity:.7;margin-bottom:20px"></div>
  <form id="bloom-form-contact" onsubmit="bloomSubmitForm(event,'ORG_SLUG','contact')" style="max-width:480px;margin:0 auto;display:flex;flex-direction:column;gap:12px">
    <input type="text" name="name" placeholder="Your Name" required style="padding:12px;border:none;border-radius:8px;font-size:1rem">
    <input type="email" name="email" placeholder="Email Address" required style="padding:12px;border:none;border-radius:8px;font-size:1rem">
    <input type="tel" name="phone" placeholder="Phone Number" style="padding:12px;border:none;border-radius:8px;font-size:1rem">
    <textarea name="message" placeholder="How can we help you?" style="padding:12px;border:none;border-radius:8px;font-size:1rem;min-height:80px"></textarea>
    <button type="submit" style="padding:14px;background:#fff;color:#2563eb;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer">Send Message</button>
    <p id="bloom-form-msg-contact" style="font-size:.9rem;min-height:20px;margin-top:4px"></p>
  </form>
  <script>if(!window.bloomSubmitForm){async function bloomSubmitForm(e,slug,fn){e.preventDefault();var m=document.getElementById('bloom-form-msg-'+fn);var f=e.target;if(m)m.textContent='Sending...';try{var d=Object.fromEntries(new FormData(f).entries());d.orgSlug=slug;d.formName=fn;var r=await fetch('/api/forms/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});var j=await r.json();if(j.success){if(m){m.textContent=j.message||'Thank you!';m.style.color='#4ade80';}f.reset();}else{if(m){m.textContent=j.error||'Error';m.style.color='#f87171';}}}catch(err){if(m){m.textContent='Network error.';m.style.color='#f87171';}}};window.bloomSubmitForm=bloomSubmitForm;}</script>
</section>`,
      });

      bm.add('bloom-registration-form', {
        label: 'Registration Form',
        category: 'BLOOM',
        attributes: { class: 'fa fa-ticket' },
        content: `<section style="background:#7c3aed;color:#fff;padding:60px 20px;text-align:center">
  <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:12px">Register Now</h2>
  <form id="bloom-form-registration" onsubmit="bloomSubmitForm(event,'ORG_SLUG','registration')" style="max-width:480px;margin:0 auto;display:flex;flex-direction:column;gap:12px">
    <input type="text" name="name" placeholder="Full Name" required style="padding:12px;border:none;border-radius:8px;font-size:1rem">
    <input type="email" name="email" placeholder="Email Address" required style="padding:12px;border:none;border-radius:8px;font-size:1rem">
    <input type="tel" name="phone" placeholder="Phone Number" style="padding:12px;border:none;border-radius:8px;font-size:1rem">
    <select name="ticketType" style="padding:12px;border:none;border-radius:8px;font-size:1rem;background:#fff;color:#333">
      <option value="">Select Ticket Type</option>
      <option value="general">General Admission</option>
      <option value="vip">VIP</option>
      <option value="student">Student</option>
    </select>
    <button type="submit" style="padding:14px;background:#fff;color:#7c3aed;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer">Register</button>
    <p id="bloom-form-msg-registration" style="font-size:.9rem;min-height:20px;margin-top:4px"></p>
  </form>
  <script>if(!window.bloomSubmitForm){async function bloomSubmitForm(e,slug,fn){e.preventDefault();var m=document.getElementById('bloom-form-msg-'+fn);var f=e.target;if(m)m.textContent='Sending...';try{var d=Object.fromEntries(new FormData(f).entries());d.orgSlug=slug;d.formName=fn;var r=await fetch('/api/forms/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});var j=await r.json();if(j.success){if(m){m.textContent=j.message||'Thank you!';m.style.color='#4ade80';}f.reset();}else{if(m){m.textContent=j.error||'Error';m.style.color='#f87171';}}}catch(err){if(m){m.textContent='Network error.';m.style.color='#f87171';}}};window.bloomSubmitForm=bloomSubmitForm;}</script>
</section>`,
      });

      bm.add('bloom-pay-button', {
        label: 'Pay Button',
        category: 'BLOOM',
        attributes: { class: 'fa fa-credit-card' },
        content: `<div style="text-align:center;padding:20px">
  <button id="bloom-pay-btn" onclick="bloomCheckout('ORG_SLUG','Product Name',97,'usd','bloom-pay-btn')" style="padding:14px 32px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:1.1rem;font-weight:700;cursor:pointer">Pay Now — $97</button>
  <script>if(!window.bloomCheckout){async function bloomCheckout(org,prod,amt,cur,bid){var b=document.getElementById(bid);if(b){b.disabled=true;b.textContent='Redirecting...';}try{var r=await fetch('/api/payments/create-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orgSlug:org,productName:prod,amount:amt,currency:cur,quantity:1})});var j=await r.json();if(j.success&&j.checkoutUrl){window.location.href=j.checkoutUrl;}else{alert(j.error||'Payment failed.');if(b){b.disabled=false;b.textContent='Pay Now';}}}catch(err){alert('Network error.');if(b){b.disabled=false;b.textContent='Pay Now';}}};window.bloomCheckout=bloomCheckout;}</script>
</div>`,
      });

      bm.add('bloom-pricing-table', {
        label: 'Pricing Table',
        category: 'BLOOM',
        attributes: { class: 'fa fa-table' },
        content: `<section style="padding:60px 20px">
  <h2 style="text-align:center;font-size:1.8rem;font-weight:800;margin-bottom:40px">Choose Your Plan</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px;max-width:960px;margin:0 auto">
    <div style="padding:32px 24px;border:1px solid #e5e7eb;border-radius:16px;text-align:center;background:#fff">
      <h3 style="font-weight:700;margin-bottom:8px">Basic</h3>
      <div style="font-size:2.5rem;font-weight:800;color:#2563eb;margin-bottom:20px">Free</div>
      <ul style="list-style:none;padding:0;text-align:left;margin-bottom:28px"><li style="padding:6px 0;border-bottom:1px solid #f0f0f0">Feature one</li><li style="padding:6px 0;border-bottom:1px solid #f0f0f0">Feature two</li></ul>
      <a href="#contact" style="display:block;padding:12px;background:#f3f4f6;color:#333;border-radius:8px;text-decoration:none;font-weight:700">Get Started</a>
    </div>
    <div style="padding:32px 24px;border:2px solid #2563eb;border-radius:16px;text-align:center;background:#fff;position:relative">
      <div style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:#2563eb;color:#fff;padding:4px 16px;border-radius:20px;font-size:.8rem;font-weight:700">Most Popular</div>
      <h3 style="font-weight:700;margin-bottom:8px">Standard</h3>
      <div style="font-size:2.5rem;font-weight:800;color:#2563eb;margin-bottom:20px">$97</div>
      <ul style="list-style:none;padding:0;text-align:left;margin-bottom:28px"><li style="padding:6px 0;border-bottom:1px solid #f0f0f0">Everything in Basic</li><li style="padding:6px 0;border-bottom:1px solid #f0f0f0">Feature three</li><li style="padding:6px 0;border-bottom:1px solid #f0f0f0">Feature four</li></ul>
      <button onclick="bloomCheckout('ORG_SLUG','Standard',97,'usd','bloom-pay-std')" id="bloom-pay-std" style="width:100%;padding:12px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer">Enroll Now — $97</button>
    </div>
    <div style="padding:32px 24px;border:1px solid #e5e7eb;border-radius:16px;text-align:center;background:#fff">
      <h3 style="font-weight:700;margin-bottom:8px">Premium</h3>
      <div style="font-size:2.5rem;font-weight:800;color:#2563eb;margin-bottom:20px">$197</div>
      <ul style="list-style:none;padding:0;text-align:left;margin-bottom:28px"><li style="padding:6px 0;border-bottom:1px solid #f0f0f0">Everything in Standard</li><li style="padding:6px 0;border-bottom:1px solid #f0f0f0">Priority support</li><li style="padding:6px 0;border-bottom:1px solid #f0f0f0">1-on-1 session</li></ul>
      <button onclick="bloomCheckout('ORG_SLUG','Premium',197,'usd','bloom-pay-prem')" id="bloom-pay-prem" style="width:100%;padding:12px;background:#f3f4f6;color:#333;border:none;border-radius:8px;font-weight:700;cursor:pointer">Go Premium — $197</button>
    </div>
  </div>
  <script>if(!window.bloomCheckout){async function bloomCheckout(org,prod,amt,cur,bid){var b=document.getElementById(bid);if(b){b.disabled=true;b.textContent='Redirecting...';}try{var r=await fetch('/api/payments/create-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orgSlug:org,productName:prod,amount:amt,currency:cur,quantity:1})});var j=await r.json();if(j.success&&j.checkoutUrl){window.location.href=j.checkoutUrl;}else{alert(j.error||'Payment failed.');if(b){b.disabled=false;}}}catch(err){alert('Network error.');if(b){b.disabled=false;}}};window.bloomCheckout=bloomCheckout;}</script>
</section>`,
      });

      bm.add('bloom-sub-counter', {
        label: 'Submission Counter',
        category: 'BLOOM',
        attributes: { class: 'fa fa-bar-chart' },
        content: `<div style="text-align:center;padding:12px">
  <span id="bloom-counter-contact" style="font-size:.95rem;color:#666"></span>
  <script>(async()=>{try{var r=await fetch('/api/analytics/site/ORG_SLUG');var j=await r.json();var c=j?.forms?.byForm?.['contact']||0;if(c>0){var el=document.getElementById('bloom-counter-contact');if(el)el.textContent=c+' people have already signed up';}}catch{}})();</script>
</div>`,
      });

      bm.add('bloom-success', {
        label: 'Success Page',
        category: 'BLOOM',
        attributes: { class: 'fa fa-check-circle' },
        content: `<section id="bloom-success" style="display:none;padding:80px 20px;text-align:center;min-height:60vh;background:#f0fdf4">
  <div style="max-width:600px;margin:0 auto">
    <div style="font-size:4rem;margin-bottom:16px">✅</div>
    <h2 style="font-size:2rem;font-weight:800;color:#16a34a;margin-bottom:12px">Thank You!</h2>
    <p style="font-size:1.1rem;color:#555;margin-bottom:32px">Your payment was successful. We'll send you a confirmation email shortly.</p>
    <a href="/" style="display:inline-block;padding:14px 32px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Back to Home</a>
  </div>
  <script>if(window.location.search.includes('success')||window.location.search.includes('session_id')){document.getElementById('bloom-success').style.display='block';}</script>
</section>`,
      });
    });

    // FIX 3: Auto-switch right panel on selection
    editor.on('component:selected', (component) => {
      try {
        const tag = (component.get('tagName') || '').toLowerCase();
        // Bubble inline child elements up to parent link/button
        if (['span', 'i', 'strong', 'em', 'svg', 'path'].includes(tag)) {
          const parent = component.parent();
          if (parent) {
            const pt = (parent.get('tagName') || '').toLowerCase();
            if (pt === 'a' || pt === 'button') {
              editor.select(parent);
              return;
            }
          }
        }
        // Show Traits for links/buttons, Styles for everything else
        const isLinkOrBtn = tag === 'a' || tag === 'button' || component.get('type') === 'link';
        const btnId = isLinkOrBtn ? 'open-tm' : 'open-sm';
        const btn = editor.Panels.getButton('views', btnId);
        if (btn) btn.set('active', true);
      } catch (e) { /* non-critical */ }
    });

    // FIX 4: Delete key removes selected element
    editor.on('canvas:keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = editor.Canvas.getDocument()?.activeElement;
        if (active && ['INPUT','TEXTAREA'].includes(active.tagName)) return;
        const selected = editor.getSelected();
        if (selected) selected.remove();
      }
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

        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', display: 'flex', gap: 16 }}>
          <span>🎨 Style panel = click any element</span>
          <span>⚙️ Traits panel = links &amp; buttons</span>
          <span>📑 Layers = element tree</span>
          <span>Del = remove element</span>
        </span>

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

      {/* ── GrapesJS Editor ── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <GjsEditor
          grapesjs={grapesjs}
          onEditor={onEditor}
          options={{
            height: '100%',
            storageManager: false,
            undoManager: { trackSelection: false },
            assetManager: {
              upload:       '/api/files/images/upload',
              uploadName:   'file',
              assets:       aiAssets.map(a => ({ src: a.src, name: a.name, category: 'AI Generated' })),
              showUrlInput: true,
            },
            // FIX: Explicit panel config with emoji labels + Layer panel button
            panels: {
              defaults: [
                {
                  id: 'views',
                  buttons: [
                    { id: 'open-sm',     label: '🎨 Style',  command: 'open-sm',     active: true,  togglable: false, attributes: { title: 'Style Manager — edit colors, fonts, spacing' } },
                    { id: 'open-tm',     label: '⚙️ Traits', command: 'open-tm',     active: false, togglable: false, attributes: { title: 'Element Traits — edit links, attributes' } },
                    { id: 'open-layers', label: '📑 Layers', command: 'open-layers', active: false, togglable: false, attributes: { title: 'Layer Tree — see all elements' } },
                    { id: 'open-blocks', label: '🧩 Blocks', command: 'open-blocks', active: false, togglable: false, attributes: { title: 'Add Blocks — drag new elements' } },
                  ],
                },
              ],
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

      {/* ── BLOOM dark theme for GrapesJS shell ── */}
      <style>{`
        .gjs-one-bg   { background: #16213e !important; }
        .gjs-two-bg   { background: #1a1a2e !important; }
        .gjs-three-bg { background: #0f3460 !important; }
        .gjs-four-bg  { background: #0a0a1a !important; }
        .gjs-pn-panel, .gjs-sm-sector, .gjs-trt-trait, .gjs-clm-tag { color: #e2e8f0 !important; }

        /* Layer panel — selected row highlight */
        .gjs-layer.gjs-selected > .gjs-layer-title { background: rgba(244,162,97,0.2) !important; }
        .gjs-layer-title:hover { background: rgba(255,255,255,0.06) !important; }
        .gjs-layer-vis { color: #F4A261 !important; }

        /* Style manager inputs */
        .gjs-sm-field input, .gjs-sm-field select,
        .gjs-trt-trait input, .gjs-trt-trait select {
          background: rgba(255,255,255,0.07) !important;
          color: #e2e8f0 !important;
          border-color: rgba(255,255,255,0.12) !important;
          border-radius: 6px !important;
        }
        .gjs-sm-sector-title {
          background: rgba(244,162,97,0.1) !important;
          border-left: 3px solid #F4A261 !important;
          font-weight: 700 !important;
          letter-spacing: 0.5px !important;
        }

        /* Block manager */
        .gjs-block {
          background: rgba(255,255,255,0.05) !important;
          border-color: rgba(255,255,255,0.1) !important;
          color: #e2e8f0 !important;
          border-radius: 8px !important;
          transition: all 0.15s !important;
        }
        .gjs-block:hover {
          background: rgba(244,162,97,0.15) !important;
          border-color: #F4A261 !important;
          transform: translateY(-1px) !important;
        }

        /* Canvas toolbar (bold/italic mini-bar) */
        .gjs-toolbar { background: #F4A261 !important; border-radius: 6px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important; }
        .gjs-toolbar-item:hover { background: rgba(0,0,0,0.15) !important; }

        /* Canvas background */
        .gjs-cv-canvas { background: #e8e8e8 !important; }

        /* Panel tab buttons */
        .gjs-pn-views-container { border-left: 1px solid rgba(255,255,255,0.08) !important; }
        .gjs-pn-btn { font-size: 11px !important; padding: 6px 8px !important; }
        .gjs-pn-btn.gjs-pn-active {
          color: #F4A261 !important;
          border-bottom: 2px solid #F4A261 !important;
          background: rgba(244,162,97,0.1) !important;
        }

        /* Resize handle */
        .gjs-resizer-h { border-color: #F4A261 !important; }
      `}</style>
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
    document.querySelectorAll('button[data-href]').forEach(btn => {
      const url    = btn.getAttribute('data-href');
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
