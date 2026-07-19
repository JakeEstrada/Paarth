import { useCallback, useEffect, useState } from 'react';

export const FINANCIAL_AMOUNTS_PIN = '7212';
const FINANCIAL_AMOUNTS_UNLOCK_KEY = 'financialAmountsUnlockedV1';
export const FINANCIAL_UNLOCK_CHANGED_EVENT = 'financial-unlock-changed';

function readFinancialUnlockFlag() {
  try {
    return sessionStorage.getItem(FINANCIAL_AMOUNTS_UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFinancialUnlockFlag(unlocked: boolean) {
  try {
    sessionStorage.setItem(FINANCIAL_AMOUNTS_UNLOCK_KEY, unlocked ? '1' : '0');
  } catch {
    // Ignore browser storage failures.
  }
}

function notifyFinancialUnlockChanged() {
  window.dispatchEvent(new Event(FINANCIAL_UNLOCK_CHANGED_EVENT));
}

export function useFinancialPinLock() {
  const [unlocked, setUnlocked] = useState(() => readFinancialUnlockFlag());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const syncUnlockedFromStorage = useCallback(() => {
    setUnlocked(readFinancialUnlockFlag());
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === FINANCIAL_AMOUNTS_UNLOCK_KEY) {
        syncUnlockedFromStorage();
      }
    };
    const onUnlockChanged = () => syncUnlockedFromStorage();
    window.addEventListener('storage', onStorage);
    window.addEventListener(FINANCIAL_UNLOCK_CHANGED_EVENT, onUnlockChanged);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(FINANCIAL_UNLOCK_CHANGED_EVENT, onUnlockChanged);
    };
  }, [syncUnlockedFromStorage]);

  const openUnlockDialog = useCallback(() => {
    setPinInput('');
    setPinError('');
    setDialogOpen(true);
  }, []);

  const submitPin = useCallback((pinOverride?: string) => {
    const entered = String(pinOverride ?? pinInput ?? '').trim();
    if (entered === FINANCIAL_AMOUNTS_PIN) {
      writeFinancialUnlockFlag(true);
      setUnlocked(true);
      notifyFinancialUnlockChanged();
      setDialogOpen(false);
      setPinInput('');
      setPinError('');
      return true;
    }
    setPinError('Incorrect PIN');
    return false;
  }, [pinInput]);

  const lockFinancials = useCallback(() => {
    writeFinancialUnlockFlag(false);
    setUnlocked(false);
    notifyFinancialUnlockChanged();
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setPinInput('');
    setPinError('');
  }, []);

  return {
    hideFinancials: !unlocked,
    unlocked,
    dialogOpen,
    pinInput,
    pinError,
    setPinInput,
    openUnlockDialog,
    submitPin,
    lockFinancials,
    closeDialog,
  };
}
