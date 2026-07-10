import { createContext, useContext, type ReactNode } from 'react';
import FinancialPinUnlockDialog from '../components/common/FinancialPinUnlockDialog';
import { useFinancialPinLock } from '../hooks/useFinancialPinLock';

type FinancialPinLockContextValue = ReturnType<typeof useFinancialPinLock>;

const FinancialPinLockContext = createContext<FinancialPinLockContextValue | null>(null);

export function FinancialPinLockProvider({ children }: { children: ReactNode }) {
  const value = useFinancialPinLock();

  return (
    <FinancialPinLockContext.Provider value={value}>
      {children}
      <FinancialPinUnlockDialog
        open={value.dialogOpen}
        pinInput={value.pinInput}
        pinError={value.pinError}
        onPinChange={value.setPinInput}
        onSubmit={value.submitPin}
        onClose={value.closeDialog}
      />
    </FinancialPinLockContext.Provider>
  );
}

export function useFinancialPinLockContext() {
  const context = useContext(FinancialPinLockContext);
  if (!context) {
    throw new Error('useFinancialPinLockContext must be used within FinancialPinLockProvider');
  }
  return context;
}
