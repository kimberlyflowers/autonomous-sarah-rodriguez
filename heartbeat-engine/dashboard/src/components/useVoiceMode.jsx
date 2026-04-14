import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase.js';

/**
 * useVoiceMode - Voice playback hook for Bloomie chat responses
 * Converts text to speech using ElevenLabs and plays back audio
 * @param {string} agentId - The Bloomie agent ID
 * @returns {object} Voice mode state and controls
 */
export function useVoiceMode(agentId) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);

  // Load voice mode preference and agent settings from Supabase
  useEffect(() => {
    const loadVoiceSettings = async () => {
      try {
        // Load localStorage preference
        const localPref = localStorage.getItem(`bloom_voice_${agentId}`);
        if (localPref !== null) {
          setVoiceEnabled(JSON.parse(localPref));
        }

        // Fetch agent voice settings from Supabase
        const { data, error } = await supabase
          .from('agents')
          .select('voice_id, elevenlabs_model, voice_stability, voice_similarity, voice_mode_enabled')
          .eq('id', agentId)
          .single();

        if (error) {
          console.error('Error loading voice settings:', error);
          setLoading(false);
          return;
        }

        if (data) {
          setVoiceSettings({
            voiceId: data.voice_id,
            modelId: data.elevenlabs_model || 'eleven_turbo_v2_5',
            stability: data.voice_stability || 0.5,
            similarity: data.voice_similarity || 0.75,
          });

          // If voice_mode_enabled is set in DB and local pref doesn't exist, use DB value
          if (localPref === null && data.voice_mode_enabled !== null) {
            setVoiceEnabled(data.voice_mode_enabled);
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to load voice settings:', err);
        setLoading(false);
      }
    };

    if (agentId) {
      loadVoiceSettings();
    }
  }, [agentId]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  /**
   * Convert text to speech and play it
   * @param {string} text - Text to speak
   */
  const speakText = useCallback(
    async (text) => {
      if (!voiceEnabled || !voiceSettings || !text.trim()) {
        return;
      }

      try {
        setIsSpeaking(true);

        // Call backend proxy endpoint
        const response = await fetch('/api/bloomie/speak', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            voiceId: voiceSettings.voiceId,
            modelId: voiceSettings.modelId,
            stability: voiceSettings.stability,
            similarity: voiceSettings.similarity,
          }),
        });

        if (!response.ok) {
          throw new Error(`Speech synthesis failed: ${response.statusText}`);
        }

        // Get audio blob from response
        const audioBlob = await response.blob();

        // Clean up previous audio
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }
        if (audioRef.current) {
          audioRef.current.pause();
        }

        // Create new audio element
        const objectUrl = URL.createObjectURL(audioBlob);
        objectUrlRef.current = objectUrl;

        const audio = new Audio(objectUrl);
        audioRef.current = audio;

        // Handle audio end
        audio.onended = () => {
          setIsSpeaking(false);
        };

        audio.onerror = (error) => {
          console.error('Audio playback error:', error);
          setIsSpeaking(false);
        };

        // Play audio
        await audio.play();
      } catch (error) {
        console.error('Error speaking text:', error);
        setIsSpeaking(false);
      }
    },
    [voiceEnabled, voiceSettings]
  );

  /**
   * Toggle voice mode on/off
   */
  const toggleVoice = useCallback(async () => {
    try {
      const newState = !voiceEnabled;
      setVoiceEnabled(newState);

      // Save to localStorage
      localStorage.setItem(`bloom_voice_${agentId}`, JSON.stringify(newState));

      // Update Supabase
      const { error } = await supabase
        .from('agents')
        .update({ voice_mode_enabled: newState })
        .eq('id', agentId);

      if (error) {
        console.error('Error updating voice mode in Supabase:', error);
      }
    } catch (err) {
      console.error('Error toggling voice mode:', err);
    }
  }, [voiceEnabled, agentId]);

  /**
   * Stop current audio playback
   */
  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
  }, []);

  return {
    voiceEnabled,
    toggleVoice,
    speakText,
    isSpeaking,
    stopSpeaking,
    loading,
  };
}

/**
 * VoiceModeButton - UI button for voice mode toggle
 * @param {object} props
 * @param {boolean} props.voiceEnabled - Is voice mode enabled
 * @param {function} props.toggleVoice - Toggle voice mode
 * @param {boolean} props.isSpeaking - Is currently speaking
 * @param {function} props.stopSpeaking - Stop speaking
 * @param {object} props.c - Theme colors
 */
export function VoiceModeButton({
  voiceEnabled,
  toggleVoice,
  isSpeaking,
  stopSpeaking,
  c,
}) {
  const handleClick = () => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      toggleVoice();
    }
  };

  return (
    <button
      onClick={handleClick}
      title={voiceEnabled ? 'Voice mode on - click to disable' : 'Voice mode off - click to enable'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '40px',
        height: '40px',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: voiceEnabled ? (c?.primary || '#3B82F6') : (c?.bgSecondary || '#E5E7EB'),
        color: voiceEnabled ? '#FFFFFF' : (c?.text || '#6B7280'),
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        position: 'relative',
        ...(isSpeaking && {
          boxShadow: `0 0 0 3px ${(c?.primary || '#3B82F6')}40`,
          animation: 'pulse 1.5s ease-in-out infinite',
        }),
      }}
    >
      <style>{`
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 3px ${(c?.primary || '#3B82F6')}40;
          }
          50% {
            box-shadow: 0 0 0 8px ${(c?.primary || '#3B82F6')}20;
          }
          100% {
            box-shadow: 0 0 0 3px ${(c?.primary || '#3B82F6')}40;
          }
        }
      `}</style>

      {isSpeaking ? (
        // Stop icon (square)
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ animation: 'none' }}
        >
          <rect x="6" y="6" width="12" height="12" />
        </svg>
      ) : voiceEnabled ? (
        // Speaker filled icon
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.26 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
        </svg>
      ) : (
        // Speaker muted icon
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.6915026,12.4744748 L21.0151496,16.7981218 C21.8039171,17.5868892 21.8039171,18.8747441 21.0151496,19.6635116 C20.2263821,20.452279 19.0385272,20.452279 18.2497597,19.6635116 L13.9260127,15.3398646 L9.60236566,19.6635116 C8.81359821,20.452279 7.52575327,20.452279 6.73698582,19.6635116 C5.94821836,18.8747441 5.94821836,17.5868892 6.73698582,16.7981218 L11.0606328,12.4744748 L6.73698582,8.15082774 C5.94821836,7.36206028 5.94821836,6.07421534 6.73698582,5.28544788 C7.52575327,4.49668043 8.81359821,4.49668043 9.60236566,5.28544788 L13.9260127,9.60909493 L18.2497597,5.28544788 C19.0385272,4.49668043 20.2263821,4.49668043 21.0151496,5.28544788 C21.8039171,6.07421534 21.8039171,7.36206028 21.0151496,8.15082774 L16.6915026,12.4744748 Z" />
        </svg>
      )}
    </button>
  );
}
