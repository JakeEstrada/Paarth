import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  TextField,
  Typography,
} from '@mui/material';
import { Add as AddIcon, PictureAsPdf as PictureAsPdfIcon } from '@mui/icons-material';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import axios from 'axios';
import toast from 'react-hot-toast';

const DEFAULT_ROWS = 12;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const SUPER = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };

function newRow() {
  return { item: '', qty: '', material: '', description: '' };
}

function formatVerticalFractions(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\b(\d{1,2})\/(\d{1,2})\b/g, (_, num, den) => {
    const top = String(num)
      .split('')
      .map((d) => SUPER[d] || d)
      .join('');
    const bottom = String(den)
      .split('')
      .map((d) => SUB[d] || d)
      .join('');
    return `${top}⁄${bottom}`;
  });
}

function wrapWords(text, maxChars = 28) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const words = raw.split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines.join('\n');
}

function wrapMultilineText(text, maxChars = 28) {
  const raw = String(text || '');
  if (!raw.trim()) return '';
  return raw
    .split('\n')
    .map((line) => wrapWords(line, maxChars))
    .filter((line, idx, arr) => line !== '' || idx < arr.length - 1)
    .join('\n');
}
function enforceStreetWithTrailingNewline(raw) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return '';
  const firstLine = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)[0] || '';
  // Force trailing newline so print/PDF keeps a hard break after street.
  return firstLine ? `${firstLine}\n` : '';
}

