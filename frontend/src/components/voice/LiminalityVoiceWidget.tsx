import { Button, Paper, Typography } from '@mui/material';
import { Mic as MicIcon, MicOff as MicOffIcon } from '@mui/icons-material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiminalityVoice, type LiminalityPhase } from '../../hooks/useLiminalityVoice';
import { warmUpSpeechVoices } from '../../voice/browserSpeech';

function statusMark(phase: LiminalityPhase, enabled: boolean) {
  if (!enabled || phase === 'off') return '○';
  if (phase === 'listening') return '●';
  if (phase === 'processing') return '◌';
  if (phase === 'executing' || phase === 'speaking') return '✓';
  return '○';
}

export default function LiminalityVoiceWidget() {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const voice = useLiminalityVoice({
    enabled,
    onNavigate: (path) => navigate(path),
  });

  useEffect(() => {
    warmUpSpeechVoices();
  }, []);

  const toggle = () => {
    if (!voice.supported) return;
    setEnabled((prev) => !prev);
  };

  const mark = statusMark(voice.phase, enabled);

  return (
    <Paper
      elevation={6}
      sx={{
        position: 'fixed',
        left: { xs: 16, sm: 24 },
        bottom: { xs: 16, sm: 24 },
        zIndex: 1300,
        width: 220,
        p: 1.5,
        borderRadius: 2,
      }}
    >
      <Typography
        variant="caption"
        sx={{ letterSpacing: '0.12em', fontWeight: 700, display: 'block', mb: 0.75 }}
      >
        LIMINALITY
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
        {mark} {voice.statusLabel}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: 'block',
          minHeight: 32,
          mb: 1,
          overflow: 'hidden',
        }}
      >
        {enabled && voice.heard ? `“${voice.heard}”` : enabled ? 'Say “Liminality”.' : 'Nothing is recorded while the microphone is off.'}
      </Typography>
      <Button
        size="small"
        fullWidth
        variant={enabled ? 'contained' : 'outlined'}
        color={enabled ? 'primary' : 'inherit'}
        startIcon={enabled ? <MicIcon /> : <MicOffIcon />}
        onClick={toggle}
        disabled={!voice.supported}
        sx={{ textTransform: 'none' }}
      >
        {enabled ? 'Microphone ON' : 'Microphone OFF'}
      </Button>
      {!voice.supported ? (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
          Use Chrome or Edge to enable voice.
        </Typography>
      ) : null}
    </Paper>
  );
}
