import { useEffect, useState } from 'react';
import { supabase } from '../supabase.js';

async function headers() {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export default function GoogleDrivePicker({ c, onClose, onSelect, multiple = false }) {
  const [files, setFiles] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState('');
  const [error, setError] = useState('');
  const [reconnectUrl, setReconnectUrl] = useState('');

  const load = async (search = '') => {
    setLoading(true);
    setError('');
    try {
      const h = await headers();
      const response = await fetch(`/api/files/google-drive/list${search ? `?q=${encodeURIComponent(search)}` : ''}`, { headers: h });
      const payload = await response.json();
      if (!response.ok) {
        setReconnectUrl(payload.reconnectUrl || '');
        throw new Error(payload.error || 'Could not browse Google Drive');
      }
      setFiles(payload.files || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const choose = async file => {
    setSelecting(file.id);
    setError('');
    try {
      const h = await headers();
      const response = await fetch(`/api/files/google-drive/${encodeURIComponent(file.id)}/download`, { headers: h });
      const payload = await response.json();
      if (!response.ok) {
        setReconnectUrl(payload.reconnectUrl || '');
        throw new Error(payload.error || 'Could not import this Drive file');
      }
      await onSelect(payload.file);
      if (!multiple) onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSelecting('');
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Choose from Google Drive" style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(0,0,0,.58)', display: 'grid', placeItems: 'center', padding: 16 }} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: 'min(680px,100%)', maxHeight: 'min(720px,88dvh)', display: 'flex', flexDirection: 'column', borderRadius: 18, border: `1px solid ${c.ln}`, background: c.cd, color: c.tx, boxShadow: '0 24px 70px rgba(0,0,0,.4)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${c.ln}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div><div style={{ fontSize: 17, fontWeight: 800 }}>Google Drive</div><div style={{ fontSize: 11, color: c.so, marginTop: 2 }}>Choose a file from this tenant’s connected Drive.</div></div>
            <button onClick={onClose} aria-label="Close Google Drive" style={{ border: 'none', background: 'transparent', color: c.so, fontSize: 22, cursor: 'pointer' }}>×</button>
          </div>
          <form onSubmit={e => { e.preventDefault(); load(query); }} style={{ display: 'flex', gap: 8 }}>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Drive files" style={{ flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 9, border: `1px solid ${c.ln}`, background: c.inp, color: c.tx }} />
            <button type="submit" style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: c.ac, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Search</button>
          </form>
        </div>
        <div style={{ overflowY: 'auto', padding: 10, minHeight: 220 }}>
          {error && <div role="alert" style={{ padding: 12, color: '#ef4444', fontSize: 12 }}>{error}{reconnectUrl && <div><a href={reconnectUrl} target="_blank" rel="noreferrer" style={{ color: c.ac, fontWeight: 700 }}>Reconnect Google Drive</a></div>}</div>}
          {loading ? <div style={{ padding: 36, textAlign: 'center', color: c.so }}>Loading Drive…</div>
            : files.length === 0 ? <div style={{ padding: 36, textAlign: 'center', color: c.so }}>No matching files found.</div>
              : files.map(file => (
                <button key={file.id} onClick={() => choose(file)} disabled={!!selecting} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', border: 'none', borderBottom: `1px solid ${c.ln}`, background: 'transparent', color: c.tx, textAlign: 'left', cursor: selecting ? 'wait' : 'pointer' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, background: c.sf, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{file.thumbnailLink ? <img src={file.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 9 }} /> : '📄'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span><span style={{ display: 'block', fontSize: 10, color: c.so, marginTop: 2 }}>{file.mimeType?.replace('application/vnd.google-apps.', 'Google ')}</span></span>
                  <span style={{ color: c.ac, fontSize: 11, fontWeight: 700 }}>{selecting === file.id ? 'Importing…' : 'Choose'}</span>
                </button>
              ))}
        </div>
      </div>
    </div>
  );
}
