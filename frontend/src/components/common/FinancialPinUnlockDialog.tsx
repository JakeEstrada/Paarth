import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';

type FinancialPinUnlockDialogProps = {
  open: boolean;
  pinInput: string;
  pinError?: string;
  onPinChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export default function FinancialPinUnlockDialog({
  open,
  pinInput,
  pinError = '',
  onPinChange,
  onSubmit,
  onClose,
}: FinancialPinUnlockDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Unlock financial amounts</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Enter the PIN to view job totals and pipeline stage amounts.
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          label="PIN"
          type="password"
          inputMode="numeric"
          value={pinInput}
          onChange={(e) => onPinChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
          }}
          error={Boolean(pinError)}
          helperText={pinError || ' '}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSubmit}>
          Unlock
        </Button>
      </DialogActions>
    </Dialog>
  );
}
