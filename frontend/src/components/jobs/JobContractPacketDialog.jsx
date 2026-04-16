import { useRef, useMemo, useCallback, useState } from 'react';
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
import toast from 'react-hot-toast';

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

function contractAmounts(job) {
  const raw = Number(job?.valueContracted) || Number(job?.estimate?.amount) || Number(job?.valueEstimated) || 0;
  const total = Math.round(raw * 100) / 100;
  const totalDisplay = Number.isInteger(total) ? String(Math.round(total)) : total.toFixed(2);
  const written = `${numberToWordsDollars(Math.floor(total))} Dollars and 00/100`;
  return { total, totalDisplay, written };
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
  const [exporting, setExporting] = useState(false);

  const data = useMemo(() => {
    if (!job) return null;
    const customerName = String(job.customerId?.name || '').trim() || '________________';
    const { street, line2 } = buildCustomerAddressLines(job);
    const addr1 = street || '______________________________';
    const addr2 = line2 || '______________________________';
    const { total, totalDisplay, written } = contractAmounts(job);
    const estimateNumber = String(job.estimate?.number || '').trim() || '__________';
    const projectLocation = buildProjectLocationLine(job);
    const contractDate = format(new Date(), 'M/d/yyyy');
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
      qrSrc,
    };
  }, [job]);

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
    if (!page1Ref.current || !page2Ref.current) throw new Error('Contract pages not ready');
    const c1 = await capturePage(page1Ref.current);
    const c2 = await capturePage(page2Ref.current);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    const pageW = 612;
    const pageH = 792;
    doc.addImage(c1.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
    doc.addPage();
    doc.addImage(c2.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
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
      doc.save(`Contract-Packet-${safeName.replace(/\s+/g, '-')}.pdf`);
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
          Preview matches your company template. Customer name, address, estimate #, totals, and project location
          come from this job.
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

            <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
              <Box
                component="img"
                src="/logo.png"
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
                    e.target.style.display = 'none';
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
            <Typography sx={{ fontSize: 22, fontWeight: 700, textAlign: 'center', mb: 2 }}>Contract</Typography>

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
