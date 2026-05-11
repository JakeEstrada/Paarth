import { useCallback, useEffect, useMemo, useState } from 'react';

export const SHOP_VIEW_SENSITIVE_PIN = '2217';
const SHOP_VIEW_SENSITIVE_KEY = 'shopViewSensitiveUnlockedV1';

function readSensitiveUnlockFlag() {
  try {
    return localStorage.getItem(SHOP_VIEW_SENSITIVE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSensitiveUnlockFlag(unlocked) {
  try {
    localStorage.setItem(SHOP_VIEW_SENSITIVE_KEY, unlocked ? '1' : '0');
  } catch {
    // Ignore browser storage failures.
  }
}

export function useShopViewSensitive(userRole) {
  const isShopViewRole = userRole === 'shop_view';
  const [sensitiveUnlocked, setSensitiveUnlockedState] = useState(() =>
    isShopViewRole ? readSensitiveUnlockFlag() : true
  );

  useEffect(() => {
    if (!isShopViewRole) {
      setSensitiveUnlockedState(true);
      return;
    }
    setSensitiveUnlockedState(readSensitiveUnlockFlag());
  }, [isShopViewRole]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === SHOP_VIEW_SENSITIVE_KEY) {
        setSensitiveUnlockedState(readSensitiveUnlockFlag());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setSensitiveUnlocked = useCallback((next) => {
    writeSensitiveUnlockFlag(Boolean(next));
    setSensitiveUnlockedState(Boolean(next));
  }, []);

  const hideSensitive = useMemo(
    () => isShopViewRole && !sensitiveUnlocked,
    [isShopViewRole, sensitiveUnlocked]
  );

  return {
    isShopViewRole,
    sensitiveUnlocked,
    hideSensitive,
    setSensitiveUnlocked,
  };
}
