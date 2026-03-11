import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './VoiceRecorder.css';

// Get supported MIME type for audio recording
function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'audio/webm';
}

const VoiceRecorder = memo(function VoiceRecorder({ onRecordingComplete, onCancel }) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState(null);
  const { t } = useLanguage();
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const timerRef = useRef(null);
  const startedRef = useRef(false);

  // Format duration as MM:SS
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Analyze audio levels for visualization - throttled to reduce re-renders
  const lastUpdateRef = useRef(0);
  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current) return;
    
    const now = performance.now();
    // Only update every 100ms instead of every frame (60fps -> 10fps for visualization)
    if (now - lastUpdateRef.current > 100) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel(average / 255);
      lastUpdateRef.current = now;
    }
    
    animationRef.current = requestAnimationFrame(analyzeAudio);
  }, []);

  // Cleanup resources
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  // Start recording with optimized audio settings
  const startRecording = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    
    try {
      // Advanced audio constraints for better quality
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        } 
      });
      streamRef.current = stream;
      
      // Set up audio context with noise filtering
      const audioContext = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      
      // Create high-pass filter to remove low rumble/background noise
      const highPassFilter = audioContext.createBiquadFilter();
      highPassFilter.type = 'highpass';
      highPassFilter.frequency.value = 80; // Cut frequencies below 80Hz
      
      // Create low-pass filter to remove high-frequency hiss
      const lowPassFilter = audioContext.createBiquadFilter();
      lowPassFilter.type = 'lowpass';
      lowPassFilter.frequency.value = 12000; // Cut frequencies above 12kHz
      
      // Create compressor to normalize volume
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      
      // Chain: source -> highpass -> lowpass -> compressor
      source.connect(highPassFilter);
      highPassFilter.connect(lowPassFilter);
      lowPassFilter.connect(compressor);
      
      // Analyser for visualization (from compressor output)
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      compressor.connect(analyser);
      analyserRef.current = analyser;
      
      // Route processed audio to a destination for recording
      const destination = audioContext.createMediaStreamDestination();
      compressor.connect(destination);
      
      // Get supported MIME type
      const mimeType = getSupportedMimeType();
      
      // Record the processed stream (with filters applied)
      const mediaRecorder = new MediaRecorder(destination.stream, { 
        mimeType,
        audioBitsPerSecond: 128000
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        setError(t('voice.recordError'));
      };
      
      mediaRecorder.start(200);
      setIsRecording(true);
      setDuration(0);
      
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
      
      analyzeAudio();
      
    } catch (err) {
      console.error('Error accessing microphone:', err);
      startedRef.current = false;
      setError(t('voice.micAccessError'));
      onCancel();
    }
  }, [analyzeAudio, onCancel, t]);

  // Stop recording and send
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      onCancel();
      return;
    }
    
    const currentDuration = duration;
    
    recorder.onstop = () => {
      if (audioChunksRef.current.length === 0) {
        onCancel();
        return;
      }
      
      const mimeType = recorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      
      let ext = 'webm';
      if (mimeType.includes('ogg')) ext = 'ogg';
      else if (mimeType.includes('mp4')) ext = 'mp4';
      
      const audioFile = new File([audioBlob], `voice_${Date.now()}.${ext}`, { type: mimeType });
      
      // Pass duration along with file for optimistic UI
      onRecordingComplete(audioFile, currentDuration);
    };
    
    recorder.stop();
    cleanup();
    setIsRecording(false);
    startedRef.current = false;
  }, [onRecordingComplete, onCancel, cleanup, duration]);

  // Cancel recording
  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
    setIsRecording(false);
    startedRef.current = false;
    onCancel();
  }, [onCancel, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  // Auto-start recording
  useEffect(() => {
    startRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="voice-recorder voice-recorder-error">
        <span>{error}</span>
        <button className="voice-btn cancel" onClick={onCancel}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="voice-recorder">
      {/* Cancel button */}
      <button className="voice-btn cancel" onClick={cancelRecording} title={t('common.cancel')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      
      {/* Waveform visualization - static bars with CSS animation */}
      <div className="voice-waveform">
        {[...Array(20)].map((_, i) => (
          <div 
            key={i} 
            className="voice-wave-bar"
            style={{ 
              height: `${20 + (i % 3) * 15 + audioLevel * 50}%`,
              animationDelay: `${i * 0.05}s`
            }}
          />
        ))}
      </div>
      
      {/* Recording indicator & timer */}
      <div className="voice-recording-indicator">
        <div className={`voice-pulse ${isRecording ? 'active' : ''}`} />
        <span className="voice-duration">{formatDuration(duration)}</span>
      </div>
      
      {/* Send button */}
      <button 
        className="voice-btn send" 
        onClick={stopRecording}
        title={t('chat.send')}
        disabled={duration < 1}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
        </svg>
      </button>
    </div>
  );
});

export default VoiceRecorder;
