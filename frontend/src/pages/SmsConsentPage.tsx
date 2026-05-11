import { useState } from 'react';
import { Box, Button, Container, Link as MuiLink, Paper, Stack, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

const TWILIO_MESSAGE_FLOW_TEXT = `End users opt in to receive SMS notifications through a web-based consent flow.

1. Users create an account and log in to the platform at https://www.lit-scww.com.
2. After login, users are presented with a clearly labeled SMS consent prompt that describes the message types, including project updates, appointment reminders, scheduling notifications, and platform alerts.
3. The prompt includes disclosures that message frequency may vary and that message and data rates may apply.
4. The prompt explains that users can reply STOP to opt out and HELP for assistance.
5. Users must explicitly select “Yes” to opt in before SMS messages are sent.
6. Consent is stored in the system and tied to the user account and phone number.
7. Users can manage SMS preferences at any time in account settings.
8. Users can opt out by replying STOP to any message or by disabling SMS notifications in account settings.
9. SMS consent is not a condition of using the service.

Public opt-in flow verification page:
https://www.lit-scww.com/sms-consent

Privacy Policy:
https://www.lit-scww.com/privacy-policy

Terms:
https://www.lit-scww.com/terms`;

const screenshotCards = [
  {
    title: 'Login screen',
    src: '/sms-consent-login.png',
    alt: 'Login screen where users sign in before seeing SMS consent options.',
    caption: 'Login screen users access before entering the platform.',
  },
  {
    title: 'SMS consent prompt after login',
    src: '/sms-consent-prompt.png',
    alt: 'SMS consent prompt shown after login with Yes or No opt-in selection.',
    caption: 'Users are explicitly asked to opt in to SMS notifications after logging in.',
  },
  {
    title: 'SMS notification settings page',
    src: '/sms-consent-settings.png',
    alt: 'User account settings page where SMS preferences can be enabled or disabled.',
    caption: 'Users can manage or disable SMS notifications at any time in settings.',
  },
];

export default function SmsConsentPage() {
  const [copied, setCopied] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState({});

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(TWILIO_MESSAGE_FLOW_TEXT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error('Failed to copy Twilio flow text:', error);
    }
  };

  const handleImageError = (src) => {
    setImageLoadFailed((prev) => ({ ...prev, [src]: true }));
  };

  return (
    <Box sx={{ minHeight: '100vh', py: 4 }}>
      <Container maxWidth="md">
        <Paper elevation={0} sx={{ p: { xs: 2, sm: 4 }, borderRadius: 2 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box
              component="img"
              src="/logo.png"
              alt="Logo"
              sx={{ height: 56, width: 'auto', objectFit: 'contain' }}
            />
          </Box>

          <Typography variant="h4" component="h1" sx={{ fontWeight: 600, mb: 1 }}>
            SMS Consent Verification
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Public compliance page for Twilio A2P 10DLC review.
          </Typography>

          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mb: 1 }}>
            San Clemente Woodworking SMS Consent Flow
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            Users opt in to receive SMS notifications through an in-app consent flow after logging into the platform.
          </Typography>
          <Typography variant="body1" sx={{ mb: 1, lineHeight: 1.7 }}>
            The consent prompt explains:
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, mb: 2 }}>
            <li><Typography component="span">Messages are for operational project updates, appointment reminders, and platform notifications</Typography></li>
            <li><Typography component="span">Message frequency may vary</Typography></li>
            <li><Typography component="span">Message and data rates may apply</Typography></li>
            <li><Typography component="span">Users can reply STOP to opt out</Typography></li>
            <li><Typography component="span">Users can reply HELP for assistance</Typography></li>
            <li><Typography component="span">SMS consent is not required to use the service</Typography></li>
          </Box>
          <Typography variant="body1" sx={{ mb: 1.5, lineHeight: 1.7 }}>
            Users must explicitly select "Yes" before any SMS messages are sent.
          </Typography>
          <Typography variant="body1" sx={{ mb: 1.5, lineHeight: 1.7 }}>
            Consent is stored in the system and tied to the user account and phone number.
          </Typography>
          <Typography variant="body1" sx={{ mb: 1.5, lineHeight: 1.7 }}>
            Users can manage SMS preferences at any time from account settings.
          </Typography>
          <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.7 }}>
            Users can opt out by replying STOP or by disabling SMS notifications in account settings.
          </Typography>

          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mb: 1 }}>
            Opt-In Flow Screenshots
          </Typography>
          <Stack spacing={1.5} sx={{ mb: 3 }}>
            {screenshotCards.map((card) => (
              <Paper
                key={card.title}
                variant="outlined"
                sx={{
                  p: 2,
                  bgcolor: 'background.default',
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  {card.title}
                </Typography>
                {!imageLoadFailed[card.src] ? (
                  <Box
                    component="img"
                    src={card.src}
                    alt={card.alt}
                    onError={() => handleImageError(card.src)}
                    sx={{
                      width: '100%',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      display: 'block',
                      mb: 1,
                    }}
                  />
                ) : (
                  <Box
                    role="img"
                    aria-label={card.alt}
                    sx={{
                      width: '100%',
                      borderRadius: 1,
                      border: '1px dashed',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      p: 1.5,
                      mb: 1,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {card.alt}
                    </Typography>
                  </Box>
                )}
                <Typography variant="body2" color="text.secondary">
                  {card.caption}
                </Typography>
              </Paper>
            ))}
          </Stack>

          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mb: 1 }}>
            Twilio Campaign Message Flow
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Copy and paste this into the Twilio campaign submission.
          </Typography>
          <TextField
            value={TWILIO_MESSAGE_FLOW_TEXT}
            multiline
            fullWidth
            minRows={16}
            InputProps={{ readOnly: true }}
            sx={{ mb: 1.5, '& .MuiInputBase-input': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }}
          />
          <Button variant="outlined" onClick={handleCopy} sx={{ mb: 3 }}>
            {copied ? 'Copied' : 'Copy Twilio Message Flow'}
          </Button>

          <Typography variant="body2" color="text.secondary">
            <MuiLink component={Link} to="/privacy-policy" underline="hover" color="inherit">
              Privacy Policy
            </MuiLink>
            {' · '}
            <MuiLink component={Link} to="/terms" underline="hover" color="inherit">
              Terms
            </MuiLink>
            {' · '}
            <MuiLink component={Link} to="/login" underline="hover" color="inherit">
              Back to login
            </MuiLink>
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
