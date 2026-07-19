import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  useTheme,
} from '@mui/material';

type FinancialPinUnlockDialogProps = {
  open: boolean;
  pinInput: string;
  pinError?: string;
  onPinChange: (value: string) => void;
  onSubmit: (pinOverride?: string) => void;
  onClose: () => void;
};

/** PIN dialog — must stack above JobDetailModal and other nested modals. */
export default function FinancialPinUnlockDialog({
  open,
  pinInput,
  pinError = '',
  onPinChange,
  onSubmit,
  onClose,
}: FinancialPinUnlockDialogProps) {
  const theme = useTheme();
  const dialogZIndex = theme.zIndex.modal + 2000;

  const handleSubmit = (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    onSubmit();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      disableRestoreFocus
      slotProps={{
        root: {
          sx: { zIndex: dialogZIndex },
        },
        backdrop: {
          sx: { zIndex: dialogZIndex - 1 },
        },
      }}
    >
      <form onSubmit={handleSubmit}>
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
            error={Boolean(pinError)}
            helperText={pinError || ' '}
          />
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="contained">
            Unlock
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
