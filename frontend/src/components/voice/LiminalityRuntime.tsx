import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiminalitySettings } from '../../context/LiminalitySettingsContext';
import { useLiminalityVoice } from '../../hooks/useLiminalityVoice';

export default function LiminalityRuntime() {
  const navigate = useNavigate();
  const { enabled, setRuntime } = useLiminalitySettings();
  const voice = useLiminalityVoice({
    enabled,
    onNavigate: (path) => navigate(path),
  });

  useEffect(() => {
    setRuntime({
      phase: voice.phase,
      statusLabel: voice.statusLabel,
      heard: voice.heard,
    });
  }, [setRuntime, voice.heard, voice.phase, voice.statusLabel]);

  return null;
}
