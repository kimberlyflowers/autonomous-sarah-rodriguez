import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase.js';

const BloomieProfileBuilder = ({ c, mob, agentId, onSave }) => {
  const [activeTab, setActiveTab] = useState('photo');
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Photo tab state
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Voice tab state
  const [selectedVoiceId, setSelectedVoiceId] = useState(null);
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(null);

  // Voice library
  const voiceLibrary = [
    { name: "Sarah Rodriguez", id: "TOhxx937tpk5BU3jtXir", desc: "Warm, professional, Latina" },
    { name: "Marcus Chen", id: "TX3LPaxmHKxFdv7VOQHJ", desc: "Calm, analytical, measured" },
    { name: "Jonathan", id: "onwK4e9ZLuTAKqWW03F9", desc: "Bright, energetic, professional" },
    { name: "Olivia", id: "XB0fDUnXU5powFXDhCwa", desc: "Confident, warm, millennial" },
    { name: "Alex", id: "pMsXgVXv3BLzUgSXRplE", desc: "Neutral, clear, technical" },
    { name: "Emma", id: "XB0fDUnXU5powFXDhCwa", desc: "Friendly, educational, patient" },
  ];

  // Load agent data on mount
  useEffect(() => {
    const loadAgent = async () => {
      try {
        setLoading(true);
        const { data, error: fetchError } = await supabase
          .from('agents')
          .select('*')
          .eq('id', agentId)
          .single();

        if (fetchError) throw fetchError;

        setAgent(data);
        setSelectedVoiceId(data.voice_id || null);
        setVoiceModeEnabled(data.voice_mode_enabled || false);
        setAvatarPreview(data.avatar_url);
      } catch (err) {
        console.error('Error loading agent:', err);
        setError('Failed to load agent data');
      } finally {
        setLoading(false);
      }
    };

    if (agentId) {
      loadAgent();
    }
  }, [agentId]);

  // Get initials for default avatar
  const getInitials = () => {
    if (!agent?.name) return '?';
    return agent.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Handle photo upload
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError(null);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result);
      };
      reader.readAsDataURL(file);

      setAvatarFile(file);
    } catch (err) {
      console.error('Error reading file:', err);
      setError('Failed to read file');
    } finally {
      setUploading(false);
    }
  };

  // Save avatar to Supabase Storage
  const saveAvatar = async () => {
    if (!avatarFile || !agent) return;

    try {
      setUploading(true);
      setError(null);

      const ext = avatarFile.name.split('.').pop();
      const filePath = `bloomie-avatars/${agent.organization_id}/${agent.id}/avatar.${ext}`;

      // Upload file
      const { error: uploadError } = await supabase.storage
        .from('bloom-assets')
        .upload(filePath, avatarFile, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('bloom-assets')
        .getPublicUrl(filePath);

      // Update agent record
      const { error: updateError } = await supabase
        .from('agents')
        .update({ avatar_url: publicUrl })
        .eq('id', agentId);

      if (updateError) throw updateError;

      setAgent({ ...agent, avatar_url: publicUrl });
      setAvatarFile(null);
      setError(null);
    } catch (err) {
      console.error('Error saving avatar:', err);
      setError('Failed to save avatar');
    } finally {
      setUploading(false);
    }
  };

  // Preview voice
  const handleVoicePreview = async (voiceId) => {
    try {
      setPreviewLoading(voiceId);

      const response = await fetch(`/api/bloomie/voice-preview?voiceId=${voiceId}`);
      if (!response.ok) throw new Error('Failed to fetch voice preview');

      const blob = await response.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.play();

      setPlayingVoiceId(voiceId);
      audio.onended = () => setPlayingVoiceId(null);
    } catch (err) {
      console.error('Error playing voice preview:', err);
      setError('Failed to play voice preview');
    } finally {
      setPreviewLoading(null);
    }
  };

  // Save all changes
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // Update voice settings if they changed
      if (agent && (selectedVoiceId !== agent.voice_id || voiceModeEnabled !== agent.voice_mode_enabled)) {
        const { error: updateError } = await supabase
          .from('agents')
          .update({
            voice_id: selectedVoiceId,
            voice_mode_enabled: voiceModeEnabled,
          })
          .eq('id', agentId);

        if (updateError) throw updateError;

        setAgent({
          ...agent,
          voice_id: selectedVoiceId,
          voice_mode_enabled: voiceModeEnabled,
        });
      }

      onSave?.();
    } catch (err) {
      console.error('Error saving changes:', err);
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        color: c.tx,
      }}>
        Loading agent profile...
      </div>
    );
  }

  if (!agent) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        color: c.err,
      }}>
        Agent not found
      </div>
    );
  }

  // Tab styles
  const tabStyle = (isActive) => ({
    padding: '12px 16px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
    backgroundColor: isActive ? c.ac : 'transparent',
    color: isActive ? c.bg : c.tx,
    borderBottom: !isActive ? `2px solid ${c.ln}` : 'none',
  });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      padding: mob ? '16px' : '24px',
      backgroundColor: c.bg,
      borderRadius: '16px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    }}>
      {/* Error message */}
      {error && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: c.err,
          color: c.bg,
          borderRadius: '8px',
          fontSize: '14px',
        }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: `1px solid ${c.ln}`,
      }}>
        <button
          onClick={() => setActiveTab('photo')}
          style={tabStyle(activeTab === 'photo')}
        >
          Photo
        </button>
        <button
          onClick={() => setActiveTab('voice')}
          style={tabStyle(activeTab === 'voice')}
        >
          Voice
        </button>
        <button
          onClick={() => setActiveTab('personality')}
          style={tabStyle(activeTab === 'personality')}
        >
          Personality
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ minHeight: '300px' }}>
        {/* Photo Tab */}
        {activeTab === 'photo' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}>
            <div style={{
              display: 'flex',
              flexDirection: mob ? 'column' : 'row',
              gap: '24px',
              alignItems: mob ? 'center' : 'flex-start',
            }}>
              {/* Avatar Preview */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}>
                <div style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '12px',
                  backgroundColor: c.ac,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  border: `2px solid ${c.cd}`,
                }}>
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar preview"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div style={{
                      fontSize: '32px',
                      fontWeight: 'bold',
                      color: c.bg,
                    }}>
                      {getInitials()}
                    </div>
                  )}
                </div>
                <p style={{
                  fontSize: '12px',
                  color: c.so,
                  margin: 0,
                }}>
                  {agent.name}
                </p>
              </div>

              {/* Upload Controls */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                flex: 1,
              }}>
                <div>
                  <label style={{
                    display: 'inline-block',
                    padding: '10px 16px',
                    backgroundColor: c.ac,
                    color: c.bg,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = c.hv;
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = c.ac;
                  }}>
                    {uploading ? 'Uploading...' : 'Choose Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      disabled={uploading}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>

                {avatarFile && (
                  <button
                    onClick={saveAvatar}
                    disabled={uploading}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: c.ac,
                      color: c.bg,
                      border: 'none',
                      borderRadius: '8px',
                      cursor: uploading ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      opacity: uploading ? 0.6 : 1,
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!uploading) e.target.style.backgroundColor = c.hv;
                    }}
                    onMouseLeave={(e) => {
                      if (!uploading) e.target.style.backgroundColor = c.ac;
                    }}
                  >
                    {uploading ? 'Saving...' : 'Save Photo'}
                  </button>
                )}

                <p style={{
                  fontSize: '13px',
                  color: c.so,
                  margin: '8px 0 0 0',
                }}>
                  JPG, PNG up to 5MB
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Voice Tab */}
        {activeTab === 'voice' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}>
            {/* Voice Mode Toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px',
              backgroundColor: c.inp,
              borderRadius: '8px',
            }}>
              <input
                type="checkbox"
                checked={voiceModeEnabled}
                onChange={(e) => setVoiceModeEnabled(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer',
                  accentColor: c.ac,
                }}
              />
              <label style={{
                fontSize: '14px',
                fontWeight: '500',
                color: c.tx,
                cursor: 'pointer',
                margin: 0,
              }}>
                Enable Voice Mode
              </label>
            </div>

            {/* Voice Library */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: mob ? '1fr' : 'repeat(2, 1fr)',
              gap: '12px',
            }}>
              {voiceLibrary.map((voice) => (
                <div
                  key={voice.id}
                  onClick={() => setSelectedVoiceId(voice.id)}
                  style={{
                    padding: '16px',
                    backgroundColor: c.inp,
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    border: `2px solid ${selectedVoiceId === voice.id ? c.ac : 'transparent'}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = c.inp;
                    e.currentTarget.style.boxShadow = `0 2px 8px rgba(0, 0, 0, 0.1)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = c.inp;
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}>
                    <div>
                      <p style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: c.tx,
                        margin: 0,
                      }}>
                        {voice.name}
                      </p>
                      <p style={{
                        fontSize: '12px',
                        color: c.so,
                        margin: '4px 0 0 0',
                      }}>
                        {voice.desc}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVoicePreview(voice.id);
                    }}
                    disabled={previewLoading === voice.id}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: c.ac,
                      color: c.bg,
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: previewLoading === voice.id ? 'not-allowed' : 'pointer',
                      opacity: previewLoading === voice.id ? 0.7 : 1,
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (previewLoading !== voice.id) {
                        e.target.style.backgroundColor = c.hv;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (previewLoading !== voice.id) {
                        e.target.style.backgroundColor = c.ac;
                      }
                    }}
                  >
                    {previewLoading === voice.id
                      ? playingVoiceId === voice.id ? 'Playing...' : 'Loading...'
                      : playingVoiceId === voice.id ? 'Playing...' : 'Preview'}
                  </button>
                </div>
              ))}
            </div>

            {selectedVoiceId && (
              <p style={{
                fontSize: '13px',
                color: c.so,
                margin: 0,
              }}>
                Selected: {voiceLibrary.find(v => v.id === selectedVoiceId)?.name}
              </p>
            )}
          </div>
        )}

        {/* Personality Tab */}
        {activeTab === 'personality' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            <div style={{
              padding: '16px',
              backgroundColor: c.inp,
              borderRadius: '12px',
            }}>
              <p style={{
                fontSize: '12px',
                fontWeight: '600',
                color: c.so,
                margin: '0 0 8px 0',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Agent Name
              </p>
              <p style={{
                fontSize: '16px',
                fontWeight: '600',
                color: c.tx,
                margin: 0,
              }}>
                {agent.name}
              </p>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: c.inp,
              borderRadius: '12px',
            }}>
              <p style={{
                fontSize: '12px',
                fontWeight: '600',
                color: c.so,
                margin: '0 0 8px 0',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Role / Job Title
              </p>
              <p style={{
                fontSize: '16px',
                fontWeight: '600',
                color: c.tx,
                margin: 0,
              }}>
                {agent.role || 'Not specified'}
              </p>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: c.inp,
              borderRadius: '12px',
            }}>
              <p style={{
                fontSize: '12px',
                fontWeight: '600',
                color: c.so,
                margin: '0 0 8px 0',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Communication Style
              </p>
              <p style={{
                fontSize: '14px',
                color: c.tx,
                margin: 0,
              }}>
                Professional and responsive AI agent optimized for dashboard management and team collaboration.
              </p>
            </div>

            <div style={{
              padding: '12px',
              backgroundColor: c.warn,
              borderRadius: '8px',
              fontSize: '13px',
              color: c.bg,
            }}>
              Personality settings are read-only at this time. Additional customization coming soon.
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
        paddingTop: '12px',
        borderTop: `1px solid ${c.ln}`,
      }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 20px',
            backgroundColor: c.ac,
            color: c.bg,
            border: 'none',
            borderRadius: '8px',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            opacity: saving ? 0.6 : 1,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (!saving) e.target.style.backgroundColor = c.hv;
          }}
          onMouseLeave={(e) => {
            if (!saving) e.target.style.backgroundColor = c.ac;
          }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default BloomieProfileBuilder;
