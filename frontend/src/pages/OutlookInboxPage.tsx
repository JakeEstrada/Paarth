/**
 * OutlookInboxPage — kept for /outlook bookmarks; App redirects to Messages → Team Inbox.
 */
import { Container } from '@mui/material';
import TeamInboxPanel from '../components/messages/TeamInboxPanel';

export default function OutlookInboxPage() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <TeamInboxPanel />
    </Container>
  );
}
