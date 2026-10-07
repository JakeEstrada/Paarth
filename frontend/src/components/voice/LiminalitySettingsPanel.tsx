import {
  Box,
  Button,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  Typography,
} from '@mui/material';
import { RecordVoiceOver as RecordVoiceOverIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useLiminalitySettings } from '../../context/LiminalitySettingsContext';
import { speakText } from '../../voice/browserSpeech';
import { unlockNeuralAudio } from '../../voice/neuralSpeech';
import { DEFAULT_NEURAL_VOICE_URI, ELEVEN_VOICES } from '../../voice/neuralVoices';

export default function LiminalitySettingsPanel() {
  const theme = useTheme();
  const { enabled, setEnabled, voiceUri, setVoiceUri, supported } = useLiminalitySettings();
  const elevenUris = new Set(ELEVEN_VOICES.map((voice) => voice.uri));
  const voiceValue = !voiceUri || elevenUris.has(voiceUri) ? voiceUri : DEFAULT_NEURAL_VOICE_URI;

  const preview = () => {
    unlockNeuralAudio();
    void speakText('Yes? How can I help you?');
  };

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: '16px',
        p: 4,
        mb: 3,
        background: theme.palette.background.paper,
        boxShadow:
          theme.palette.mode === 'dark'
            ? '0 2px 12px rgba(0, 0, 0, 0.35)'
            : '0 2px 12px rgba(0, 0, 0, 0.06)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <RecordVoiceOverIcon sx={{ fontSize: 28, color: 'primary.main' }} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Liminality
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Voice navigation on desktop. Say “Liminality”, then pipeline, calendar, or customers — that
        opens the shop views. Nothing is recorded while this is off.
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            disabled={!supported}
          />
        }
        label={enabled ? 'Enabled' : 'Disabled'}
      />
      {!supported ? (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
          Use Chrome or Edge on desktop to enable voice.
        </Typography>
      ) : null}
      <FormControl fullWidth sx={{ mt: 2 }}>
        <InputLabel id="liminality-voice-label">Voice</InputLabel>
        <Select
          labelId="liminality-voice-label"
          label="Voice"
          value={voiceValue}
          displayEmpty
          onChange={(event) => {
            unlockNeuralAudio();
            setVoiceUri(String(event.target.value));
          }}
          MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
        >
          <MenuItem value="">
            <em>Recommended — Sarah</em>
          </MenuItem>
          {ELEVEN_VOICES.map((voice) => (
            <MenuItem key={voice.uri} value={voice.uri}>
              {voice.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        These are ElevenLabs voices only.
      </Typography>
      <Button variant="outlined" size="small" onClick={preview} sx={{ mt: 2, textTransform: 'none' }}>
        Hear sample
      </Button>
    </Paper>
  );
}
