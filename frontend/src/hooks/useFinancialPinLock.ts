import { useCallback, useEffect, useState } from 'react';

export const FINANCIAL_AMOUNTS_PIN = '7212';
const FINANCIAL_AMOUNTS_UNLOCK_KEY = 'financialAmountsUnlockedV1';

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

export function useFinancialPinLock() {
  const [unlocked, setUnlocked] = useState(() => readFinancialUnlockFlag());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === FINANCIAL_AMOUNTS_UNLOCK_KEY) {
        setUnlocked(readFinancialUnlockFlag());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const openUnlockDialog = useCallback(() => {
    setPinInput('');
    setPinError('');
    setDialogOpen(true);
  }, []);

  const submitPin = useCallback(() => {
    if (pinInput.trim() === FINANCIAL_AMOUNTS_PIN) {
      writeFinancialUnlockFlag(true);
      setUnlocked(true);
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
