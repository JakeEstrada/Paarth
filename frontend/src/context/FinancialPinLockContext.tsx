import { createContext, useContext, type ReactNode } from 'react';
import { useFinancialPinLock } from '../hooks/useFinancialPinLock';

type FinancialPinLockContextValue = ReturnType<typeof useFinancialPinLock>;

const FinancialPinLockContext = createContext<FinancialPinLockContextValue | null>(null);

export function FinancialPinLockProvider({ children }: { children: ReactNode }) {
  const value = useFinancialPinLock();

  return (
    <FinancialPinLockContext.Provider value={value}>
      {children}
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
