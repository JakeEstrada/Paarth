import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  TextField,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import { Add as AddIcon, Close as CloseIcon, DeleteOutline as DeleteOutlineIcon } from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const COMPANY_PHONE = '(951)491-1137';
const COMPANY_EMAIL = 'office@sanclementewoodworking.com';
const COMPANY_WEBSITE = 'www.sanclementewoodworking.com';

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildCustomerAddress(job) {
  const ja = job?.jobAddress;
  if (ja && (ja.street || ja.city || ja.state || ja.zip)) {
    return {
      street: String(ja.street || '').trim(),
      city: [ja.city, ja.state, ja.zip].filter(Boolean).join(', '),
    };
  }
  const c = job?.customerId?.address;
  return {
    street: String(c?.street || '').trim(),
    city: [c?.city, c?.state, c?.zip].filter(Boolean).join(', ') || '',
  };
}

const emptyRow = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  itemName: '',
  description: '',
  quantity: 1,
  unitPrice: '',
  total: '',
});

function mapEstimateLinesToForm(estimate) {
  const items = estimate?.lineItems;
  if (!Array.isArray(items) || items.length === 0) {
    return [emptyRow()];
  }
  return items.map((li) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    itemName: String(li.itemName || ''),
    description: String(li.description || ''),
    quantity: li.quantity != null && li.quantity !== '' ? li.quantity : 1,
    unitPrice: li.unitPrice != null && li.unitPrice !== '' ? li.unitPrice : '',
    total: li.total != null && li.total !== '' ? li.total : '',
  }));
}

function computePreviewTotals(lineItems, taxRate, discountAmount) {
  const subtotal = lineItems.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
  const tr = Number(taxRate) || 0;
  const taxAmount = subtotal * (tr / 100);
  const disc = Number(discountAmount) || 0;
  const grandTotal = Math.round((subtotal + taxAmount - disc + Number.EPSILON) * 100) / 100;
  return {
    subtotal: Math.round((subtotal + Number.EPSILON) * 100) / 100,
    taxAmount: Math.round((taxAmount + Number.EPSILON) * 100) / 100,
    discountAmount: Math.round((disc + Number.EPSILON) * 100) / 100,
    grandTotal,
  };
}

function mapLinesForApi(rows) {
  return rows.map((r) => ({
    itemName: String(r.itemName || '').trim(),
    description: String(r.description || '').trim(),
    quantity: Number(r.quantity) || 0,
    unitPrice: Number(r.unitPrice) || 0,
    total: Number(r.total) || 0,
  }));
}

