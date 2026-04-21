import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Box, Button, Chip, CircularProgress, Typography } from '@mui/material';
import { AccountBalance as AccountBalanceIcon, LinkOff as LinkOffIcon } from '@mui/icons-material';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { openPlaidLink } from '../../utils/plaidLink';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const LINK_ROLES = new Set(['super_admin', 'admin', 'manager']);

function PlaidBankLinkSection({ active }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const canManage = user && LINK_ROLES.has(user.role);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get(`${API_URL}/plaid/status`);
      setStatus(data);
    } catch (e) {
      console.error(e);
      setStatus(null);
      toast.error(e.response?.data?.error || 'Could not load Plaid status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    loadStatus();
  }, [active, loadStatus]);

  const handleStartLink = async () => {
    if (!canManage) return;
    try {
      setBusy(true);
      const { data } = await axios.post(`${API_URL}/plaid/link-token`);
      if (!data?.link_token) {
        toast.error('No link token returned');
        return;
      }
      await openPlaidLink({
        linkToken: data.link_token,
        onSuccess: async (public_token, metadata) => {
          try {
            await axios.post(`${API_URL}/plaid/exchange-public-token`, {
              public_token,
              institution_id: metadata?.institution?.institution_id,
              institution_name: metadata?.institution?.name,
            });
            toast.success('Bank account linked with Plaid');
            await loadStatus();
          } catch (e) {
            console.error(e);
            toast.error(e.response?.data?.error || 'Failed to complete Plaid link');
          }
        },
        onExit: () => {},
      });
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.error || e.message || 'Could not start Plaid Link');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!canManage) return;
    const ok = window.confirm('Disconnect this bank from Plaid for your organization?');
    if (!ok) return;
    try {
      setBusy(true);
      await axios.post(`${API_URL}/plaid/disconnect`);
      toast.success('Plaid bank disconnected');
      await loadStatus();
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.error || 'Failed to disconnect');
    } finally {
      setBusy(false);
    }
  };

  if (!active) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <AccountBalanceIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Plaid (bank connection)
        </Typography>
        {status?.environment && (
          <Chip size="small" label={status.environment} variant="outlined" sx={{ textTransform: 'capitalize' }} />
        )}
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Checking Plaid status…
          </Typography>
        </Box>
      )}

      {!loading && status && !status.configured && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Server is missing Plaid credentials. In <strong>backend/.env</strong> set{' '}
          <code>PLAID_CLIENT_ID</code>, then either <code>SANDBOX_SECRET</code> (recommended for testing) or set{' '}
          <code>PLAID_ENV=production</code> with <code>PRODUCTION_SECRET</code>. Optionally set{' '}
          <code>PLAID_CLIENT_NAME</code> for the name shown in Link. Restart the API after saving.
        </Typography>
      )}

      {!loading && status?.configured && !canManage && (
        <Typography variant="body2" color="text.secondary">
          Only admins or managers can connect or disconnect the organization bank via Plaid.
        </Typography>
      )}

      {!loading && status?.configured && canManage && (
        <>
          {status.linked ? (
            <Box sx={{ mb: 1 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Linked{status.institutionName ? `: ${status.institutionName}` : ''}.
                {status.linkedAt && (
                  <Box component="span" sx={{ color: 'text.secondary', ml: 0.5 }}>
                    ({new Date(status.linkedAt).toLocaleString()})
                  </Box>
                )}
              </Typography>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<LinkOffIcon />}
                onClick={handleDisconnect}
                disabled={busy}
              >
                Disconnect bank
              </Button>
            </Box>
          ) : (
            <Box sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Connect a bank account through Plaid (sandbox or production depends on{' '}
                <code>PLAID_ENV</code> on the server). You can reconnect to replace the current link.
              </Typography>
              <Button variant="contained" onClick={handleStartLink} disabled={busy}>
                {busy ? 'Opening…' : 'Connect bank with Plaid'}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export default PlaidBankLinkSection;
