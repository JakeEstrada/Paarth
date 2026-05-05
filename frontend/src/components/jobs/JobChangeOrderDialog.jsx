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

const INVOICE_PERMITS_ACK_LINE =
  'Any city permits or engineer fees are either not included or are provided by the customer';

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

function mapLinesForPdf(items) {
  return (items || []).map((row) => ({
    itemName: row.itemName || '',
    description: row.description || '',
    quantity: row.quantity != null && row.quantity !== '' ? row.quantity : '',
    total: row.total != null && row.total !== '' ? row.total : '',
  }));
}

/** Hidden letter PDF layout for change orders (matches Finance Hub styling). */
function ChangeOrderPdfMarkup({ payload }) {
  if (!payload) return null;
  return (
    <Box
      sx={{
        width: 816,
        minHeight: 1056,
        bgcolor: '#fff',
        color: '#000',
        p: 5,
        boxSizing: 'border-box',
        border: '1px solid #d9d9d9',
        fontFamily: 'Arial, Helvetica, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        '& .MuiTypography-root': { color: '#000' },
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
            <Box sx={{ width: 280, border: '1px solid #000', ml: 'auto' }}>
              <Box sx={{ display: 'flex', bgcolor: '#000', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                <Box sx={{ width: '34%', p: 1, borderRight: '1px solid #fff' }}>Date</Box>
                <Box sx={{ width: '33%', p: 1, borderRight: '1px solid #fff' }}>Estimate #</Box>
                <Box sx={{ width: '33%', p: 1 }}>Change Order #</Box>
              </Box>
              <Box sx={{ display: 'flex' }}>
                <Typography sx={{ width: '34%', fontSize: 12, px: 1, py: 0.8, borderRight: '1px solid #000' }}>
                  {payload.invoiceDate}
                </Typography>
                <Typography
                  sx={{
                    width: '33%',
                    fontSize: 12,
                    px: 1,
                    py: 0.8,
                    borderRight: '1px solid #000',
                    textAlign: 'right',
                  }}
                >
                  {payload.estimateNumber}
                </Typography>
                <Typography sx={{ width: '33%', fontSize: 12, px: 1, py: 0.8, textAlign: 'right' }}>
                  {payload.invoiceNumber}
                </Typography>
              </Box>
            </Box>
            <Typography
              sx={{
                fontSize: 11,
                mt: 1,
                maxWidth: 280,
                ml: 'auto',
                textAlign: 'right',
                lineHeight: 1.35,
              }}
            >
              References estimate #{payload.estimateNumber}. Stored estimate total at generation: $
              {formatMoney(payload.referencedEstimateTotal)}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ mt: 3, width: '48%', border: '1px solid #000' }}>
          <Box sx={{ bgcolor: '#000', color: '#fff', p: 1, fontWeight: 700, fontSize: 12 }}>Name / Address</Box>
          <Box sx={{ p: 1 }}>
            <Typography sx={{ fontSize: 13 }}>{payload.customerName}</Typography>
            <Typography sx={{ fontSize: 13 }}>{payload.customerAddress?.street}</Typography>
            <Typography sx={{ fontSize: 13 }}>{payload.customerAddress?.city}</Typography>
            {payload.projectName ? (
              <Typography sx={{ fontSize: 12, mt: 0.5 }}>Project: {payload.projectName}</Typography>
            ) : null}
          </Box>
        </Box>

        <Box sx={{ mt: 3, border: '1px solid #000' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '20% 48% 12% 20%', bgcolor: '#000', color: '#fff' }}>
            <Box sx={{ px: 0.75, py: 0.55, fontWeight: 700, fontSize: 11.5 }}>Item</Box>
            <Box sx={{ px: 0.75, py: 0.55, fontWeight: 700, fontSize: 11.5 }}>Description</Box>
            <Box sx={{ px: 0.75, py: 0.55, fontWeight: 700, fontSize: 11.5 }}>Qty</Box>
            <Box sx={{ px: 0.75, py: 0.55, fontWeight: 700, fontSize: 11.5 }}>Total</Box>
          </Box>
          {payload.lineItems.map((row, index) => {
            const qty = row.quantity != null && row.quantity !== '' ? row.quantity : '';
            const tot = Number(row.total);
            const totalStr = Number.isFinite(tot)
              ? tot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : String(row.total ?? '').trim() || '—';
            return (
              <Box
                key={`co-pdf-${index}`}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '20% 48% 12% 20%',
                  borderTop: '1px solid #000',
                  alignItems: 'stretch',
                }}
              >
                <Box
                  sx={{
                    px: 0.75,
                    py: 0.45,
                    borderRight: '1px solid #000',
                    fontSize: 12.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {row.itemName}
                </Box>
                <Box
                  sx={{
                    px: 0.75,
                    py: 0.45,
                    borderRight: '1px solid #000',
                    fontSize: 12.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {row.description}
                </Box>
                <Box sx={{ px: 0.75, py: 0.45, borderRight: '1px solid #000', fontSize: 12.5 }}>{qty}</Box>
                <Box sx={{ px: 0.75, py: 0.45, fontSize: 12.5, textAlign: 'right' }}>${totalStr}</Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box sx={{ flex: '1 1 auto', minHeight: 32, width: '100%' }} aria-hidden />

      <Box sx={{ flex: '0 0 auto', width: '100%', mt: 'auto' }}>
        <Box
          sx={{
            mt: 1.5,
            display: 'flex',
            justifyContent: 'flex-end',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 1,
          }}
        >
          <Box sx={{ width: 280, border: '1px solid #000', display: 'flex' }}>
            <Box sx={{ width: '52%', borderRight: '1px solid #000', p: 1, fontWeight: 700, fontSize: 12 }}>
              Estimate reference total
            </Box>
            <Box sx={{ width: '48%', p: 1, textAlign: 'right', fontWeight: 700, fontSize: 14 }}>
              ${formatMoney(payload.referencedEstimateTotal)}
            </Box>
          </Box>
          <Box sx={{ width: 280, border: '1px solid #000', display: 'flex' }}>
            <Box sx={{ width: '52%', borderRight: '1px solid #000', p: 1, fontWeight: 700, fontSize: 12 }}>
              Change order total
            </Box>
            <Box sx={{ width: '48%', p: 1, textAlign: 'right', fontWeight: 700, fontSize: 15 }}>
              ${formatMoney(payload.grandTotal)}
            </Box>
          </Box>
        </Box>

        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: 12, lineHeight: 1.5 }}>
            {INVOICE_PERMITS_ACK_LINE} ______
          </Typography>
          <Typography sx={{ fontSize: 12, mt: 1.5 }}>{payload.footerNote}</Typography>
          <Typography sx={{ fontSize: 12, mt: 0.4 }}>Initials ____</Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default function JobChangeOrderDialog({ open, onClose, job, onCreated }) {
  const pdfRef = useRef(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [estimateDoc, setEstimateDoc] = useState(null);
  const [lineItems, setLineItems] = useState([emptyRow()]);
  const [taxRate, setTaxRate] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [footerNote, setFooterNote] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [pdfPayload, setPdfPayload] = useState(null);

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
    if (!open || !estimateDoc) return;
    setLineItems(mapEstimateLinesToForm(estimateDoc));
    setTaxRate(Number(estimateDoc.taxRate) || 0);
    setDiscountAmount(Number(estimateDoc.discountAmount) || 0);
    setFooterNote(
      String(estimateDoc.footerNote || '').trim() ||
        'Customer acknowledges paint and stain are not included.'
    );
    setNotes('');
  }, [open, estimateDoc?._id]);

  const previewTotals = useMemo(
    () => computePreviewTotals(lineItems, taxRate, discountAmount),
    [lineItems, taxRate, discountAmount]
  );

  const updateRow = (id, field, value) => {
    setLineItems((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const addRow = () => setLineItems((prev) => [...prev, emptyRow()]);
  const removeRow = (id) =>
    setLineItems((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));

  const renderPdfAndDownload = async (payload) => {
    flushSync(() => setPdfPayload(payload));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (!pdfRef.current) throw new Error('PDF layout not ready');
    const canvas = await html2canvas(pdfRef.current, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
    });
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 612, 792, undefined, 'FAST');
    doc.save(`Change-order-${payload.invoiceNumber || 'draft'}.pdf`);
    flushSync(() => setPdfPayload(null));
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

      const addr = buildCustomerAddress(job);
      await renderPdfAndDownload({
        estimateNumber: co.estimateNumber || estimateDoc.estimateNumber || '',
        invoiceNumber: co.invoiceNumber || '',
        invoiceDate: (co.issuedAt ? new Date(co.issuedAt) : new Date()).toISOString().slice(0, 10),
        customerName: job.customerId?.name || '',
        projectName: job.title || '',
        customerAddress: addr,
        lineItems: mapLinesForPdf(co.lineItems),
        referencedEstimateTotal: Number(co.contractTotal) || 0,
        grandTotal: Number(co.total) || 0,
        footerNote: footerNote.trim(),
      });

      toast.success(`Change order ${co.invoiceNumber || ''} saved and downloaded`);
      onCreated?.();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.error || e.message || 'Failed to create change order');
      flushSync(() => setPdfPayload(null));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (saving) return;
    setPdfPayload(null);
    onClose();
  };

  return (
    <>
      {pdfPayload ? (
        <Box
          ref={pdfRef}
          sx={{
            position: 'fixed',
            left: -12000,
            top: 0,
            pointerEvents: 'none',
          }}
        >
          <ChangeOrderPdfMarkup payload={pdfPayload} />
        </Box>
      ) : null}

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          Change order
          <IconButton size="small" onClick={handleClose} disabled={saving} aria-label="Close">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Starts from this job&apos;s estimate lines — edit them to describe scope or pricing updates. Tax and
            discount apply only to these change-order lines.
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
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Referenced estimate #{estimateDoc.estimateNumber || '—'}
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {lineItems.map((row) => (
                  <Box
                    key={row.id}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1.1fr 1.4fr 72px 96px 40px' },
                      gap: 1,
                      alignItems: 'flex-start',
                    }}
                  >
                    <TextField
                      size="small"
                      label="Item"
                      value={row.itemName}
                      onChange={(e) => updateRow(row.id, 'itemName', e.target.value)}
                      fullWidth
                    />
                    <TextField
                      size="small"
                      label="Description"
                      value={row.description}
                      onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                      fullWidth
                    />
                    <TextField
                      size="small"
                      label="Qty"
                      type="number"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.id, 'quantity', e.target.value)}
                      inputProps={{ min: 0, step: 1 }}
                    />
                    <TextField
                      size="small"
                      label="Total $"
                      type="number"
                      value={row.total}
                      onChange={(e) => updateRow(row.id, 'total', e.target.value)}
                      inputProps={{ min: 0, step: 0.01 }}
                    />
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeRow(row.id)}
                      disabled={lineItems.length <= 1}
                      sx={{ mt: 0.5 }}
                      aria-label="Remove line"
                    >
                      <DeleteOutlineIcon />
                    </IconButton>
                  </Box>
                ))}
              </Box>

              <Button size="small" startIcon={<AddIcon />} onClick={addRow} sx={{ mt: 2 }}>
                Add line
              </Button>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                <TextField
                  size="small"
                  label="Tax rate %"
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  sx={{ width: 140 }}
                  inputProps={{ step: 0.1 }}
                />
                <TextField
                  size="small"
                  label="Discount $"
                  type="number"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  sx={{ width: 140 }}
                  inputProps={{ step: 0.01 }}
                />
              </Box>

              <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Change order preview total
                </Typography>
                <Typography variant="h6">${formatMoney(previewTotals.grandTotal)}</Typography>
              </Box>

              <TextField
                label="Footer note (printed on PDF)"
                value={footerNote}
                onChange={(e) => setFooterNote(e.target.value)}
                fullWidth
                multiline
                minRows={2}
                sx={{ mt: 2 }}
              />
              <TextField
                label="Internal notes (saved on document)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                fullWidth
                multiline
                minRows={2}
                sx={{ mt: 1.5 }}
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
    </>
  );
}