export default function JobChangeOrderDialog({ open, onClose, job, onCreated }) {
  const changeOrderCanvasRef = useRef(null);
  const [isCoExportMode, setIsCoExportMode] = useState(false);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [estimateDoc, setEstimateDoc] = useState(null);
  const [lineItems, setLineItems] = useState([emptyRow()]);
  const [taxRate, setTaxRate] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [footerNote, setFooterNote] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [coDate, setCoDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assignedCoNumber, setAssignedCoNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState({ street: '', city: '' });

  useEffect(() => {
    if (!open || !job?._id) return;
    let cancelled = false;
    setLoadingEstimate(true);
    setEstimateDoc(null);
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/estimates`, { params: { jobId: job._id } });
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data?.estimates || [];
        setEstimateDoc(list[0] || null);
      } catch (e) {
        if (!cancelled) {
          setEstimateDoc(null);
          toast.error(e.response?.data?.error || 'Failed to load estimate');
        }
      } finally {
        if (!cancelled) setLoadingEstimate(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, job?._id]);

  useEffect(() => {
    if (!open) {
      setAssignedCoNumber('');
      return;
    }
    setCoDate(new Date().toISOString().slice(0, 10));
  }, [open]);

  useEffect(() => {
    if (!open || !estimateDoc || !job) return;
    setLineItems(mapEstimateLinesToForm(estimateDoc));
    setTaxRate(Number(estimateDoc.taxRate) || 0);
    setDiscountAmount(Number(estimateDoc.discountAmount) || 0);
    setFooterNote(
      String(estimateDoc.footerNote || '').trim() ||
        'Customer acknowledges paint and stain are not included.'
    );
    setNotes('');
    setAssignedCoNumber('');
    const addr = buildCustomerAddress(job);
    setCustomerName(String(job.customerId?.name || '').trim());
    setCustomerAddress(addr);
  }, [open, estimateDoc?._id, job?._id]);

  const previewTotals = useMemo(
    () => computePreviewTotals(lineItems, taxRate, discountAmount),
    [lineItems, taxRate, discountAmount]
  );

  const coGrandDisplay = previewTotals.grandTotal.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const updateRow = (id, field, value) => {
    setLineItems((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const addRow = () => setLineItems((prev) => [...prev, emptyRow()]);
  const removeRow = (id) =>
    setLineItems((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));

  const setAddressField = (field, value) => {
    setCustomerAddress((prev) => ({ ...prev, [field]: value }));
  };

  const renderChangeOrderPdfDoc = async () => {
    if (!changeOrderCanvasRef.current) {
      throw new Error('Change order canvas not ready');
    }
    try {
      setIsCoExportMode(true);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const canvas = await html2canvas(changeOrderCanvasRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        onclone: (_clonedDoc, cloned) => {
          /** MUI inputs + native date fields often clip descenders when rasterized; plain divs print cleanly. */
          const replaceInputWithDiv = (field, opts = {}) => {
            const { rightAlign = false, minHeight = '42px', fontSize = '12.5px', lineHeight = '1.5' } = opts;
            const div = _clonedDoc.createElement('div');
            div.textContent = field.value ?? '';
            Object.assign(div.style, {
              width: '100%',
              boxSizing: 'border-box',
              fontSize,
              lineHeight,
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#000',
              minHeight,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              ...(rightAlign ? { justifyContent: 'flex-end', textAlign: 'right' } : {}),
            });
            const root = field.closest('.MuiInputBase-root');
            if (root) root.replaceChildren(div);
          };

          const header = cloned.querySelector('[data-co-header-meta]');
          if (header) {
            header.querySelectorAll('input, textarea').forEach((inp) => {
              const right = !!inp.closest('[data-co-co-number-cell]');
              replaceInputWithDiv(inp, { rightAlign: right, fontSize: '13px', minHeight: '46px' });
            });
          }

          const nameBox = cloned.querySelector('[data-co-name-address]');
          if (nameBox) {
            nameBox.querySelectorAll('input, textarea').forEach((inp) => {
              replaceInputWithDiv(inp, { fontSize: '13px', minHeight: '40px' });
            });
          }

          const footer = cloned.querySelector('[data-co-footer]');
          if (footer) {
            footer.querySelectorAll('input, textarea').forEach((inp) => {
              replaceInputWithDiv(inp, { fontSize: '12px', minHeight: '44px', lineHeight: '1.55' });
            });
            const initials = footer.querySelector('[data-co-initials-line]');
            if (initials instanceof HTMLElement) {
              initials.style.paddingTop = '6px';
              initials.style.paddingBottom = '14px';
              initials.style.lineHeight = '1.65';
              initials.style.fontSize = '12px';
            }
          }

          const table = cloned.querySelector('[data-co-line-table]');
          if (!table) return;
          const replaceWithWrappedText = (field) => {
            const div = _clonedDoc.createElement('div');
            div.textContent = field.value ?? '';
            const isTotal = field.dataset?.coTotal === '1';
            Object.assign(div.style, {
              width: '100%',
              boxSizing: 'border-box',
              fontSize: '12.5px',
              lineHeight: '1.45',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#000',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              padding: '6px 4px',
              minHeight: '28px',
              ...(isTotal ? { textAlign: 'right' } : {}),
            });
            const root = field.closest('.MuiInputBase-root');
            if (root) {
              root.replaceChildren(div);
            }
          };
          table.querySelectorAll('textarea').forEach(replaceWithWrappedText);
          table.querySelectorAll('input').forEach((inp) => {
            if (inp.type === 'hidden' || inp.type === 'date') return;
            replaceWithWrappedText(inp);
          });
        },
      });
      const imageData = canvas.toDataURL('image/png');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
      const pageW = 612;
      const pageH = 792;
      doc.addImage(imageData, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
      return doc;
    } finally {
      setIsCoExportMode(false);
    }
  };

  const handleSubmit = async () => {
    if (!estimateDoc?._id) {
      toast.error('No estimate on this job');
      return;
    }
    if (previewTotals.grandTotal <= 0) {
      toast.error('Enter line totals so the change order amount is greater than zero');
      return;
    }

    try {
      setSaving(true);
      const { data } = await axios.post(`${API_URL}/estimates/${estimateDoc._id}/generate-change-order`, {
        lineItems: mapLinesForApi(lineItems),
        taxRate: Number(taxRate) || 0,
        discountAmount: Number(discountAmount) || 0,
        notes: notes.trim(),
      });
      const co = data?.changeOrder;
      if (!co?._id && !co?.invoiceNumber) throw new Error('Change order was not created');

      flushSync(() => {
        setLineItems(mapEstimateLinesToForm({ lineItems: co.lineItems || [] }));
        setTaxRate(Number(co.taxRate) || 0);
        setDiscountAmount(Number(co.discountAmount) || 0);
        setAssignedCoNumber(String(co.invoiceNumber || '').trim());
        setCoDate(
          co.issuedAt ? new Date(co.issuedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
        );
      });

      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const doc = await renderChangeOrderPdfDoc();
      doc.save(`Change-order-${co.invoiceNumber || 'draft'}.pdf`);

      toast.success(`Change order ${co.invoiceNumber || ''} saved and downloaded`);
      onCreated?.();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.error || e.message || 'Failed to create change order');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={false}
      fullWidth
      scroll="paper"
      PaperProps={{ sx: { maxWidth: 920, width: '100%' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        Change order
        <IconButton size="small" onClick={handleClose} disabled={saving} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Same layout as Finance Hub estimates — edit the letter sheet, then create the change order to download a
          matching PDF (title and numbering are for the change order).
        </Typography>

        {loadingEstimate ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={36} />
          </Box>
        ) : !estimateDoc ? (
          <Alert severity="warning">
            No estimate found for this job. Create one in Finance Hub first, then open this dialog again.
          </Alert>
        ) : (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              Referenced estimate #{estimateDoc.estimateNumber || '—'} · Change order # appears on the PDF after you
              save
            </Typography>

            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
                overflowX: 'auto',
              }}
            >
              <Box
                ref={changeOrderCanvasRef}
                sx={{
                  width: 816,
                  minHeight: 1056,
                  mx: 'auto',
                  bgcolor: '#fff',
                  color: '#000',
                  p: 5,
                  pb: 7,
                  border: '1px solid #d9d9d9',
                  fontFamily: 'Arial, Helvetica, sans-serif',
                  display: 'flex',
                  flexDirection: 'column',
                  boxSizing: 'border-box',
                  overflow: 'visible',
                  '& .MuiTypography-root': { color: '#000' },
                  '& .MuiInputBase-root': { color: '#000' },
                  '& .MuiInputBase-input': {
                    color: '#000',
                    WebkitTextFillColor: '#000',
                  },
                  '& .MuiInputBase-input::placeholder': {
                    color: 'rgba(0,0,0,0.42)',
                    opacity: 1,
                  },
                  '& .MuiIconButton-root': { color: '#000' },
                }}
              >
                <Box sx={{ flex: '0 0 auto', width: '100%' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Box
                        component="img"
                        src="/logo.png"
                        alt="SCWW logo"
                        sx={{ width: 68, height: 68, objectFit: 'contain', borderRadius: '50%' }}
                      />
                      <Box>
                        <Typography sx={{ fontWeight: 700, fontSize: 24, lineHeight: 1 }}>
                          San Clemente Woodworking
                        </Typography>
                        <Typography sx={{ fontSize: 14, mt: 0.8 }}>1030 Calle Sombra, Unit F</Typography>
                        <Typography sx={{ fontSize: 14 }}>San Clemente, CA 92673</Typography>
                        <Box sx={{ mt: 2, ml: -9 }}>
                          <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center' }}>
                            <Typography sx={{ fontSize: 13 }}>Phone #</Typography>
                            <Typography sx={{ fontSize: 13, minWidth: 150 }}>{COMPANY_PHONE}</Typography>
                          </Box>
                          <Typography sx={{ fontSize: 13, ml: 0 }}>{COMPANY_WEBSITE}</Typography>
                          <Typography sx={{ fontSize: 13, minWidth: 260, ml: 0 }}>{COMPANY_EMAIL}</Typography>
                        </Box>
                      </Box>
                    </Box>

                    <Box sx={{ textAlign: 'right' }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 22, mb: 1 }}>Change Order</Typography>
                      <Box sx={{ width: 252, border: '1px solid #000' }} data-co-header-meta>
                        <Box sx={{ display: 'flex', bgcolor: '#000', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                          <Box sx={{ width: '56%', p: 1, borderRight: '1px solid #fff' }}>Date</Box>
                          <Box sx={{ width: '44%', p: 1 }}>Change Order #</Box>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'stretch', minHeight: 50 }}>
                          <Box
                            data-co-date-cell
                            sx={{
                              width: '56%',
                              borderRight: '1px solid #000',
                              display: 'flex',
                              alignItems: 'stretch',
                              overflow: 'visible',
                            }}
                          >
                            <TextField
                              variant="standard"
                              type="date"
                              value={coDate}
                              onChange={(e) => setCoDate(e.target.value)}
                              InputProps={{
                                disableUnderline: true,
                                sx: {
                                  fontSize: 13,
                                  px: 1.25,
                                  py: 1.25,
                                  minHeight: 48,
                                  overflow: 'visible',
                                  alignItems: 'center',
                                  '& input': { lineHeight: 1.45, padding: '6px 0', overflow: 'visible' },
                                },
                              }}
                              sx={{ flex: 1, overflow: 'visible' }}
                            />
                          </Box>
                          <Box
                            data-co-co-number-cell
                            sx={{
                              width: '44%',
                              display: 'flex',
                              alignItems: 'stretch',
                              overflow: 'visible',
                            }}
                          >
                            <TextField
                              variant="standard"
                              value={assignedCoNumber}
                              placeholder="—"
                              InputProps={{
                                disableUnderline: true,
                                readOnly: true,
                                sx: {
                                  fontSize: 13,
                                  px: 1.25,
                                  py: 1.25,
                                  minHeight: 48,
                                  overflow: 'visible',
                                  alignItems: 'center',
                                  textAlign: 'right',
                                  '& input': {
                                    lineHeight: 1.45,
                                    padding: '6px 0',
                                    overflow: 'visible',
                                    textAlign: 'right',
                                  },
                                },
                              }}
                              inputProps={{ style: { textAlign: 'right' } }}
                              sx={{ flex: 1, overflow: 'visible' }}
                            />
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  </Box>

                  <Box sx={{ mt: 3, width: '48%', border: '1px solid #000' }}>
                    <Box sx={{ bgcolor: '#000', color: '#fff', p: 1, fontWeight: 700, fontSize: 12 }}>
                      Name / Address
                    </Box>
                    <Box data-co-name-address sx={{ p: 1.25 }}>
                      <TextField
                        variant="standard"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Customer name"
                        InputProps={{
                          disableUnderline: true,
                          sx: { fontSize: 13, py: 0.35, '& input': { lineHeight: 1.45, padding: '6px 0' } },
                        }}
                        fullWidth
                      />
                      <TextField
                        variant="standard"
                        value={customerAddress.street}
                        onChange={(e) => setAddressField('street', e.target.value)}
                        placeholder="Street address"
                        InputProps={{
                          disableUnderline: true,
                          sx: { fontSize: 13, py: 0.35, '& input': { lineHeight: 1.45, padding: '6px 0' } },
                        }}
                        fullWidth
                      />
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                          variant="standard"
                          value={customerAddress.city}
                          onChange={(e) => setAddressField('city', e.target.value)}
                          placeholder="City, State ZIP"
                          InputProps={{
                            disableUnderline: true,
                            sx: { fontSize: 13, py: 0.35, '& input': { lineHeight: 1.45, padding: '6px 0' } },
                          }}
                          sx={{ flex: 1 }}
                        />
                      </Box>
                    </Box>
                  </Box>

                  <Box sx={{ mt: 3, border: '1px solid #000' }} data-co-line-table>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '20% 48% 12% 20%', bgcolor: '#000', color: '#fff' }}>
                      <Box sx={{ px: 0.75, py: 0.55, fontWeight: 700, fontSize: 11.5 }}>Item</Box>
                      <Box sx={{ px: 0.75, py: 0.55, fontWeight: 700, fontSize: 11.5 }}>Description</Box>
                      <Box sx={{ px: 0.75, py: 0.55, fontWeight: 700, fontSize: 11.5 }}>Qty</Box>
                      <Box sx={{ px: 0.75, py: 0.55, fontWeight: 700, fontSize: 11.5 }}>Total</Box>
                    </Box>
                    {lineItems.map((row) => (
                      <Box
                        key={row.id}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: '20% 48% 12% 20%',
                          gridAutoRows: 'minmax(min-content, auto)',
                          borderTop: '1px solid #000',
                          alignItems: 'stretch',
                          minHeight: 'min-content',
                        }}
                      >
                        <Box
                          sx={{
                            px: 0.75,
                            py: 0.45,
                            borderRight: '1px solid #000',
                            minWidth: 0,
                            display: 'flex',
                            alignItems: 'flex-start',
                          }}
                        >
                          <TextField
                            variant="standard"
                            value={row.itemName}
                            onChange={(e) => updateRow(row.id, 'itemName', e.target.value)}
                            InputProps={{ disableUnderline: true, sx: { fontSize: 12.5 } }}
                            fullWidth
                          />
                        </Box>
                        <Box
                          sx={{
                            px: 0.75,
                            py: 0.45,
                            borderRight: '1px solid #000',
                            minWidth: 0,
                            display: 'flex',
                            alignItems: 'flex-start',
                          }}
                        >
                          <TextField
                            variant="standard"
                            multiline
                            minRows={2}
                            maxRows={40}
                            value={row.description}
                            onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                            InputProps={{
                              disableUnderline: true,
                              sx: {
                                fontSize: 12.5,
                                width: '100%',
                                alignItems: 'flex-start',
                                overflow: 'visible',
                                '& .MuiInputBase-inputMultiline': {
                                  whiteSpace: 'pre-wrap',
                                  overflowWrap: 'anywhere',
                                  wordBreak: 'break-word',
                                  overflow: 'visible !important',
                                  resize: 'none',
                                  fieldSizing: 'content',
                                },
                              },
                            }}
                            fullWidth
                          />
                        </Box>
                        <Box
                          sx={{
                            px: 0.75,
                            py: 0.45,
                            borderRight: '1px solid #000',
                            minWidth: 0,
                            display: 'flex',
                            alignItems: 'flex-start',
                          }}
                        >
                          <TextField
                            variant="standard"
                            type="text"
                            value={row.quantity}
                            onChange={(e) => updateRow(row.id, 'quantity', e.target.value)}
                            InputProps={{ disableUnderline: true, sx: { fontSize: 12.5 } }}
                            inputProps={{ inputMode: 'numeric' }}
                            fullWidth
                          />
                        </Box>
                        <Box
                          sx={{
                            px: 0.75,
                            py: 0.45,
                            minWidth: 0,
                            display: 'flex',
                            gap: 0.5,
                            alignItems: 'flex-start',
                          }}
                        >
                          <TextField
                            variant="standard"
                            type="text"
                            value={row.total}
                            onChange={(e) => updateRow(row.id, 'total', e.target.value)}
                            InputProps={{ disableUnderline: true, sx: { fontSize: 12.5 } }}
                            inputProps={{ inputMode: 'decimal', 'data-co-total': '1' }}
                            fullWidth
                          />
                          {!isCoExportMode && (
                            <IconButton
                              size="small"
                              onClick={() => removeRow(row.id)}
                              disabled={lineItems.length <= 1}
                              aria-label="Remove line"
                            >
                              <DeleteOutlineIcon fontSize="inherit" />
                            </IconButton>
                          )}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>

                <Box sx={{ flex: '1 1 auto', minHeight: 32, width: '100%' }} aria-hidden />

                <Box sx={{ flex: '0 0 auto', width: '100%', mt: 'auto' }}>
                  <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {!isCoExportMode && (
                      <Button size="small" startIcon={<AddIcon />} onClick={addRow}>
                        Add line
                      </Button>
                    )}
                    <Box sx={{ width: 220, border: '1px solid #000', display: 'flex', ml: 'auto' }}>
                      <Box sx={{ width: '40%', borderRight: '1px solid #000', p: 1, fontWeight: 700, fontSize: 13 }}>
                        Total
                      </Box>
                      <Box sx={{ width: '60%', p: 1, textAlign: 'right', fontWeight: 700, fontSize: 15 }}>
                        ${coGrandDisplay}
                      </Box>
                    </Box>
                  </Box>

                  <Box data-co-footer sx={{ mt: 1.5, pt: 0.5, pb: 1, overflow: 'visible' }}>
                    <TextField
                      variant="standard"
                      value={footerNote}
                      onChange={(e) => setFooterNote(e.target.value)}
                      InputProps={{
                        disableUnderline: true,
                        sx: {
                          fontSize: 12,
                          py: 0.75,
                          alignItems: 'flex-start',
                          overflow: 'visible',
                          '& input': { lineHeight: 1.55, padding: '8px 0', overflow: 'visible' },
                        },
                      }}
                      fullWidth
                    />
                    <Typography
                      data-co-initials-line
                      component="div"
                      sx={{ fontSize: 12, mt: 1.25, lineHeight: 1.65, pb: 1.5, overflow: 'visible' }}
                    >
                      Initials ____
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              <TextField
                size="small"
                label="Tax rate %"
                type="number"
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                sx={{ width: 140 }}
                inputProps={{ step: 0.1 }}
              />
              <TextField
                size="small"
                label="Discount $"
                type="number"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                sx={{ width: 140 }}
                inputProps={{ step: 0.01 }}
              />
            </Box>

            <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Change order total (lines + tax − discount)
              </Typography>
              <Typography variant="h6">${formatMoney(previewTotals.grandTotal)}</Typography>
            </Box>

            <TextField
              label="Internal notes (saved on document)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              sx={{ mt: 2 }}
            />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || loadingEstimate || !estimateDoc || previewTotals.grandTotal <= 0}
        >
          {saving ? 'Saving…' : 'Create change order & download PDF'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
