import { Box, Container, Paper, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

export default function TermsAndConditions() {
  return (
    <Box sx={{ minHeight: '100vh', py: 4 }}>
      <Container maxWidth="md">
        <Paper elevation={0} sx={{ p: { xs: 2, sm: 4 }, borderRadius: 2 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600, mb: 1 }}>
            Terms and Conditions
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Last updated: March 2026
          </Typography>

          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            These Terms and Conditions govern the use of the LIT-SCWW and San Clemente Woodworking
            website and related communications.
          </Typography>

          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
            Use of Services
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            By submitting your information through our website, requesting a quote, or scheduling a
            project, you agree to provide accurate contact information and to use our services only
            for legitimate business inquiries.
          </Typography>

          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
            SMS Terms
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            By providing your phone number and consenting to receive messages, you agree to receive
            SMS notifications related to your quote, scheduling, project updates, reminders, and
            customer support communications.
          </Typography>

          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            Message frequency varies. Message and data rates may apply. Reply STOP to opt out.
            Reply HELP for assistance.
          </Typography>

          <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.7 }}>
            Consent to receive SMS messages is not a condition of purchase.
          </Typography>

          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
            Message Types
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, mb: 2 }}>
            <li><Typography component="span" sx={{ lineHeight: 1.7 }}>Appointment reminders</Typography></li>
            <li><Typography component="span" sx={{ lineHeight: 1.7 }}>Scheduling updates</Typography></li>
            <li><Typography component="span" sx={{ lineHeight: 1.7 }}>Project status notifications</Typography></li>
            <li><Typography component="span" sx={{ lineHeight: 1.7 }}>Customer support follow-ups</Typography></li>
          </Box>

          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
            Opt-Out
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            You may opt out of SMS communications at any time by replying STOP. After opting out,
            you will no longer receive SMS messages unless you opt in again.
          </Typography>

          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
            Support
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            For help regarding SMS communications, reply HELP or contact the business directly.
          </Typography>

          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
            Limitation
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            We are not responsible for delayed or undelivered messages caused by carrier issues,
            service interruptions, or incorrect contact information provided by the user.
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
            <Link to="/login" style={{ color: 'inherit' }}>Back to login</Link>
            {' · '}
            <Link to="/privacy-policy" style={{ color: 'inherit' }}>Privacy Policy</Link>
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
