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
import { useLiminalitySettings, voiceChoiceLabel } from '../../context/LiminalitySettingsContext';
import { speakText } from '../../voice/browserSpeech';

export default function LiminalitySettingsPanel() {
  const theme = useTheme();
  const { enabled, setEnabled, voiceUri, setVoiceUri, voices, supported } = useLiminalitySettings();
  const englishVoices = voices.filter((voice) => String(voice.lang || '').toLowerCase().startsWith('en'));
  const otherVoices = voices.filter((voice) => !String(voice.lang || '').toLowerCase().startsWith('en'));
  const voiceValue =
    !voiceUri || voices.some((voice) => (voice.voiceURI || voice.name) === voiceUri)
      ? voiceUri
      : '';

  const preview = () => {
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
        Voice navigation on desktop. When this is on, say “Liminality” and then a page name. Nothing
        is recorded while it is off.
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
      <FormControl fullWidth sx={{ mt: 2 }} disabled={!supported}>
        <InputLabel id="liminality-voice-label">Voice</InputLabel>
        <Select
          labelId="liminality-voice-label"
          label="Voice"
          value={voiceValue}
          displayEmpty
          onChange={(event) => setVoiceUri(String(event.target.value))}
          MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
        >
          <MenuItem value="">
            <em>Recommended (auto)</em>
          </MenuItem>
          {englishVoices.length ? (
            <MenuItem disabled value="__english">
              English
            </MenuItem>
          ) : null}
          {englishVoices.map((voice) => (
            <MenuItem key={voice.voiceURI || voice.name} value={voice.voiceURI || voice.name}>
              {voiceChoiceLabel(voice)}
            </MenuItem>
          ))}
          {otherVoices.length ? (
            <MenuItem disabled value="__other">
              Other languages
            </MenuItem>
          ) : null}
          {otherVoices.map((voice) => (
            <MenuItem key={voice.voiceURI || voice.name} value={voice.voiceURI || voice.name}>
              {voiceChoiceLabel(voice)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Voices come from this browser and computer. Pick one, then hear a sample.
      </Typography>
      <Button
        variant="outlined"
        size="small"
        onClick={preview}
        disabled={!supported}
        sx={{ mt: 2, textTransform: 'none' }}
      >
        Hear sample
      </Button>
    </Paper>
  );
}