function TakeoffSheetPage() {
  const sheetRef = useRef(null);
  const cellRefs = useRef([]);
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [soldToInput, setSoldToInput] = useState('');
  const [pendingFocus, setPendingFocus] = useState(null);
  const [form, setForm] = useState({
    customerId: null,
    soldTo: '',
    phoneNumber: '',
    date: new Date().toLocaleDateString('en-US'),
    nameAddress: '',
    notes: '',
    bay: '',
    rows: Array.from({ length: DEFAULT_ROWS }, () => newRow()),
  });

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoadingCustomers(true);
        const response = await axios.get(`${API_URL}/customers?limit=1000`);
        setCustomers(response.data.customers || response.data || []);
      } catch (error) {
        console.error('Error fetching customers for takeoff sheet:', error);
      } finally {
        setLoadingCustomers(false);
      }
    };
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (!pendingFocus) return;
    const { row, col } = pendingFocus;
    const input = cellRefs.current?.[row]?.[col];
    if (input && typeof input.focus === 'function') {
      input.focus();
      if (typeof input.select === 'function') input.select();
    }
    setPendingFocus(null);
  }, [pendingFocus, form.rows.length]);

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const normalizeNameAddressWrapping = () => {
    setForm((prev) => ({
      ...prev,
      nameAddress: enforceStreetWithTrailingNewline(wrapMultilineText(prev.nameAddress, 30)),
    }));
  };

  const handleSoldToChange = (_, newValue, reason) => {
    if (reason === 'clear') {
      setForm((prev) => ({
        ...prev,
        customerId: null,
        soldTo: '',
      }));
      setSoldToInput('');
      return;
    }
    if (!newValue) return;
    if (typeof newValue === 'string') {
      setForm((prev) => ({ ...prev, customerId: null, soldTo: newValue }));
      setSoldToInput(newValue);
      return;
    }
    const streetLine = wrapWords(newValue.address?.street || '', 30);
    const normalizedName = String(newValue.name || '').trim();
    const addressLine = streetLine || '';
    setForm((prev) => ({
      ...prev,
      customerId: newValue._id,
      soldTo: normalizedName,
      phoneNumber: newValue.primaryPhone || prev.phoneNumber,
      nameAddress: addressLine ? `${addressLine}\n` : '',
    }));
    setSoldToInput(normalizedName);
  };

  const handleSoldToInputChange = (_, value) => {
    setSoldToInput(value);
    setForm((prev) => ({
      ...prev,
      soldTo: value,
      customerId: prev.soldTo.toLowerCase() === value.toLowerCase() ? prev.customerId : null,
    }));
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

  const focusCell = (row, col) => {
    const input = cellRefs.current?.[row]?.[col];
    if (input && typeof input.focus === 'function') {
      input.focus();
      if (typeof input.select === 'function') input.select();
      return true;
    }
    return false;
  };

  const handleGridKeyDown = (event, rowIndex, colIndex) => {
    const totalCols = 4;
    const lastRow = form.rows.length - 1;

    if (event.key === 'Enter') {
      event.preventDefault();
      const nextRow = rowIndex + 1;
      if (nextRow > lastRow) {
        addRow();
        setPendingFocus({ row: form.rows.length, col: 0 });
        return;
      }
      focusCell(nextRow, 0);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const direction = event.shiftKey ? -1 : 1;
      let nextRow = rowIndex;
      let nextCol = colIndex + direction;

      if (nextCol >= totalCols) {
        nextCol = 0;
        nextRow += 1;
      } else if (nextCol < 0) {
        nextCol = totalCols - 1;
        nextRow -= 1;
      }

      if (nextRow < 0) {
        focusCell(0, 0);
        return;
      }
      if (nextRow > lastRow) {
        addRow();
        setPendingFocus({ row: form.rows.length, col: 0 });
        return;
      }
      focusCell(nextRow, nextCol);
    }
  };

  const removeLastRow = () => {
    setForm((prev) => {
      if (prev.rows.length <= 1) return prev;
      return { ...prev, rows: prev.rows.slice(0, -1) };
    });
  };

  const normalizeFractionField = (index, field) => {
    setForm((prev) => ({
      ...prev,
      rows: prev.rows.map((row, i) =>
        i === index ? { ...row, [field]: formatVerticalFractions(row[field]) } : row
      ),
    }));
  };

  const downloadPdf = async () => {
    if (!sheetRef.current) {
      toast.error('Sheet not ready for export');
      return;
    }
    try {
      normalizeNameAddressWrapping();
      await new Promise((resolve) => setTimeout(resolve, 0));
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

  const printPdf = async () => {
    if (!sheetRef.current) {
      toast.error('Sheet not ready for print');
      return;
    }
    try {
      normalizeNameAddressWrapping();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const canvas = await html2canvas(sheetRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const imageData = canvas.toDataURL('image/png');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
      doc.addImage(imageData, 'PNG', 0, 0, 612, 792, undefined, 'FAST');
      const blobUrl = doc.output('bloburl');
      const win = window.open(blobUrl, '_blank');
      if (win) {
        const trigger = () => {
          try {
            win.focus();
            win.print();
          } catch (e) {
            console.warn('Print trigger failed:', e);
          }
        };
        win.onload = trigger;
        setTimeout(trigger, 700);
      }
      toast.success('Print view opened');
    } catch (error) {
      console.error('Error creating printable PDF:', error);
      toast.error('Failed to open print view');
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
                    <Autocomplete
                      freeSolo
                      options={customers}
                      loading={loadingCustomers}
                      value={form.customerId ? customers.find((c) => c._id === form.customerId) || null : null}
                      inputValue={soldToInput}
                      onChange={handleSoldToChange}
                      onInputChange={handleSoldToInputChange}
                      isOptionEqualToValue={(option, value) => String(option?._id) === String(value?._id)}
                      getOptionLabel={(option) =>
                        typeof option === 'string' ? option : option?.name || ''
                      }
                      filterOptions={(options, params) =>
                        options.filter((c) =>
                          (c.name || '').toLowerCase().includes(params.inputValue.toLowerCase())
                        )
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          variant="standard"
                          InputProps={{
                            ...params.InputProps,
                            disableUnderline: true,
                            sx: { fontSize: 16, px: 1, py: 0.7 },
                          }}
                          fullWidth
                        />
                      )}
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
                        value={form.date}
                        onChange={(e) => setField('date', e.target.value)}
                        placeholder="MM/DD/YYYY"
                        InputProps={{
                          disableUnderline: true,
                          sx: { fontSize: 16 },
                          inputProps: { inputMode: 'numeric' },
                        }}
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
                      onBlur={normalizeNameAddressWrapping}
                      multiline
                      minRows={4}
                      InputProps={{
                        disableUnderline: true,
                        sx: { fontSize: 15, px: 1, py: 0.7 },
                      }}
                      inputProps={{
                        style: {
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'break-word',
                        },
                      }}
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
                  <Box
                    sx={{
                      borderRight: '1px solid #000',
                      textAlign: 'center',
                      py: 0.68,
                      fontSize: 15,
                      lineHeight: 1,
                    }}
                  >
                    MATERIALS
                  </Box>
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
                      minHeight: 52,
                    }}
                  >
                    <Box sx={{ borderRight: '1px solid #000' }}>
                      <TextField
                        variant="standard"
                        value={row.item}
                        onChange={(e) => setRowField(index, 'item', e.target.value)}
                        onBlur={() => normalizeFractionField(index, 'item')}
                        onKeyDown={(e) => handleGridKeyDown(e, index, 0)}
                        inputRef={(el) => {
                          if (!cellRefs.current[index]) cellRefs.current[index] = [];
                          cellRefs.current[index][0] = el;
                        }}
                        InputProps={{
                          disableUnderline: true,
                          sx: {
                            fontSize: 14,
                            px: 1,
                            py: 0.95,
                            lineHeight: 1.35,
                          },
                        }}
                        inputProps={{
                          style: {
                            lineHeight: 1.35,
                            paddingBottom: 4,
                          },
                        }}
                        fullWidth
                      />
                    </Box>
                    <Box sx={{ borderRight: '1px solid #000' }}>
                      <TextField
                        variant="standard"
                        value={row.qty}
                        onChange={(e) => setRowField(index, 'qty', e.target.value)}
                        onBlur={() => normalizeFractionField(index, 'qty')}
                        onKeyDown={(e) => handleGridKeyDown(e, index, 1)}
                        inputRef={(el) => {
                          if (!cellRefs.current[index]) cellRefs.current[index] = [];
                          cellRefs.current[index][1] = el;
                        }}
                        InputProps={{
                          disableUnderline: true,
                          sx: {
                            fontSize: 14,
                            px: 1,
                            py: 0.95,
                            lineHeight: 1.35,
                          },
                        }}
                        inputProps={{
                          style: {
                            lineHeight: 1.35,
                            paddingBottom: 4,
                          },
                        }}
                        fullWidth
                      />
                    </Box>
                    <Box sx={{ borderRight: '1px solid #000' }}>
                      <TextField
                        variant="standard"
                        value={row.material}
                        onChange={(e) => setRowField(index, 'material', e.target.value)}
                        onBlur={() => normalizeFractionField(index, 'material')}
                        onKeyDown={(e) => handleGridKeyDown(e, index, 2)}
                        inputRef={(el) => {
                          if (!cellRefs.current[index]) cellRefs.current[index] = [];
                          cellRefs.current[index][2] = el;
                        }}
                        InputProps={{
                          disableUnderline: true,
                          sx: {
                            fontSize: 14,
                            px: 1,
                            py: 0.95,
                            lineHeight: 1.35,
                          },
                        }}
                        inputProps={{
                          style: {
                            lineHeight: 1.35,
                            paddingBottom: 4,
                          },
                        }}
                        fullWidth
                      />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                      <TextField
                        variant="standard"
                        value={row.description}
                        onChange={(e) => setRowField(index, 'description', e.target.value)}
                        onBlur={() => normalizeFractionField(index, 'description')}
                        onKeyDown={(e) => handleGridKeyDown(e, index, 3)}
                        inputRef={(el) => {
                          if (!cellRefs.current[index]) cellRefs.current[index] = [];
                          cellRefs.current[index][3] = el;
                        }}
                        InputProps={{
                          disableUnderline: true,
                          sx: {
                            fontSize: 14,
                            px: 1,
                            py: 0.95,
                            lineHeight: 1.35,
                          },
                        }}
                        inputProps={{
                          style: {
                            lineHeight: 1.35,
                            paddingBottom: 4,
                          },
                        }}
                        fullWidth
                      />
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
            <Button variant="outlined" color="error" onClick={removeLastRow} disabled={form.rows.length <= 1}>
              Delete row
            </Button>
            <Button variant="contained" startIcon={<PictureAsPdfIcon />} onClick={downloadPdf}>
              Download PDF
            </Button>
            <Button variant="outlined" onClick={printPdf}>
              Print PDF
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
