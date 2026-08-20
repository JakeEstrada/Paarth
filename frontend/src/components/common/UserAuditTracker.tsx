import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { beginAuditLocation } from '../../utils/auditLocation';
import { flushUserAuditLogs, trackClick, trackPageView } from '../../utils/userAuditTracker';

const CLICKABLE =
  'a, button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], .MuiButtonBase-root, .MuiChip-root';

function clickLabel(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return aria.trim();
  const title = el.getAttribute('title');
  if (title?.trim()) return title.trim();
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (text) return text;
  const name = el.getAttribute('name');
  if (name?.trim()) return name.trim();
  return '';
}

export default function UserAuditTracker() {
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!user) return;
    beginAuditLocation();
    trackPageView(location.pathname, location.search);
  }, [user, location.pathname, location.search]);

  useEffect(() => {
    if (!user) return undefined;

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('[data-audit-ignore]')) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const clickable = target.closest(CLICKABLE);
      if (!clickable) return;
      const label = clickLabel(clickable);
      if (!label) return;
      trackClick(label, window.location.pathname, window.location.search);
    };

    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        void flushUserAuditLogs();
      }
    };
    const onPageHide = () => {
      void flushUserAuditLogs();
    };

    document.addEventListener('click', onClick, true);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onHide);
      void flushUserAuditLogs();
    };
  }, [user]);

  return null;
}
