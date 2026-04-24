import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Box, Button, Chip, CircularProgress, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import {
  AccountBalance as AccountBalanceIcon,
  LinkOff as LinkOffIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { openPlaidLink } from '../../utils/plaidLink';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const LINK_ROLES = new Set(['super_admin', 'admin', 'manager']);

function PlaidBankLinkSection({ active, variant = 'default', onRefreshData }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);

  const canManage = user && LINK_ROLES.has(user.role);
  const menuOpen = Boolean(menuAnchorEl);
  const linked = Boolean(status?.linked);

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

  const handleOpenMenu = (event) => setMenuAnchorEl(event.currentTarget);
  const handleCloseMenu = () => setMenuAnchorEl(null);

  const handleMenuConnect = async () => {
    handleCloseMenu();
    await handleStartLink();
  };

  const handleMenuDisconnect = async () => {
    handleCloseMenu();
    await handleDisconnect();
  };

  const handleMenuRefreshData = async () => {
    handleCloseMenu();
    if (typeof onRefreshData !== 'function') return;
    try {
      setBusy(true);
      await onRefreshData();
      toast.success('Pulled latest Plaid register data');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e?.message || 'Failed to refresh register data');
    } finally {
      setBusy(false);
    }
  };

  if (!active) return null;

  const headline = !status?.configured
    ? 'Plaid unavailable'
    : !linked
      ? 'Plaid: No bank linked'
      : `Plaid: ${status.institutionName || 'Linked'}${status.linkedAt ? ` · ${new Date(status.linkedAt).toLocaleString()}` : ''}`;

  if (variant === 'titleRight') {

    return (
      <Box sx={{ mt: 0, minWidth: 0, width: '100%' }}>
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
            <CircularProgress size={18} />
            <Typography variant="caption" color="text.secondary">
              Plaid…
            </Typography>
          </Box>
        )}

        {!loading && status && !status.configured && (
          <Typography variant="caption" color="text.secondary" display="block" textAlign="right">
            Plaid not configured on server
          </Typography>
        )}

        {!loading && status?.configured && !canManage && (
          <Typography variant="caption" color="text.secondary" display="block" textAlign="right">
            Bank link managed by an admin
          </Typography>
        )}

        {!loading && status?.configured && canManage && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 0.5 }}>
            <Box sx={{ textAlign: 'right' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.75, flexWrap: 'wrap' }}>
                {status.environment ? (
                  <Chip
                    size="small"
                    label={status.environment}
                    variant="outlined"
                    sx={{ textTransform: 'capitalize' }}
                  />
                ) : null}
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.35 }}>
                  {headline}
                </Typography>
              </Box>
            </Box>
            <Tooltip title="Plaid settings">
              <span>
                <IconButton size="small" onClick={handleOpenMenu} disabled={busy}>
                  <SettingsIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Menu anchorEl={menuAnchorEl} open={menuOpen} onClose={handleCloseMenu}>
              {linked ? (
                <MenuItem onClick={handleMenuRefreshData} disabled={busy}>
                  <RefreshIcon fontSize="small" sx={{ mr: 1 }} />
                  Refresh latest data
                </MenuItem>
              ) : null}
              {!linked ? (
                <MenuItem onClick={handleMenuConnect} disabled={busy}>
                  {busy ? 'Opening...' : 'Connect account'}
                </MenuItem>
              ) : null}
              {linked ? (
                <MenuItem onClick={handleMenuDisconnect} disabled={busy}>
                  Disconnect account
                </MenuItem>
              ) : null}
            </Menu>
          </Box>
        )}
      </Box>
    );
  }

  const isCompact = variant === 'compact';

  return (
    <Box sx={{ mt: isCompact ? 0 : 2 }}>
      {!isCompact && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <AccountBalanceIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Plaid (bank connection)
          </Typography>
          {status?.environment && (
            <Chip size="small" label={status.environment} variant="outlined" sx={{ textTransform: 'capitalize' }} />
          )}
        </Box>
      )}

      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: isCompact ? 0.25 : 1 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Checking Plaid status…
          </Typography>
        </Box>
      )}

      {!loading && status && !status.configured && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: isCompact ? 0.5 : 1 }}>
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
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                flexWrap: 'wrap',
                mb: isCompact ? 0 : 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
                {isCompact && <AccountBalanceIcon color="primary" sx={{ fontSize: 20 }} />}
                {isCompact && status?.environment && (
                  <Chip size="small" label={status.environment} variant="outlined" sx={{ textTransform: 'capitalize' }} />
                )}
                <Typography variant={isCompact ? 'caption' : 'body2'} color="text.secondary" sx={{ lineHeight: 1.4 }}>
                  <Box component="span" sx={{ color: 'text.primary', fontWeight: 500 }}>
                    Plaid
                  </Box>
                  {status.institutionName ? `: ${status.institutionName}` : ': Linked'}
                  {status.linkedAt ? (
                    <Box component="span" sx={{ color: 'text.secondary', ml: 0.5 }}>
                      · {new Date(status.linkedAt).toLocaleString()}
                    </Box>
                  ) : null}
                </Typography>
              </Box>
              <Button
                variant="outlined"
                color="warning"
                size={isCompact ? 'small' : 'medium'}
                startIcon={<LinkOffIcon />}
                onClick={handleDisconnect}
                disabled={busy}
              >
                {isCompact ? 'Disconnect' : 'Disconnect bank'}
              </Button>
            </Box>
          ) : (
            <Box sx={{ mb: isCompact ? 0 : 1 }}>
              {!isCompact && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Connect a bank account through Plaid (sandbox or production depends on{' '}
                  <code>PLAID_ENV</code> on the server). You can reconnect to replace the current link.
                </Typography>
              )}
              {isCompact && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                  {status?.environment && (
                    <Chip size="small" label={status.environment} variant="outlined" sx={{ textTransform: 'capitalize' }} />
                  )}
                  <Typography variant="caption" color="text.secondary">
                    No bank linked yet.
                  </Typography>
                </Box>
              )}
              <Button variant="contained" size={isCompact ? 'small' : 'medium'} onClick={handleStartLink} disabled={busy}>
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
