import FinancialPinUnlockDialog from './FinancialPinUnlockDialog';
import { useFinancialPinLockContext } from '../../context/FinancialPinLockContext';

/** Renders the shared PIN dialog wherever `FinancialPinLockProvider` is mounted. */
export default function FinancialPinUnlockDialogHost() {
  const financialPin = useFinancialPinLockContext();

  return (
    <FinancialPinUnlockDialog
      open={financialPin.dialogOpen}
      pinInput={financialPin.pinInput}
      pinError={financialPin.pinError}
      onPinChange={financialPin.setPinInput}
      onSubmit={financialPin.submitPin}
      onClose={financialPin.closeDialog}
    />
  );
}
