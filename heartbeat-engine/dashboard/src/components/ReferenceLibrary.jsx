import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase.js';
import GoogleDrivePicker from './GoogleDrivePicker.jsx';

const CATEGORY_OPTIONS = [
  ['identity', 'Employee identity', 'Approved face, body, and appearance references'],
  ['writing_style', 'Writing style', 'Blogs, emails, scripts, and documents to emulate'],
  ['brand', 'Brand assets', 'Visual examples that supplement the structured Brand Kit'],
  ['knowledge', 'Knowledge', 'Policies, services, FAQs, and approved operating information'],
  ['heygen', 'HeyGen source', 'Approved portrait or starting-frame images'],
  ['project', 'Project reference', 'Source material for one Project'],
];

const SCOPE_OPTIONS = [
  ['agent', 'This Bloomie'],
  ['organization', 'All Bloomies'],
  ['project', 'This Project'],
];

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
    : { 'Content-Type': 'application/json' };
}

function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function categoryLabel(value) {
  return CATEGORY_OPTIONS.find(([key]) => key === value)?.[1] || value;
}

export default function ReferenceLibrary({
  c,
  mob = false,
  agentId = null,
  agentName = 'this Bloomie',
  projectId = null,
  onOpenBrandKit = null,
  defaultCategory = 'identity',
  defaultScope = 'agent',
  initialFilter = 'all',
  title = 'References',
  description = null,
}) {
  const fileRef = useRef(null);
  const [references, setReferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [driveOpen, setDriveOpen] = useState(false);
  const [filter, setFilter] = useState(initialFilter);
  const [form, setForm] = useState({
    category: defaultCategory,
    scope: defaultScope,
    title: '',
    description: '',
    approved: false,
    file: null,
  });

  const load = async () => {
    if (!agentId) return;
    setLoading(true);
    setError('');
    try {
      const h = await authHeaders();
      const params = new URLSearchParams({ agentId });
      if (projectId) params.set('projectId', projectId);
      const response = await fetch(`/api/references?${params}`, { headers: h });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load references');
      setReferences(data.references || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setReferences([]);
    load();
  }, [agentId, projectId]);

  useEffect(() => {
    if (form.category === 'identity' || form.category === 'heygen') {
      setForm(prev => ({ ...prev, scope: 'agent' }));
    } else if (form.category === 'project' && projectId) {
      setForm(prev => ({ ...prev, scope: 'project' }));
    }
  }, [form.category, projectId]);

  const visible = useMemo(
    () => filter === 'all' ? references : references.filter(item => item.category === filter),
    [references, filter],
  );

  const upload = async () => {
    if (!form.file || !agentId) return;
    setUploading(true);
    setError('');
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(form.file);
      });
      const h = await authHeaders();
      const response = await fetch('/api/references/upload', {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          file: { name: form.file.name, type: form.file.type || 'application/octet-stream', data },
          title: form.title || form.file.name,
          description: form.description,
          category: form.category,
          scope: form.scope,
          agentId,
          projectId: form.scope === 'project' ? projectId : null,
          approved: form.approved,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Upload failed');
      setReferences(prev => [result.reference, ...prev]);
      setForm(prev => ({ ...prev, category: defaultCategory, scope: defaultScope, title: '', description: '', approved: false, file: null }));
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const selectDriveFile = async driveFile => {
    const bytes = Uint8Array.from(atob(driveFile.data), char => char.charCodeAt(0));
    const file = new File([bytes], driveFile.name, { type: driveFile.type });
    setForm(prev => ({ ...prev, file, title: prev.title || driveFile.name, description: prev.description || 'Imported from Google Drive' }));
  };

  const archive = async id => {
    const h = await authHeaders();
    const response = await fetch(`/api/references/${id}`, { method: 'DELETE', headers: h });
    if (response.ok) setReferences(prev => prev.filter(item => item.id !== id));
  };

  const syncGhl = async item => {
    setError('');
    const h = await authHeaders();
    const response = await fetch(`/api/references/${item.id}/sync-ghl`, { method: 'POST', headers: h, body: '{}' });
    const result = await response.json();
    if (!response.ok) return setError(result.error || 'GHL sync failed');
    setReferences(prev => prev.map(ref => ref.id === item.id ? result.reference : ref));
  };

  const reprocess = async item => {
    setError('');
    setReferences(prev => prev.map(ref => ref.id === item.id ? { ...ref, extraction_status: 'processing' } : ref));
    const h = await authHeaders();
    const response = await fetch(`/api/references/${item.id}/reprocess`, { method: 'POST', headers: h, body: '{}' });
    const result = await response.json();
    if (!response.ok) {
      setReferences(prev => prev.map(ref => ref.id === item.id ? (result.reference || { ...ref, extraction_status: 'failed' }) : ref));
      return setError(result.error || 'PDF processing failed');
    }
    setReferences(prev => prev.map(ref => ref.id === item.id ? result.reference : ref));
  };

  const panel = { background: c.cd, border: `1px solid ${c.ln}`, borderRadius: 16 };
  const input = { width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${c.ln}`, background: c.inp, color: c.tx, font: 'inherit' };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: mob ? '14px 12px 100px' : '24px 28px 48px', color: c.tx }}>
      <div style={{ display: 'flex', alignItems: mob ? 'flex-start' : 'center', flexDirection: mob ? 'column' : 'row', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: mob ? 21 : 25, margin: 0 }}>{title}</h1>
          <p style={{ color: c.so, fontSize: 13, marginTop: 5 }}>
            {description || `Approved source material ${agentName} can reuse across Chat, Work, images, documents, and video.`}
          </p>
        </div>
        {onOpenBrandKit && <button onClick={onOpenBrandKit} style={{ padding: '9px 14px', borderRadius: 9, border: `1px solid ${c.ln}`, background: c.cd, color: c.tx, fontWeight: 700, cursor: 'pointer' }}>Open Brand Kit</button>}
      </div>

      <div style={{ ...panel, padding: mob ? 14 : 18, marginBottom: 18 }}>
        <div style={{ fontWeight: 750, fontSize: 15, marginBottom: 4 }}>Add a reference</div>
        <div style={{ color: c.so, fontSize: 12, marginBottom: 14 }}>Choose what it teaches and who may use it. Identity references can only belong to one employee.</div>
        <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr' : '1fr 1fr', gap: 10 }}>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={input}>
            {CATEGORY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })} disabled={form.category === 'identity' || form.category === 'heygen'} style={input}>
            {SCOPE_OPTIONS.filter(([key]) => key !== 'project' || projectId).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Reference name (optional)" style={input} />
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="How should the Bloomie use this?" style={input} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr' : '1fr auto', gap: 8, marginTop: 10 }}>
          <label style={{ display: 'block', padding: '16px 14px', borderRadius: 12, border: `2px dashed ${form.file ? c.ac : c.ln}`, background: c.sf, cursor: 'pointer', textAlign: 'center' }}>
            <input ref={fileRef} type="file" accept="image/*,.pdf,.docx,.txt,.md,.csv,.json,.html" style={{ display: 'none' }} onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>{form.file ? form.file.name : 'Choose an image or document'}</div>
            <div style={{ color: c.so, fontSize: 11, marginTop: 3 }}>{form.file ? formatSize(form.file.size) : 'Images, PDF, Word, text, Markdown, CSV, JSON, or HTML · up to 20 MB'}</div>
          </label>
          <button type="button" onClick={() => setDriveOpen(true)} style={{ padding: '10px 16px', borderRadius: 12, border: `1px solid ${c.ln}`, background: c.cd, color: c.tx, fontWeight: 750, cursor: 'pointer' }}>Choose from Google Drive</button>
        </div>
        {form.category === 'knowledge' && form.scope === 'organization' && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, fontSize: 12, color: c.so }}>
            <input type="checkbox" checked={form.approved} onChange={e => setForm({ ...form, approved: e.target.checked })} />
            <span>Approved customer-facing knowledge. This makes it eligible for a deliberate GHL Knowledge Base sync; it does not publish automatically.</span>
          </label>
        )}
        {error && <div role="alert" style={{ color: '#ef4444', fontSize: 12, marginTop: 10 }}>{error}</div>}
        <button onClick={upload} disabled={!form.file || uploading} style={{ marginTop: 12, width: mob ? '100%' : 'auto', padding: '10px 20px', borderRadius: 9, border: 'none', background: form.file ? 'linear-gradient(135deg,#F4A261,#E76F8B)' : c.ln, color: '#fff', fontWeight: 750, cursor: form.file ? 'pointer' : 'default' }}>
          {uploading ? 'Uploading…' : 'Add reference'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }}>
        {[['all', 'All'], ...CATEGORY_OPTIONS.map(([key, label]) => [key, label])].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} style={{ whiteSpace: 'nowrap', padding: '7px 11px', borderRadius: 18, border: `1px solid ${filter === key ? c.ac : c.ln}`, background: filter === key ? `${c.ac}18` : c.cd, color: filter === key ? c.ac : c.so, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
        ))}
      </div>

      {loading ? <div style={{ ...panel, padding: 28, textAlign: 'center', color: c.so }}>Loading references…</div>
        : visible.length === 0 ? <div style={{ ...panel, padding: 30, textAlign: 'center' }}><div style={{ fontWeight: 700 }}>No references here yet</div><div style={{ color: c.so, fontSize: 12, marginTop: 4 }}>Upload the first approved source for {agentName}.</div></div>
          : <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr' : 'repeat(2,minmax(0,1fr))', gap: 10 }}>
            {visible.map(item => (
              <div key={item.id} style={{ ...panel, padding: 14, display: 'flex', gap: 12, minWidth: 0 }}>
                <div style={{ width: 48, height: 48, borderRadius: 10, background: c.sf, overflow: 'hidden', flexShrink: 0, display: 'grid', placeItems: 'center', color: c.so, fontSize: 11 }}>
                  {item.mime_type?.startsWith('image/') && item.storage_url
                    ? <img src={item.storage_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : 'DOC'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                  <div style={{ color: c.so, fontSize: 11, marginTop: 3 }}>{categoryLabel(item.category)} · {item.scope === 'agent' ? agentName : item.scope === 'organization' ? 'All Bloomies' : 'Project'}</div>
                  {item.description && <div style={{ color: c.so, fontSize: 11, marginTop: 5, lineHeight: 1.4 }}>{item.description}</div>}
                  {item.mime_type === 'application/pdf' && (
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: item.extraction_status === 'ready' ? c.gr : item.extraction_status === 'failed' ? '#ef4444' : c.so }}>
                        {item.extraction_status === 'ready' ? `Text ready${item.extraction_method === 'mistral_ocr' ? ' · OCR' : ''}` : item.extraction_status === 'processing' ? 'Processing…' : 'Text not processed'}
                      </span>
                      {item.extraction_status !== 'ready' && item.extraction_status !== 'processing' && (
                        <button onClick={() => reprocess(item)} style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${c.ac}`, background: `${c.ac}12`, color: c.ac, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Process PDF</button>
                      )}
                    </div>
                  )}
                  {item.ghl_sync_status === 'eligible' && <button onClick={() => syncGhl(item)} style={{ marginTop: 6, padding: '4px 8px', borderRadius: 6, border: `1px solid ${c.gr}`, background: `${c.gr}12`, color: c.gr, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Sync to GHL</button>}
                  {item.ghl_sync_status === 'synced' && <div style={{ color: c.gr, fontSize: 10, fontWeight: 700, marginTop: 5 }}>Synced to GHL</div>}
                  {item.ghl_sync_status === 'failed' && <button onClick={() => syncGhl(item)} style={{ marginTop: 6, padding: '4px 8px', borderRadius: 6, border: '1px solid #ef4444', background: '#ef444412', color: '#ef4444', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Retry GHL sync</button>}
                </div>
                <button onClick={() => archive(item.id)} aria-label={`Remove ${item.title}`} style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', alignSelf: 'flex-start' }}>×</button>
              </div>
            ))}
          </div>}
      {driveOpen && <GoogleDrivePicker c={c} onClose={() => setDriveOpen(false)} onSelect={selectDriveFile} />}
    </div>
  );
}
