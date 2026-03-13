import { Box, Container, Paper, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
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
            Privacy Policy
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Last updated: March 2026
          </Typography>

          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            LIT-SCWW and San Clemente Woodworking may collect personal information such as your
            name, phone number, email address, and project details when you request a quote,
            schedule a service, or communicate with us.
          </Typography>

          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            This information is used to provide customer service, schedule and manage staircase
            projects, send service-related updates, and improve our operations.
          </Typography>

          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            We may use your phone number to send SMS notifications related to your project,
            including scheduling updates, reminders, and customer support communications.
          </Typography>

          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            SMS consent is not shared with third parties or affiliates for marketing purposes.
          </Typography>

          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            We do not sell your personal information. We may store submitted information in
            internal software systems used to manage quotes, scheduling, customer communication,
            and project records.
          </Typography>

          <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.7 }}>
            If you would like to request updates or removal of your information, please contact us
            through our business contact channels.
          </Typography>

          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
            Information We Collect
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, mb: 2 }}>
            <li><Typography component="span" sx={{ lineHeight: 1.7 }}>Name</Typography></li>
            <li><Typography component="span" sx={{ lineHeight: 1.7 }}>Phone number</Typography></li>
            <li><Typography component="span" sx={{ lineHeight: 1.7 }}>Email address</Typography></li>
            <li><Typography component="span" sx={{ lineHeight: 1.7 }}>Project or service details</Typography></li>
            <li><Typography component="span" sx={{ lineHeight: 1.7 }}>Scheduling and communication records</Typography></li>
          </Box>

          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
            How We Use Information
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, mb: 2 }}>
            <li><Typography component="span" sx={{ lineHeight: 1.7 }}>Provide quotes and customer service</Typography></li>
            <li><Typography component="span" sx={{ lineHeight: 1.7 }}>Schedule installations and appointments</Typography></li>
            <li><Typography component="span" sx={{ lineHeight: 1.7 }}>Send job-related SMS notifications</Typography></li>
            <li><Typography component="span" sx={{ lineHeight: 1.7 }}>Maintain internal project and customer records</Typography></li>
          </Box>

          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
            SMS Disclosure
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            By providing your phone number, you agree to receive SMS messages related to your
            service request or project. Message frequency varies. Message and data rates may apply.
            Reply STOP to opt out. Reply HELP for help.
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
            <Link to="/login" style={{ color: 'inherit' }}>Back to login</Link>
            {' · '}
            <Link to="/terms" style={{ color: 'inherit' }}>Terms and Conditions</Link>
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
