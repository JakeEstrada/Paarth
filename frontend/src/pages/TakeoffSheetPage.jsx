import { useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, PictureAsPdf as PictureAsPdfIcon } from '@mui/icons-material';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import toast from 'react-hot-toast';

const DEFAULT_ROWS = 12;

function newRow() {
  return { item: '', qty: '', material: '', description: '' };
}

function TakeoffSheetPage() {
  const sheetRef = useRef(null);
  const [form, setForm] = useState({
    soldTo: '',
    phoneNumber: '',
    date: new Date().toISOString().slice(0, 10),
    nameAddress: '',
    notes: '',
    bay: '',
    rows: Array.from({ length: DEFAULT_ROWS }, () => newRow()),
  });

  const printableDate = useMemo(() => {
    if (!form.date) return '';
    const d = new Date(`${form.date}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return form.date;
    return d.toLocaleDateString('en-US');
  }, [form.date]);

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const setRowField = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      rows: prev.rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    }));
  };

  const addRow = () => {
    setForm((prev) => ({ ...prev, rows: [...prev.rows, newRow()] }));
  };

  const removeRow = (index) => {
    setForm((prev) => ({
      ...prev,
      rows: prev.rows.filter((_, i) => i !== index),
    }));
  };

  const downloadPdf = async () => {
    if (!sheetRef.current) {
      toast.error('Sheet not ready for export');
      return;
    }
    try {
      const canvas = await html2canvas(sheetRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const imageData = canvas.toDataURL('image/png');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
      doc.addImage(imageData, 'PNG', 0, 0, 612, 792, undefined, 'FAST');
      doc.save(`Takeoff-Sheet-${form.soldTo || 'untitled'}.pdf`);
      toast.success('Take Off Sheet PDF downloaded');
    } catch (error) {
      console.error('Error generating takeoff PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h1" sx={{ mb: 1 }}>
          Take Off Sheet
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Type directly into the sheet and export the exact layout to PDF.
        </Typography>
      </Box>

      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Box
              ref={sheetRef}
              sx={{
                width: 816,
                minHeight: 1056,
                mx: 'auto',
                bgcolor: '#fff',
                color: '#000',
                p: 5,
                border: '1px solid #d9d9d9',
                fontFamily: 'Times New Roman, Georgia, serif',
              }}
            >
              <Box sx={{ position: 'relative', mb: 2 }}>
                <Typography
                  sx={{
                    textAlign: 'center',
                    fontSize: 44,
                    fontWeight: 400,
                    lineHeight: 1,
                    mt: 2,
                    mb: 2,
                  }}
                >
                  Take Off Sheet
                </Typography>
                <Box
                  component="img"
                  src="/logo.png"
                  alt="Logo"
                  sx={{
                    position: 'absolute',
                    top: 0,
                    right: 6,
                    width: 54,
                    height: 54,
                    objectFit: 'contain',
                  }}
                />
              </Box>

              <Box sx={{ border: '1px solid #000' }}>
                {/* Row: SOLD TO / PHONE NUMBER / DATE */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '37% 25% 38%' }}>
                  <Box sx={{ borderRight: '1px solid #000' }}>
                    <Box sx={{ bgcolor: '#c2dff6', borderBottom: '1px solid #000', textAlign: 'center', py: 0.4, fontSize: 19 }}>
                      SOLD TO
                    </Box>
                    <TextField
                      variant="standard"
                      value={form.soldTo}
                      onChange={(e) => setField('soldTo', e.target.value)}
                      InputProps={{ disableUnderline: true, sx: { fontSize: 16, px: 1, py: 0.7 } }}
                      fullWidth
                    />
                  </Box>
                  <Box sx={{ borderRight: '1px solid #000' }}>
                    <Box sx={{ bgcolor: '#c2dff6', borderBottom: '1px solid #000', textAlign: 'center', py: 0.4, fontSize: 19 }}>
                      PHONE NUMBER
                    </Box>
                    <TextField
                      variant="standard"
                      value={form.phoneNumber}
                      onChange={(e) => setField('phoneNumber', e.target.value)}
                      InputProps={{ disableUnderline: true, sx: { fontSize: 16, px: 1, py: 0.7 } }}
                      fullWidth
                    />
                  </Box>
                  <Box>
                    <Box sx={{ bgcolor: '#c2dff6', borderBottom: '1px solid #000', textAlign: 'center', py: 0.4, fontSize: 19 }}>
                      DATE
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 0.6 }}>
                      <TextField
                        variant="standard"
                        type="date"
                        value={form.date}
                        onChange={(e) => setField('date', e.target.value)}
                        InputProps={{ disableUnderline: true, sx: { fontSize: 16 } }}
                      />
                    </Box>
                  </Box>
                </Box>

                {/* Row: NAME & ADDRESS / NOTES / Bay */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '37% 51% 12%', borderTop: '1px solid #000' }}>
                  <Box sx={{ borderRight: '1px solid #000' }}>
                    <Box sx={{ bgcolor: '#c2dff6', borderBottom: '1px solid #000', textAlign: 'center', py: 0.4, fontSize: 19 }}>
                      NAME & ADDRESS
                    </Box>
                    <TextField
                      variant="standard"
                      value={form.nameAddress}
                      onChange={(e) => setField('nameAddress', e.target.value)}
                      multiline
                      minRows={4}
                      InputProps={{ disableUnderline: true, sx: { fontSize: 15, px: 1, py: 0.7 } }}
                      fullWidth
                    />
                  </Box>
                  <Box sx={{ borderRight: '1px solid #000' }}>
                    <Box sx={{ bgcolor: '#c2dff6', borderBottom: '1px solid #000', textAlign: 'center', py: 0.4, fontSize: 19 }}>
                      NOTES
                    </Box>
                    <TextField
                      variant="standard"
                      value={form.notes}
                      onChange={(e) => setField('notes', e.target.value)}
                      multiline
                      minRows={4}
                      InputProps={{ disableUnderline: true, sx: { fontSize: 15, px: 1, py: 0.7 } }}
                      fullWidth
                    />
                  </Box>
                  <Box>
                    <Box sx={{ bgcolor: '#c2dff6', borderBottom: '1px solid #000', textAlign: 'center', py: 0.4, fontSize: 19 }}>
                      Bay
                    </Box>
                    <TextField
                      variant="standard"
                      value={form.bay}
                      onChange={(e) => setField('bay', e.target.value)}
                      InputProps={{ disableUnderline: true, sx: { fontSize: 15, px: 1, py: 0.7 } }}
                      fullWidth
                    />
                  </Box>
                </Box>

                {/* Header row: ITEM / QTY / MATERIAL / DESCRIPTION */}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '37% 12% 12% 39%',
                    borderTop: '1px solid #000',
                    bgcolor: '#c2dff6',
                  }}
                >
                  <Box sx={{ borderRight: '1px solid #000', textAlign: 'center', py: 0.45, fontSize: 24 }}>ITEM</Box>
                  <Box sx={{ borderRight: '1px solid #000', textAlign: 'center', py: 0.45, fontSize: 24 }}>QTY</Box>
                  <Box sx={{ borderRight: '1px solid #000', textAlign: 'center', py: 0.45, fontSize: 24 }}>MATERIAL</Box>
                  <Box sx={{ textAlign: 'center', py: 0.45, fontSize: 24 }}>DESCRIPTION</Box>
                </Box>

                {/* Body rows */}
                {form.rows.map((row, index) => (
                  <Box
                    key={`takeoff-row-${index}`}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '37% 12% 12% 39%',
                      borderTop: '1px solid #000',
                      minHeight: 46,
                    }}
                  >
                    <Box sx={{ borderRight: '1px solid #000' }}>
                      <TextField
                        variant="standard"
                        value={row.item}
                        onChange={(e) => setRowField(index, 'item', e.target.value)}
                        InputProps={{ disableUnderline: true, sx: { fontSize: 14, px: 1, py: 0.7 } }}
                        fullWidth
                      />
                    </Box>
                    <Box sx={{ borderRight: '1px solid #000' }}>
                      <TextField
                        variant="standard"
                        value={row.qty}
                        onChange={(e) => setRowField(index, 'qty', e.target.value)}
                        InputProps={{ disableUnderline: true, sx: { fontSize: 14, px: 1, py: 0.7 } }}
                        fullWidth
                      />
                    </Box>
                    <Box sx={{ borderRight: '1px solid #000' }}>
                      <TextField
                        variant="standard"
                        value={row.material}
                        onChange={(e) => setRowField(index, 'material', e.target.value)}
                        InputProps={{ disableUnderline: true, sx: { fontSize: 14, px: 1, py: 0.7 } }}
                        fullWidth
                      />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                      <TextField
                        variant="standard"
                        value={row.description}
                        onChange={(e) => setRowField(index, 'description', e.target.value)}
                        InputProps={{ disableUnderline: true, sx: { fontSize: 14, px: 1, py: 0.7 } }}
                        fullWidth
                      />
                      <IconButton size="small" onClick={() => removeRow(index)} disabled={form.rows.length <= 1}>
                        <DeleteIcon fontSize="inherit" />
                      </IconButton>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
            <Button startIcon={<AddIcon />} onClick={addRow}>
              Add row
            </Button>
            <Button variant="contained" startIcon={<PictureAsPdfIcon />} onClick={downloadPdf}>
              Download PDF
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Export uses the on-screen layout, so the PDF matches what users type.
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
}

export default TakeoffSheetPage;
