import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { PictureAsPdf as PictureAsPdfIcon, Print as PrintIcon, Close as CloseIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { APP_LOGO_LIGHT } from '../../utils/tenantBranding';
import toast from 'react-hot-toast';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const COMPANY_NAME = 'San Clemente Woodworking';
const COMPANY_STREET = '1030 Calle Sombra, F San Clemente, CA. 92673';
const OWNER_MANAGER_NAME = 'Edward T. Estrada';
const OWNER_MANAGER_PHONE = '949-498-4397';
const ZELLE_PHONE = '949-838-5157';
const ZELLE_ACCOUNT_NOTE = 'Deposit to Checking...9823';
const CONTRACTOR_LICENSE = '# C-6 753246';

const STAINER_REFERRALS = 'Jesus (949)616-2038 | Carlos Jimenez 714-678-7072';

const NOTICE_TEXT = `NOTICE TO OWNER (SECTION 7019) CONTRACTORS LICENSE LAW
Under the Mechanics' Lien law, any contractor, subcontractor, laborer, material man or other person who helps to improve your property and is not paid for his labor, services or materials has a right to enforce his claim against your property. Under the law you may protect yourself against such claims by filing, before commencing such work of improvement, an original contract for the work of improvement or a modification thereof, in the office of the county recorder of the county where the property is situated and requiring that a contractor's payment bond be recorded in such office. Said bond shall be in an amount not less than fifty percent (50%) of the contract price and, shall, in addition to any conditions for the performance of the contract, be conditioned for the payment in full of the claims of all persons furnishing labor, services, equipment or materials for the work described in said contract. Owner has a 3 day right of rescission to cancel contract after date of signing.`;

const SMALL =
  'Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen Fifteen Sixteen Seventeen Eighteen Nineteen'.split(
    ' '
  );
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitsWords(n) {
  if (n < 20) return SMALL[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return TENS[t] + (u ? `-${SMALL[u]}` : '');
}

function threeDigitsWords(n) {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const r = n % 100;
  let s = '';
  if (h) s += `${SMALL[h]} Hundred`;
  if (r) {
    if (s) s += ' ';
    s += twoDigitsWords(r);
  }
  return s.trim();
}

function numberToWordsDollars(n) {
  const whole = Math.floor(Math.abs(Number(n)));
  if (!Number.isFinite(whole) || whole === 0) return 'Zero';
  if (whole >= 1e9) return 'Amount too large to spell out';

  const millions = Math.floor(whole / 1e6);
  const thousands = Math.floor((whole % 1e6) / 1000);
  const rest = whole % 1000;
  const parts = [];
  if (millions) parts.push(`${threeDigitsWords(millions)} Million`);
  if (thousands) parts.push(`${threeDigitsWords(thousands)} Thousand`);
  if (rest) parts.push(threeDigitsWords(rest));
  if (parts.length === 0) parts.push('Zero');
  return parts.join(' ');
}

function buildCustomerAddressLines(job) {
  const street =
    (job?.jobAddress && String(job.jobAddress.street || '').trim()) ||
    (job?.customerId?.address && String(job.customerId.address.street || '').trim()) ||
    '';
  const city =
    (job?.jobAddress && String(job.jobAddress.city || '').trim()) ||
    (job?.customerId?.address && String(job.customerId.address.city || '').trim()) ||
    '';
  const state =
    (job?.jobAddress && String(job.jobAddress.state || '').trim()) ||
    (job?.customerId?.address && String(job.customerId.address.state || '').trim()) ||
    '';
  const zip =
    (job?.jobAddress && String(job.jobAddress.zip || '').trim()) ||
    (job?.customerId?.address && String(job.customerId.address.zip || '').trim()) ||
    '';
  const line2 = [city, state, zip].filter(Boolean).join(', ') || city || state || zip;
  return { street, line2 };
}

function buildProjectLocationLine(job) {
  const parts = [
    job?.jobAddress?.street,
    job?.jobAddress?.city,
    job?.jobAddress?.state,
    job?.jobAddress?.zip,
  ]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (parts.length) return parts.join(', ');
  const c = job?.customerId?.address;
  if (!c) return '______________________________';
  return [c.street, c.city, c.state, c.zip].map((x) => String(x || '').trim()).filter(Boolean).join(', ') || '______________________________';
}

function contractAmounts(job, estimateDoc) {
  const estimateTotal = Number(estimateDoc?.grandTotal || 0);
  const raw = Number(job?.valueContracted) || estimateTotal || Number(job?.valueEstimated) || 0;
  const total = Math.round(raw * 100) / 100;
  const totalDisplay = Number.isInteger(total) ? String(Math.round(total)) : total.toFixed(2);
  const written = `${numberToWordsDollars(Math.floor(total))} Dollars and 00/100`;
  return { total, totalDisplay, written };
}

function formatMoneyUsd(value) {
  const x = Number(value);
  if (!Number.isFinite(x)) return '0.00';
  return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const pageSx = {
  width: 612,
  minHeight: 792,
  boxSizing: 'border-box',
  bgcolor: '#fff',
  color: '#000',
  fontFamily: 'Arial, Helvetica, sans-serif',
  p: 4,
  border: '2px solid #000',
  mx: 'auto',
  '& .MuiTypography-root': { color: '#000' },
};

function JobContractPacketDialog({ open, onClose, job }) {
  const page1Ref = useRef(null);
  const page2Ref = useRef(null);
  const page3Ref = useRef(null);
  const page4Ref = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [estimateDoc, setEstimateDoc] = useState(null);
  const [depositInvoice, setDepositInvoice] = useState(null);
  const [contractDoc, setContractDoc] = useState(null);

  useEffect(() => {
    if (!open || !job?._id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/estimates`, { params: { jobId: job._id } });
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data?.estimates || [];
        setEstimateDoc(list[0] || null);
      } catch (error) {
        if (!cancelled) setEstimateDoc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, job?._id]);

  /** System-generated contract (Finance Hub / packet flow); drives Contract # on the PDF. */
  useEffect(() => {
    if (!open || !job?._id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/contracts`, { params: { jobId: job._id } });
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        const sorted = [...list].sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
        );
        let pick = sorted[0] || null;
        const estId = estimateDoc?._id ? String(estimateDoc._id) : '';
        if (estId) {
          const match = sorted.find((c) => String(c.estimateId || '') === estId);
          if (match) pick = match;
        }
        setContractDoc(pick);
      } catch {
        if (!cancelled) setContractDoc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, job?._id, estimateDoc?._id]);

  useEffect(() => {
    if (!open || !job?._id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/invoices`, { params: { jobId: job._id } });
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        const deposits = list
          .filter((inv) => String(inv?.invoiceKind || '') === 'deposit')
          .sort(
            (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
          );
        setDepositInvoice(deposits[0] || null);
      } catch {
        if (!cancelled) setDepositInvoice(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, job?._id]);

  const data = useMemo(() => {
    if (!job) return null;
    const customerName = String(job.customerId?.name || '').trim() || '________________';
    const { street, line2 } = buildCustomerAddressLines(job);
    const addr1 = street || '______________________________';
    const addr2 = line2 || '______________________________';
    const { total, totalDisplay, written } = contractAmounts(job, estimateDoc);
    if (!estimateDoc && job?.estimate?.number) {
      console.warn('[estimate-deprecated] contract packet fell back to job.estimate', { jobId: job?._id });
    }
    const estimateNumber = String(estimateDoc?.estimateNumber || job?.estimate?.number || '').trim() || '__________';
    const projectLocation = buildProjectLocationLine(job);
    const contractNumber = String(contractDoc?.contractNumber || '').trim();
    const contractDate =
      contractDoc?.contractDate != null
        ? format(new Date(contractDoc.contractDate), 'M/d/yyyy')
        : format(new Date(), 'M/d/yyyy');
    const qrData = `${COMPANY_NAME} Zelle ${ZELLE_PHONE} ${ZELLE_ACCOUNT_NOTE}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrData)}`;

    return {
      customerName,
      addr1,
      addr2,
      total,
      totalDisplay,
      written,
      estimateNumber,
      projectLocation,
      contractDate,
      contractNumber,
      qrSrc,
    };
  }, [job, estimateDoc, contractDoc]);

  const capturePage = async (el) => {
    if (!el) throw new Error('Page not ready');
    return html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: true,
    });
  };

  const buildPdf = useCallback(async () => {
    const refs = [page1Ref, page2Ref, page3Ref, page4Ref];
    if (!refs.every((r) => r.current)) throw new Error('Contract packet pages not ready');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    const pageW = 612;
    const pageH = 792;
    for (let i = 0; i < refs.length; i += 1) {
      if (i > 0) doc.addPage();
      const canvas = await capturePage(refs[i].current);
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
    }
    return doc;
  }, []);

  const handleDownloadPdf = async () => {
    if (!data || !job) return;
    try {
      setExporting(true);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const doc = await buildPdf();
      const safeName = String(job.customerId?.name || 'Customer')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .slice(0, 40) || 'Customer';
      const filename = `Contract-Packet-${safeName.replace(/\s+/g, '-')}.pdf`;
      const customerId = job?.customerId?._id || job?.customerId || null;
      if (customerId) {
        const blob = doc.output('blob');
        const formData = new FormData();
        formData.append('file', new File([blob], filename, { type: 'application/pdf' }));
        formData.append('customerId', String(customerId));
        formData.append('fileType', 'contract');
        formData.append(
          'description',
          `Immutable contract packet PDF artifact for job ${String(job?._id || '').slice(-8) || 'unknown'}`
        );
        await axios.post(`${API_URL}/files/upload-document`, formData);
      }
      doc.save(filename);
      toast.success('Contract packet downloaded');
    } catch (e) {
      console.error(e);
      toast.error(e?.message || 'Failed to generate PDF');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = async () => {
    if (!data || !job) return;
    try {
      setExporting(true);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const doc = await buildPdf();
      const blobUrl = doc.output('bloburl');
      const win = window.open(blobUrl, '_blank');
      const trigger = () => {
        try {
          win?.focus();
          win?.print();
        } catch (err) {
          console.warn(err);
        }
      };
      if (win) {
        win.onload = trigger;
        setTimeout(trigger, 700);
      }
      toast.success('Print view opened');
    } catch (e) {
      console.error(e);
      toast.error(e?.message || 'Failed to open print view');
    } finally {
      setExporting(false);
    }
  };

  if (!job || !data) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        Contract packet
        <Button size="small" onClick={onClose} startIcon={<CloseIcon />}>
          Close
        </Button>
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: 'grey.100' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Full packet PDF: cover, contract (with your saved Contract # when present), estimate, and deposit invoice when
          one exists. Customer name, address, estimate #, totals, and project location come from this job and linked
          documents.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, pb: 2 }}>
          {/* Page 1 — Contract packet cover */}
          <Box ref={page1Ref} sx={pageSx}>
            <Typography sx={{ fontSize: 28, fontWeight: 700, textAlign: 'center', mb: 1 }}>
              Contract. Packet
            </Typography>
            <Typography sx={{ fontSize: 16, textAlign: 'center', mb: 2 }}>Customer</Typography>
            <Typography sx={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>{data.customerName}</Typography>
            <Typography sx={{ fontSize: 16, fontWeight: 700, textAlign: 'center', mt: 0.5 }}>{data.addr1}</Typography>
            <Typography sx={{ fontSize: 16, fontWeight: 700, textAlign: 'center', mt: 0.5 }}>{data.addr2}</Typography>

            {data.contractNumber ? (
              <Typography sx={{ fontSize: 15, fontWeight: 700, textAlign: 'center', mt: 2 }}>
                Contract #{data.contractNumber}
              </Typography>
            ) : null}

            <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
              <Box
                component="img"
                src={APP_LOGO_LIGHT}
                alt=""
                sx={{ width: 120, height: 120, objectFit: 'contain', borderRadius: '50%' }}
              />
            </Box>

            <Box sx={{ border: '1px solid #000', maxWidth: 420, mx: 'auto', p: 2, textAlign: 'center' }}>
              <Typography sx={{ fontSize: 15, fontWeight: 700, textDecoration: 'underline' }}>{COMPANY_NAME}</Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 700, mt: 0.5 }}>{COMPANY_STREET}</Typography>
            </Box>

            <Typography sx={{ fontSize: 14, fontStyle: 'italic', textAlign: 'center', mt: 3, px: 2 }}>
              We appreciate the opportunity to work with you and look forward to completing your project.
            </Typography>

            <Typography sx={{ fontSize: 14, fontStyle: 'italic', textAlign: 'center', mt: 3 }}>
              Stainer Referrals:
            </Typography>
            <Typography sx={{ fontSize: 13, fontStyle: 'italic', textAlign: 'center', mt: 0.5 }}>
              {STAINER_REFERRALS}
            </Typography>

            <Box sx={{ mt: 'auto', pt: 4, textAlign: 'center' }}>
              <Typography sx={{ fontSize: 11, letterSpacing: 0.5 }}>{COMPANY_NAME.toUpperCase()}</Typography>
              <Typography sx={{ fontSize: 13, mt: 0.5 }}>{ZELLE_PHONE}</Typography>
              <Typography sx={{ fontSize: 12, mt: 0.25 }}>{ZELLE_ACCOUNT_NOTE}</Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
                <Box
                  component="img"
                  src={data.qrSrc}
                  alt="Zelle QR"
                  sx={{ width: 140, height: 140 }}
                  crossOrigin="anonymous"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.style.display = 'none';
                  }}
                />
              </Box>
              <Typography sx={{ fontSize: 22, fontWeight: 700, color: '#6d1ed4', mt: 1, fontFamily: 'Arial' }}>
                Zelle
              </Typography>
            </Box>
          </Box>

          {/* Page 2 — Contract */}
          <Box ref={page2Ref} sx={{ ...pageSx, textAlign: 'left' }}>
            <Typography sx={{ fontSize: 22, fontWeight: 700, textAlign: 'center', mb: 1 }}>Contract</Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 700, textAlign: 'center', mb: 2 }}>
              Contract # {data.contractNumber || '__________'}
            </Typography>

            <Typography sx={{ fontSize: 12, mb: 1.5, lineHeight: 1.6 }}>
              This agreement made and entered on todays date{' '}
              <Box component="span" sx={{ textDecoration: 'underline', fontWeight: 600 }}>
                {data.contractDate}
              </Box>
            </Typography>
            <Typography sx={{ fontSize: 12, mb: 2, lineHeight: 1.6 }}>
              by and between owner or manager,{' '}
              <Box component="span" sx={{ textDecoration: 'underline', fontWeight: 600 }}>
                {OWNER_MANAGER_NAME}
              </Box>{' '}
              phone{' '}
              <Box component="span" sx={{ textDecoration: 'underline', fontWeight: 600 }}>
                {OWNER_MANAGER_PHONE}
              </Box>
            </Typography>

            <Typography sx={{ fontSize: 12, mb: 1.5, lineHeight: 1.65 }}>
              <Box component="span" sx={{ fontWeight: 700 }}>{COMPANY_NAME}</Box> proposes to complete the following:
            </Typography>
            <Typography sx={{ fontSize: 12, mb: 1.5, lineHeight: 1.65 }}>
              As per attached Estimate #{' '}
              <Box component="span" sx={{ fontWeight: 700 }}>{data.estimateNumber}</Box> with owners signature. Total:{' '}
              <Box component="span" sx={{ fontWeight: 700 }}>{data.totalDisplay}</Box>
            </Typography>
            <Typography sx={{ fontSize: 12, mb: 1.5, lineHeight: 1.65 }}>
              Estimate No. <Box component="span" sx={{ fontWeight: 700 }}>{data.estimateNumber}</Box> is based on a
              visual inspection only, it does not include any unseen issues that may arise during demolition and
              require a change order and or additional fees and costs. All of the above work to be completed in a
              substantial and workmanlike manner according to standard practices for the sum of:{' '}
              <Box component="span" sx={{ fontWeight: 700 }}>{data.written}</Box> $: Total:{' '}
              <Box component="span" sx={{ fontWeight: 700 }}>{data.totalDisplay}</Box>
            </Typography>
            <Typography sx={{ fontSize: 12, mb: 2, lineHeight: 1.65 }}>
              Payments to be made 40% material and labor deposit, and 60% upon completion of the contracted project. The
              total contract amount must be paid in full upon completion of contracted work. All agreements must be
              made in writing. The above work is to be performed in Track No.{' '}
              <Box component="span" sx={{ textDecoration: 'underline', fontWeight: 600 }}>
                {data.projectLocation}
              </Box>
            </Typography>

            <Box sx={{ border: '1px solid #000', p: 1.5, mb: 2, bgcolor: '#fafafa' }}>
              <Typography sx={{ fontSize: 10, fontWeight: 700, mb: 0.75 }}>{NOTICE_TEXT.split('\n')[0]}</Typography>
              <Typography sx={{ fontSize: 9, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                {NOTICE_TEXT.split('\n').slice(1).join('\n')}
              </Typography>
            </Box>

            <Typography sx={{ fontSize: 11, mb: 0.5 }}>
              Contractors are required by law to be licensed and regulated by the Contractors&apos; State License Board.
              Any questions concerning a contractor may be referred to the registrar of the board whose address is:
            </Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 700 }}>Contractors&apos; State License Board</Typography>
            <Typography sx={{ fontSize: 11, mb: 1.5 }}>9835 Goethe Road</Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 700, mb: 2 }}>State Contractors&apos; License {CONTRACTOR_LICENSE}</Typography>

            <Typography sx={{ fontSize: 12, mt: 2 }}>
              sign here____________________ date____________________
            </Typography>
          </Box>

          {/* Page 3 — Estimate */}
          <Box ref={page3Ref} sx={{ ...pageSx, textAlign: 'left' }}>
            <Typography sx={{ fontSize: 22, fontWeight: 700, textAlign: 'center', mb: 2 }}>Estimate</Typography>
            {estimateDoc ? (
              <>
                <Typography sx={{ fontSize: 12, mb: 1 }}>
                  Estimate #{' '}
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    {estimateDoc.estimateNumber || '—'}
                  </Box>
                  {' · '}
                  Date{' '}
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    {estimateDoc.estimateDate
                      ? format(new Date(estimateDoc.estimateDate), 'M/d/yyyy')
                      : '—'}
                  </Box>
                </Typography>
                <Typography sx={{ fontSize: 12, mb: 0.5 }}>
                  Customer:{' '}
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    {data.customerName}
                  </Box>
                </Typography>
                <Typography sx={{ fontSize: 11, mb: 1.5, lineHeight: 1.5 }}>
                  {data.addr1}
                  <br />
                  {data.addr2}
                </Typography>
                {String(estimateDoc.projectName || '').trim() ? (
                  <Typography sx={{ fontSize: 12, mb: 1.5 }}>
                    Project:{' '}
                    <Box component="span" sx={{ fontWeight: 700 }}>
                      {String(estimateDoc.projectName).trim()}
                    </Box>
                  </Typography>
                ) : null}

                <Box sx={{ border: '1px solid #000', mb: 1 }}>
                  <Box sx={{ display: 'flex', borderBottom: '1px solid #000', bgcolor: '#f0f0f0', fontSize: 10, fontWeight: 700 }}>
                    <Box sx={{ flex: 2.2, p: 0.75, borderRight: '1px solid #000' }}>Item</Box>
                    <Box sx={{ width: 44, p: 0.75, borderRight: '1px solid #000', textAlign: 'center' }}>Qty</Box>
                    <Box sx={{ width: 72, p: 0.75, borderRight: '1px solid #000', textAlign: 'right' }}>Unit</Box>
                    <Box sx={{ width: 80, p: 0.75, textAlign: 'right' }}>Total</Box>
                  </Box>
                  {(Array.isArray(estimateDoc.lineItems) ? estimateDoc.lineItems : []).slice(0, 14).map((li, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        display: 'flex',
                        borderBottom: idx === 13 ? 'none' : '1px solid #ddd',
                        fontSize: 10,
                        minHeight: 28,
                        alignItems: 'stretch',
                      }}
                    >
                      <Box sx={{ flex: 2.2, p: 0.6, borderRight: '1px solid #ddd', wordBreak: 'break-word' }}>
                        <Box sx={{ fontWeight: 600 }}>{String(li?.itemName || '').trim() || '—'}</Box>
                        {String(li?.description || '').trim() ? (
                          <Box sx={{ fontSize: 9, mt: 0.25, color: '#333' }}>{String(li.description).trim()}</Box>
                        ) : null}
                      </Box>
                      <Box sx={{ width: 44, p: 0.6, borderRight: '1px solid #ddd', textAlign: 'center' }}>
                        {formatMoneyUsd(li?.quantity)}
                      </Box>
                      <Box sx={{ width: 72, p: 0.6, borderRight: '1px solid #ddd', textAlign: 'right' }}>
                        ${formatMoneyUsd(li?.unitPrice)}
                      </Box>
                      <Box sx={{ width: 80, p: 0.6, textAlign: 'right', fontWeight: 600 }}>
                        ${formatMoneyUsd(li?.total)}
                      </Box>
                    </Box>
                  ))}
                </Box>
                {Array.isArray(estimateDoc.lineItems) && estimateDoc.lineItems.length > 14 ? (
                  <Typography sx={{ fontSize: 9, fontStyle: 'italic', mb: 1 }}>
                    Additional line items omitted from this packet preview — see Finance Hub for the full estimate.
                  </Typography>
                ) : null}

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                  <Box sx={{ width: 240, border: '1px solid #000', fontSize: 11 }}>
                    <Box sx={{ display: 'flex', borderBottom: '1px solid #000', p: 0.75 }}>
                      <Box sx={{ flex: 1 }}>Subtotal</Box>
                      <Box sx={{ fontWeight: 700 }}>${formatMoneyUsd(estimateDoc.subtotal)}</Box>
                    </Box>
                    <Box sx={{ display: 'flex', borderBottom: '1px solid #000', p: 0.75 }}>
                      <Box sx={{ flex: 1 }}>Tax ({Number(estimateDoc.taxRate) || 0}%)</Box>
                      <Box sx={{ fontWeight: 700 }}>${formatMoneyUsd(estimateDoc.taxAmount)}</Box>
                    </Box>
                    <Box sx={{ display: 'flex', borderBottom: '1px solid #000', p: 0.75 }}>
                      <Box sx={{ flex: 1 }}>Discount</Box>
                      <Box sx={{ fontWeight: 700 }}>${formatMoneyUsd(estimateDoc.discountAmount)}</Box>
                    </Box>
                    <Box sx={{ display: 'flex', p: 0.75, bgcolor: '#fafafa' }}>
                      <Box sx={{ flex: 1, fontWeight: 700 }}>Grand total</Box>
                      <Box sx={{ fontWeight: 700 }}>${formatMoneyUsd(estimateDoc.grandTotal)}</Box>
                    </Box>
                  </Box>
                </Box>
                {String(estimateDoc.footerNote || '').trim() ? (
                  <Typography sx={{ fontSize: 10, mt: 2, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                    {String(estimateDoc.footerNote).trim()}
                  </Typography>
                ) : null}
              </>
            ) : (
              <Typography sx={{ fontSize: 13, lineHeight: 1.6 }}>
                No estimate document is linked to this job yet. Create or attach an estimate in Finance Hub, then reopen
                this packet.
              </Typography>
            )}
          </Box>

          {/* Page 4 — Deposit invoice */}
          <Box ref={page4Ref} sx={{ ...pageSx, textAlign: 'left' }}>
            <Typography sx={{ fontSize: 22, fontWeight: 700, textAlign: 'center', mb: 2 }}>
              Invoice — Deposit (40%)
            </Typography>
            {depositInvoice ? (
              <>
                <Typography sx={{ fontSize: 12, mb: 1 }}>
                  Invoice #{' '}
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    {depositInvoice.invoiceNumber || '—'}
                  </Box>
                  {' · '}
                  Issued{' '}
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    {depositInvoice.issuedAt
                      ? format(new Date(depositInvoice.issuedAt), 'M/d/yyyy')
                      : '—'}
                  </Box>
                </Typography>
                <Typography sx={{ fontSize: 12, mb: 1 }}>
                  Estimate #{' '}
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    {depositInvoice.estimateNumber || estimateDoc?.estimateNumber || '—'}
                  </Box>
                </Typography>
                <Typography sx={{ fontSize: 12, mb: 1.5 }}>
                  Bill to:{' '}
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    {data.customerName}
                  </Box>
                </Typography>
                <Typography sx={{ fontSize: 11, mb: 2, lineHeight: 1.5 }}>
                  {data.addr1}
                  <br />
                  {data.addr2}
                </Typography>
                {depositInvoice.contractTotal != null ? (
                  <Typography sx={{ fontSize: 12, mb: 1 }}>
                    Contract total:{' '}
                    <Box component="span" sx={{ fontWeight: 700 }}>
                      ${formatMoneyUsd(depositInvoice.contractTotal)}
                    </Box>
                  </Typography>
                ) : null}

                <Box sx={{ border: '1px solid #000', mb: 2 }}>
                  <Box sx={{ display: 'flex', borderBottom: '1px solid #000', bgcolor: '#f0f0f0', fontSize: 10, fontWeight: 700 }}>
                    <Box sx={{ flex: 2, p: 0.75, borderRight: '1px solid #000' }}>Description</Box>
                    <Box sx={{ width: 80, p: 0.75, textAlign: 'right' }}>Amount</Box>
                  </Box>
                  {(Array.isArray(depositInvoice.lineItems) ? depositInvoice.lineItems : []).map((li, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        display: 'flex',
                        borderBottom:
                          idx === (depositInvoice.lineItems?.length || 0) - 1 ? 'none' : '1px solid #ddd',
                        fontSize: 10,
                      }}
                    >
                      <Box sx={{ flex: 2, p: 0.75, borderRight: '1px solid #ddd' }}>
                        <Box sx={{ fontWeight: 600 }}>{String(li?.itemName || '').trim() || '—'}</Box>
                        {String(li?.description || '').trim() ? (
                          <Box sx={{ fontSize: 9, mt: 0.25 }}>{String(li.description).trim()}</Box>
                        ) : null}
                      </Box>
                      <Box sx={{ width: 80, p: 0.75, textAlign: 'right', fontWeight: 700 }}>
                        ${formatMoneyUsd(li?.total)}
                      </Box>
                    </Box>
                  ))}
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Box sx={{ width: 220, border: '2px solid #000', p: 1.25, textAlign: 'right' }}>
                    <Typography sx={{ fontSize: 11 }}>Amount due (deposit)</Typography>
                    <Typography sx={{ fontSize: 18, fontWeight: 700, mt: 0.5 }}>
                      ${formatMoneyUsd(depositInvoice.balanceDue ?? depositInvoice.total)}
                    </Typography>
                  </Box>
                </Box>
                {String(depositInvoice.notes || '').trim() ? (
                  <Typography sx={{ fontSize: 10, mt: 2, lineHeight: 1.45 }}>
                    {String(depositInvoice.notes).trim()}
                  </Typography>
                ) : null}
              </>
            ) : (
              <Typography sx={{ fontSize: 13, lineHeight: 1.6 }}>
                No deposit invoice found for this job yet. Use Create contract (job Files tab) or Finance Hub to generate
                a deposit invoice — then reopen this packet or download again.
              </Typography>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={handleDownloadPdf} disabled={exporting}>
          Download PDF
        </Button>
        <Button variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint} disabled={exporting}>
          Print
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default JobContractPacketDialog;
