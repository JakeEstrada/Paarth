import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  IconButton,
  Link,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Print as PrintIcon,
} from '@mui/icons-material';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const ESTIMATE_PREFIX = '1102';
const ESTIMATE_SEQ_KEY = 'financeHubEstimateSequence';

const TAB_DEFS = [
  {
    key: 'register',
    label: 'Register (Balance Sheet)',
    subtitle: 'Track cash movement, balances, and account-level snapshots.',
  },
  {
    key: 'estimates',
    label: 'Estimates',
    subtitle: 'Create and review estimate documents before contract execution.',
  },
  {
    key: 'contracts',
    label: 'Contracts',
    subtitle: 'Manage signed agreements and contract status history.',
  },
  {
    key: 'invoices',
    label: 'Invoices',
    subtitle: 'View billing activity and outstanding customer invoices.',
  },
  {
    key: 'change-orders',
    label: 'Change Orders',
    subtitle: 'Track project scope changes and associated financial impact.',
  },
  {
    key: 'payment-schedules',
    label: 'Payment Schedules',
    subtitle: 'Manage planned payment milestones and due timelines.',
  },
];

function readEstimateSequence() {
  if (typeof window === 'undefined') return 1;
  const raw = window.localStorage.getItem(ESTIMATE_SEQ_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function writeEstimateSequence(next) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ESTIMATE_SEQ_KEY, String(next));
}

function formatEstimateNumber(sequence) {
  return `${ESTIMATE_PREFIX}-${String(sequence).padStart(4, '0')}`;
}

/** Shown after colon in job picker: `Customer: Project · Stage` */
const ESTIMATE_STAGE_LABELS = {
  APPOINTMENT_SCHEDULED: 'Appointment',
  ESTIMATE_IN_PROGRESS: 'Estimate current',
  ESTIMATE_SENT: 'Estimate sent',
  ENGAGED_DESIGN_REVIEW: 'Design review',
  CONTRACT_OUT: 'Contract out',
  CONTRACT_SIGNED: 'Contract signed',
  DEPOSIT_PENDING: 'Deposit pending',
  JOB_PREP: 'Job prep',
  TAKEOFF_COMPLETE: 'Fabrication',
  READY_TO_SCHEDULE: 'Ready to schedule',
  SCHEDULED: 'Scheduled',
  IN_PRODUCTION: 'In production',
  INSTALLED: 'Installed',
  FINAL_PAYMENT_CLOSED: 'Final payment closed',
};

/** Sentinel: save estimate as a new pipeline card even when other jobs exist. */
const ESTIMATE_NEW_JOB_ID = '__estimate_new_job__';
const ESTIMATE_NEW_JOB_OPTION = { _id: ESTIMATE_NEW_JOB_ID, __isNewJobOption: true };

/** Text after first "|" in job title (e.g. site line); otherwise full title. */
function jobTitleAfterPipe(rawTitle) {
  const t = String(rawTitle || '').trim();
  if (!t) return 'Untitled';
  const i = t.indexOf('|');
  if (i >= 0) {
    const tail = t.slice(i + 1).trim();
    return tail || t;
  }
  return t;
}

/**
 * Picker line: Customer: <after | in title> | <description> · <stage> · ID <last 8 of _id>
 * Trailing ID disambiguates duplicate titles/descriptions (worst case).
 */
function formatEstimateJobPickLabel(customerName, job) {
  if (job?.__isNewJobOption) {
    return `${(customerName || 'Customer').trim()}: (New job — separate pipeline card)`;
  }
  const cn = (customerName || 'Customer').trim();
  const siteOrProject = jobTitleAfterPipe(job?.title);
  const desc = String(job?.description || '').trim();
  const stageLabel = ESTIMATE_STAGE_LABELS[job?.stage] || job?.stage || '';
  const core = desc ? `${siteOrProject} | ${desc}` : siteOrProject;
  const stagePart = stageLabel ? ` · ${stageLabel}` : '';
  const idRaw = job?._id != null ? String(job._id) : '';
  const idSuffix =
    idRaw.length >= 8 ? ` · ID ${idRaw.slice(-8)}` : idRaw.length >= 1 ? ` · ID ${idRaw}` : '';
  return `${cn}: ${core}${stagePart}${idSuffix}`;
}

const DEFAULT_LINE_ITEMS = () => [
  { itemName: 'Staircase', description: '', quantity: 1, total: '' },
  { itemName: 'Wall Rail', description: '', quantity: 1, total: '' },
  { itemName: 'Additional', description: '', quantity: 1, total: '' },
];

function mapEstimateLineFromJob(row) {
  if (!row) return { itemName: '', description: '', quantity: 1, total: '' };
  const qty = row.quantity != null && row.quantity !== '' ? row.quantity : 1;
  const tot = row.total != null && row.total !== '' ? String(row.total) : '';
  if (row.itemName != null && String(row.itemName).trim() !== '') {
    return {
      itemName: String(row.itemName),
      description: row.description != null ? String(row.description) : '',
      quantity: qty,
      total: tot,
    };
  }
  const desc = String(row.description || '');
  const sep = ' - ';
  const idx = desc.indexOf(sep);
  if (idx > 0) {
    return {
      itemName: desc.slice(0, idx).trim(),
      description: desc.slice(idx + sep.length).trim(),
      quantity: qty,
      total: tot,
    };
  }
  return { itemName: desc, description: '', quantity: qty, total: tot };
}

function FinanceHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const estimateJobId = searchParams.get('jobId');
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return TAB_DEFS[0].key;
    const t = new URLSearchParams(window.location.search).get('tab');
    return t && TAB_DEFS.some((x) => x.key === t) ? t : TAB_DEFS[0].key;
  });
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingJobEstimate, setLoadingJobEstimate] = useState(false);
  const [savingEstimate, setSavingEstimate] = useState(false);
  const [editingJobSummary, setEditingJobSummary] = useState(null);
  const [customerPipelineJobs, setCustomerPipelineJobs] = useState([]);
  const [loadingCustomerJobs, setLoadingCustomerJobs] = useState(false);
  const [estimateSaveTargetId, setEstimateSaveTargetId] = useState(null);
  const estimateCanvasRef = useRef(null);
  const [estimateForm, setEstimateForm] = useState(() => ({
    estimateNumber: formatEstimateNumber(readEstimateSequence()),
    estimateDate: new Date().toISOString().slice(0, 10),
    customerId: null,
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: {
      street: '',
      city: '',
    },
    projectName: '',
    lineItems: DEFAULT_LINE_ITEMS(),
    footerNote: 'Customer acknowledges paint and stain are not included.',
  }));

  const activeSection = useMemo(
    () => TAB_DEFS.find((tab) => tab.key === activeTab) || TAB_DEFS[0],
    [activeTab]
  );

  const estimateTotal = useMemo(
    () =>
      estimateForm.lineItems.reduce((sum, row) => {
        const n = Number(row.total);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [estimateForm.lineItems]
  );

  const tabParam = searchParams.get('tab');
  const jobIdParam = searchParams.get('jobId');
  useEffect(() => {
    if (tabParam && TAB_DEFS.some((t) => t.key === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam, jobIdParam]);

  useEffect(() => {
    if (activeTab !== 'estimates') return;
    const fetchCustomers = async () => {
      try {
        setLoadingCustomers(true);
        const response = await axios.get(`${API_URL}/customers?limit=1000`);
        setCustomers(response.data.customers || response.data || []);
      } catch (error) {
        console.error('Error fetching customers for estimate form:', error);
      } finally {
        setLoadingCustomers(false);
      }
    };
    fetchCustomers();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'estimates' || !estimateJobId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        setLoadingJobEstimate(true);
        const { data: job } = await axios.get(`${API_URL}/jobs/${estimateJobId}`);
        if (cancelled) return;
        const cust = job.customerId;
        if (cust && typeof cust === 'object' && cust._id) {
          setCustomers((prev) =>
            prev.some((c) => String(c._id) === String(cust._id)) ? prev : [cust, ...prev]
          );
        }
        const est = job.estimate || {};
        const sent = est.sentAt ? new Date(est.sentAt) : null;
        const lineItems =
          Array.isArray(est.lineItems) && est.lineItems.length > 0
            ? est.lineItems.map(mapEstimateLineFromJob)
            : DEFAULT_LINE_ITEMS();
        setEstimateForm({
          estimateNumber: est.number || formatEstimateNumber(readEstimateSequence()),
          estimateDate:
            est.estimateDate ||
            (sent ? sent.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
          customerId: typeof cust === 'object' && cust?._id ? cust._id : cust || null,
          customerName: typeof cust === 'object' ? cust.name || '' : '',
          customerPhone: typeof cust === 'object' ? cust.primaryPhone || '' : '',
          customerEmail: typeof cust === 'object' ? cust.primaryEmail || '' : '',
          customerAddress:
            typeof cust === 'object' && cust.address
              ? {
                  street: cust.address.street || '',
                  city: cust.address.city || '',
                }
              : job.jobAddress
                ? {
                    street: job.jobAddress.street || '',
                    city: job.jobAddress.city || '',
                  }
                : { street: '', city: '' },
          projectName: est.projectName || job.title || '',
          lineItems,
          footerNote:
            est.footerNote || 'Customer acknowledges paint and stain are not included.',
        });
        setEditingJobSummary({
          _id: job._id,
          title: job.title || '',
          stage: job.stage || '',
          description: job.description || '',
        });
      } catch (error) {
        console.error('Error loading job for estimate:', error);
        setEditingJobSummary(null);
        toast.error(error.response?.data?.error || 'Could not load estimate from job');
      } finally {
        if (!cancelled) setLoadingJobEstimate(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, estimateJobId]);

  useEffect(() => {
    if (activeTab !== 'estimates' || !estimateForm.customerId) {
      setCustomerPipelineJobs([]);
      setEstimateSaveTargetId(null);
      return undefined;
    }
    if (estimateJobId) {
      setCustomerPipelineJobs([]);
      setEstimateSaveTargetId(estimateJobId);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingCustomerJobs(true);
        const { data } = await axios.get(`${API_URL}/jobs`, {
          params: { customerId: estimateForm.customerId, limit: 100 },
        });
        const jobs = data.jobs || [];
        if (cancelled) return;
        setCustomerPipelineJobs(jobs);
        if (jobs.length === 0) {
          setEstimateSaveTargetId(null);
        } else if (jobs.length === 1) {
          setEstimateSaveTargetId(String(jobs[0]._id));
        } else {
          setEstimateSaveTargetId(null);
        }
      } catch (error) {
        console.error('Error loading jobs for estimate target:', error);
        if (!cancelled) {
          setCustomerPipelineJobs([]);
          setEstimateSaveTargetId(null);
        }
      } finally {
        if (!cancelled) setLoadingCustomerJobs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, estimateForm.customerId, estimateJobId]);

  const estimateSaveTargetOption = useMemo(() => {
    if (!estimateSaveTargetId) return null;
    if (estimateSaveTargetId === ESTIMATE_NEW_JOB_ID) return ESTIMATE_NEW_JOB_OPTION;
    return customerPipelineJobs.find((j) => String(j._id) === String(estimateSaveTargetId)) || null;
  }, [estimateSaveTargetId, customerPipelineJobs]);

  const estimateJobPickerOptions = useMemo(() => {
    if (!estimateForm.customerId || estimateJobId) return [];
    if (customerPipelineJobs.length <= 1) return [];
    return [...customerPipelineJobs, ESTIMATE_NEW_JOB_OPTION];
  }, [customerPipelineJobs, estimateForm.customerId, estimateJobId]);

  const setEstimateField = (field, value) => {
    setEstimateForm((prev) => ({ ...prev, [field]: value }));
  };

  const setEstimateAddressField = (field, value) => {
    setEstimateForm((prev) => ({
      ...prev,
      customerAddress: { ...prev.customerAddress, [field]: value },
    }));
  };

  const setLineItem = (index, field, value) => {
    setEstimateForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    }));
  };

  const addLineItem = () => {
    setEstimateForm((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, { itemName: '', description: '', quantity: 1, total: '' }],
    }));
  };

  const removeLineItem = (index) => {
    setEstimateForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, i) => i !== index),
    }));
  };

  const handleEstimateCustomerChange = (_, newValue, reason) => {
    if (reason === 'selectOption' && newValue) {
      setEstimateForm((prev) => ({
        ...prev,
        customerId: newValue._id,
        customerName: newValue.name || '',
        customerPhone: newValue.primaryPhone || '',
        customerEmail: newValue.primaryEmail || '',
        customerAddress: {
          street: newValue?.address?.street || '',
          city: newValue?.address?.city || '',
        },
      }));
    } else if (reason === 'clear') {
      setEstimateForm((prev) => ({
        ...prev,
        customerId: null,
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        customerAddress: { street: '', city: '' },
      }));
      setCustomerPipelineJobs([]);
      setEstimateSaveTargetId(null);
      setEditingJobSummary(null);
    }
  };

  const buildNormalizedEstimateRows = () =>
    estimateForm.lineItems
      .filter((r) => r.itemName.trim() || r.description.trim())
      .map((r) => ({
        itemName: (r.itemName || 'Item').trim(),
        description: (r.description || '').trim(),
        quantity: Number(r.quantity) || 0,
        unitPrice: 0,
        total: Number(r.total) || 0,
      }));

  /** Update estimate on a job without changing title, stage, or customer. */
  const buildEstimatePatchPayload = () => {
    const estimateDateIso = new Date(`${estimateForm.estimateDate}T12:00:00.000Z`);
    const normalizedRows = buildNormalizedEstimateRows();
    return {
      valueEstimated: estimateTotal || 0,
      estimate: {
        number: estimateForm.estimateNumber,
        amount: estimateTotal || 0,
        sentAt: estimateDateIso.toISOString(),
        estimateDate: estimateForm.estimateDate,
        projectName: estimateForm.projectName || '',
        footerNote: estimateForm.footerNote || '',
        lineItems: normalizedRows,
      },
      jobAddress:
        estimateForm.customerAddress.street || estimateForm.customerAddress.city
          ? estimateForm.customerAddress
          : undefined,
      jobContact:
        estimateForm.customerPhone || estimateForm.customerEmail
          ? {
              phone: estimateForm.customerPhone || undefined,
              email: estimateForm.customerEmail || undefined,
            }
          : undefined,
    };
  };

  /** Brand-new job when the customer has no active pipeline job. */
  const buildEstimateCreatePayload = () => ({
    ...buildEstimatePatchPayload(),
    title: `${estimateForm.customerName || 'Customer'} Estimate ${estimateForm.estimateNumber}`,
    customerId: estimateForm.customerId,
    stage: 'ESTIMATE_IN_PROGRESS',
  });

  const renderEstimatePdfDoc = async () => {
    if (!estimateCanvasRef.current) {
      throw new Error('Estimate canvas not ready');
    }
    const canvas = await html2canvas(estimateCanvasRef.current, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
    });
    const imageData = canvas.toDataURL('image/png');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    const pageW = 612;
    const pageH = 792;
    doc.addImage(imageData, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
    return doc;
  };

  const downloadEstimatePdf = async () => {
    if (!estimateForm.customerId) {
      toast.error('Select an existing customer first');
      return;
    }

    try {
      const doc = await renderEstimatePdfDoc();
      doc.save(`Estimate-${estimateForm.estimateNumber}.pdf`);
      toast.success('Estimate PDF downloaded');
    } catch (error) {
      console.error('Error generating estimate PDF:', error);
      const message = error?.message === 'Estimate canvas not ready' ? error.message : 'Failed to generate estimate PDF';
      toast.error(message);
    }
  };

  const printEstimatePdf = async () => {
    if (!estimateForm.customerId) {
      toast.error('Select an existing customer first');
      return;
    }

    try {
      const doc = await renderEstimatePdfDoc();
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
      console.error('Error creating printable estimate:', error);
      const message = error?.message === 'Estimate canvas not ready' ? error.message : 'Failed to open print view';
      toast.error(message);
    }
  };

  const estimatePrevJobIdRef = useRef(undefined);
  useEffect(() => {
    const prev = estimatePrevJobIdRef.current;
    estimatePrevJobIdRef.current = estimateJobId;
    if (activeTab !== 'estimates') return;
    if (!estimateJobId && prev) {
      setEstimateForm({
        estimateNumber: formatEstimateNumber(readEstimateSequence()),
        estimateDate: new Date().toISOString().slice(0, 10),
        customerId: null,
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        customerAddress: { street: '', city: '' },
        projectName: '',
        lineItems: DEFAULT_LINE_ITEMS(),
        footerNote: 'Customer acknowledges paint and stain are not included.',
      });
      setEditingJobSummary(null);
      setCustomerPipelineJobs([]);
      setEstimateSaveTargetId(null);
    }
  }, [estimateJobId, activeTab]);

  const handleSaveEstimate = async () => {
    if (!estimateForm.customerId) {
      toast.error('Select an existing customer');
      return;
    }
    if (!estimateForm.estimateDate) {
      toast.error('Estimate date is required');
      return;
    }
    try {
      setSavingEstimate(true);
      const patchPayload = buildEstimatePatchPayload();
      if (estimateJobId) {
        await axios.patch(`${API_URL}/jobs/${estimateJobId}`, patchPayload);
        toast.success(`Estimate ${estimateForm.estimateNumber} saved`);
      } else {
        const useNewCard =
          customerPipelineJobs.length === 0 || estimateSaveTargetId === ESTIMATE_NEW_JOB_ID;
        const existingId =
          estimateSaveTargetId &&
          estimateSaveTargetId !== ESTIMATE_NEW_JOB_ID &&
          customerPipelineJobs.some((j) => String(j._id) === String(estimateSaveTargetId))
            ? estimateSaveTargetId
            : null;

        if (!useNewCard && !existingId) {
          toast.error(
            'Select which job this estimate belongs to (list uses: Customer: project · stage).'
          );
          return;
        }

        if (useNewCard) {
          const { data: created } = await axios.post(
            `${API_URL}/jobs`,
            buildEstimateCreatePayload()
          );
          const newId = created?._id;
          const nextSeq = readEstimateSequence() + 1;
          writeEstimateSequence(nextSeq);
          if (newId) {
            setSearchParams({ tab: 'estimates', jobId: String(newId) });
          }
          toast.success(`Estimate ${estimateForm.estimateNumber} saved to new job`);
        } else {
          await axios.patch(`${API_URL}/jobs/${existingId}`, patchPayload);
          const nextSeq = readEstimateSequence() + 1;
          writeEstimateSequence(nextSeq);
          setSearchParams({ tab: 'estimates', jobId: String(existingId) });
          const picked = customerPipelineJobs.find((j) => String(j._id) === String(existingId));
          toast.success(
            `Estimate ${estimateForm.estimateNumber} saved on ${formatEstimateJobPickLabel(estimateForm.customerName, picked)}`
          );
        }
      }
    } catch (error) {
      console.error('Error saving estimate:', error);
      toast.error(error.response?.data?.error || error.message || 'Failed to save estimate');
    } finally {
      setSavingEstimate(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h1" sx={{ mb: 1 }}>
          Finance Hub
        </Typography>
        <Typography variant="body1" color="text.secondary">
          One workspace for register, estimates, contracts, invoices, change orders, and payment
          schedules.
        </Typography>
      </Box>

      <Card sx={{ mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ px: { xs: 1, sm: 2 }, pt: 1 }}
        >
          {TAB_DEFS.map((tab) => (
            <Tab key={tab.key} value={tab.key} label={tab.label} sx={{ textTransform: 'none' }} />
          ))}
        </Tabs>
      </Card>

      {activeTab !== 'estimates' ? (
        <Card>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {activeSection.label}
              </Typography>
              <Chip size="small" color="primary" label="New" />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {activeSection.subtitle}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {estimateJobId ? 'Edit estimate' : 'New estimate'}
              </Typography>
              <Chip size="small" color="primary" label={estimateForm.estimateNumber} />
            </Box>

            <Autocomplete
              options={customers}
              loading={loadingCustomers || loadingJobEstimate}
              value={
                estimateForm.customerId
                  ? customers.find((c) => String(c._id) === String(estimateForm.customerId)) || null
                  : null
              }
              onChange={handleEstimateCustomerChange}
              isOptionEqualToValue={(option, value) => String(option?._id) === String(value?._id)}
              getOptionLabel={(option) => option?.name || ''}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Customer"
                  helperText="Pick the contractor, then the job. Labels use the text after | in the job title, then the job description, then stage (e.g. Customer: 223 Marfield Dr | Treads · Fabrication)."
                  fullWidth
                />
              )}
            />

            {estimateJobId && editingJobSummary && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Editing estimate on{' '}
                <strong>
                  {formatEstimateJobPickLabel(estimateForm.customerName, {
                    _id: editingJobSummary._id,
                    title: editingJobSummary.title,
                    stage: editingJobSummary.stage,
                    description: editingJobSummary.description,
                  })}
                </strong>
              </Typography>
            )}

            {!estimateJobId &&
              estimateForm.customerId &&
              loadingCustomerJobs && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Loading jobs for this customer…
                </Typography>
              )}

            {!estimateJobId &&
              estimateForm.customerId &&
              !loadingCustomerJobs &&
              customerPipelineJobs.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No active pipeline jobs for this customer—save will create a new card.
                </Typography>
              )}

            {!estimateJobId &&
              estimateForm.customerId &&
              !loadingCustomerJobs &&
              customerPipelineJobs.length === 1 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Save to:{' '}
                    <strong>
                      {formatEstimateJobPickLabel(estimateForm.customerName, customerPipelineJobs[0])}
                    </strong>
                  </Typography>
                  {estimateSaveTargetId === ESTIMATE_NEW_JOB_ID ? (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      <Link
                        component="button"
                        type="button"
                        variant="body2"
                        onClick={() => setEstimateSaveTargetId(String(customerPipelineJobs[0]._id))}
                        sx={{ cursor: 'pointer' }}
                      >
                        Use the existing job instead
                      </Link>
                    </Typography>
                  ) : (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      <Link
                        component="button"
                        type="button"
                        variant="body2"
                        onClick={() => setEstimateSaveTargetId(ESTIMATE_NEW_JOB_ID)}
                        sx={{ cursor: 'pointer' }}
                      >
                        Use a new pipeline card instead
                      </Link>
                    </Typography>
                  )}
                </Box>
              )}

            {!estimateJobId && estimateForm.customerId && estimateJobPickerOptions.length > 1 && (
              <Autocomplete
                sx={{ mt: 1.5 }}
                options={estimateJobPickerOptions}
                loading={loadingCustomerJobs}
                value={estimateSaveTargetOption}
                onChange={(_, opt) => {
                  if (!opt) setEstimateSaveTargetId(null);
                  else setEstimateSaveTargetId(String(opt._id));
                }}
                getOptionLabel={(opt) => formatEstimateJobPickLabel(estimateForm.customerName, opt)}
                isOptionEqualToValue={(a, b) => Boolean(a && b && String(a._id) === String(b._id))}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Which job?"
                    helperText="Same site can be two contracts—use description to tell them apart. If still unclear, match the ID suffix to the job in Mongo or the job URL."
                    required
                  />
                )}
              />
            )}

            <Divider sx={{ my: 2 }} />

            <Box sx={{ overflowX: 'auto' }}>
              <Box
                ref={estimateCanvasRef}
                sx={{
                  width: 816,
                  minHeight: 1056,
                  mx: 'auto',
                  bgcolor: '#fff',
                  color: '#000',
                  p: 5,
                  border: '1px solid #d9d9d9',
                  fontFamily: 'Arial, Helvetica, sans-serif',
                  // Keep estimate sheet typography print-like in dark mode.
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
                          <TextField
                            variant="standard"
                            value={estimateForm.customerPhone}
                            onChange={(e) => setEstimateField('customerPhone', e.target.value)}
                            placeholder="951 491-1137"
                            InputProps={{ disableUnderline: true, sx: { fontSize: 13, minWidth: 150 } }}
                          />
                        </Box>
                        <Typography sx={{ fontSize: 13, ml: 0 }}>www.sanclementewoodworking.com</Typography>
                        <TextField
                          variant="standard"
                          value={estimateForm.customerEmail}
                          onChange={(e) => setEstimateField('customerEmail', e.target.value)}
                          placeholder="office@sanclementewoodworking.com"
                          InputProps={{ disableUnderline: true, sx: { fontSize: 13, minWidth: 260 } }}
                          sx={{ ml: 0 }}
                        />
                      </Box>
                    </Box>
                  </Box>

                  <Box sx={{ textAlign: 'right' }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 22, mb: 1 }}>Estimate</Typography>
                    <Box sx={{ width: 252, border: '1px solid #000' }}>
                      <Box sx={{ display: 'flex', bgcolor: '#000', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                        <Box sx={{ width: '56%', p: 1, borderRight: '1px solid #fff' }}>Date</Box>
                        <Box sx={{ width: '44%', p: 1 }}>Estimate #</Box>
                      </Box>
                      <Box sx={{ display: 'flex' }}>
                        <TextField
                          variant="standard"
                          type="date"
                          value={estimateForm.estimateDate}
                          onChange={(e) => setEstimateField('estimateDate', e.target.value)}
                          InputProps={{ disableUnderline: true, sx: { fontSize: 12, px: 1, py: 0.8 } }}
                          sx={{ width: '56%', borderRight: '1px solid #000' }}
                        />
                        <TextField
                          variant="standard"
                          value={estimateForm.estimateNumber}
                          InputProps={{
                            disableUnderline: true,
                            readOnly: true,
                            sx: { fontSize: 12, px: 1, py: 0.8, textAlign: 'right' },
                          }}
                          inputProps={{ style: { textAlign: 'right' } }}
                          sx={{ width: '44%' }}
                        />
                      </Box>
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ mt: 3, width: '48%', border: '1px solid #000' }}>
                  <Box sx={{ bgcolor: '#000', color: '#fff', p: 1, fontWeight: 700, fontSize: 12 }}>
                    Name / Address
                  </Box>
                  <Box sx={{ p: 1 }}>
                    <TextField
                      variant="standard"
                      value={estimateForm.customerName}
                      onChange={(e) => setEstimateField('customerName', e.target.value)}
                      placeholder="Customer name"
                      InputProps={{ disableUnderline: true, sx: { fontSize: 13 } }}
                      fullWidth
                    />
                    <TextField
                      variant="standard"
                      value={estimateForm.customerAddress.street}
                      onChange={(e) => setEstimateAddressField('street', e.target.value)}
                      placeholder="Street address"
                      InputProps={{ disableUnderline: true, sx: { fontSize: 13 } }}
                      fullWidth
                    />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <TextField
                        variant="standard"
                        value={estimateForm.customerAddress.city}
                        onChange={(e) => setEstimateAddressField('city', e.target.value)}
                        placeholder="City"
                        InputProps={{ disableUnderline: true, sx: { fontSize: 13 } }}
                        sx={{ flex: 1 }}
                      />
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ mt: 3, border: '1px solid #000' }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '20% 48% 12% 20%', bgcolor: '#000', color: '#fff' }}>
                    <Box sx={{ px: 0.75, py: 0.55, fontWeight: 700, fontSize: 11.5 }}>Item</Box>
                    <Box sx={{ px: 0.75, py: 0.55, fontWeight: 700, fontSize: 11.5 }}>Description</Box>
                    <Box sx={{ px: 0.75, py: 0.55, fontWeight: 700, fontSize: 11.5 }}>Qty</Box>
                    <Box sx={{ px: 0.75, py: 0.55, fontWeight: 700, fontSize: 11.5 }}>Total</Box>
                  </Box>
                  {estimateForm.lineItems.map((row, index) => (
                    <Box
                      key={`line-${index}`}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '20% 48% 12% 20%',
                        borderTop: '1px solid #000',
                        minHeight: 50,
                      }}
                    >
                      <Box sx={{ px: 0.75, py: 0.45, borderRight: '1px solid #000' }}>
                        <TextField
                          variant="standard"
                          value={row.itemName}
                          onChange={(e) => setLineItem(index, 'itemName', e.target.value)}
                          InputProps={{ disableUnderline: true, sx: { fontSize: 12.5 } }}
                          fullWidth
                        />
                      </Box>
                      <Box sx={{ px: 0.75, py: 0.45, borderRight: '1px solid #000' }}>
                        <TextField
                          variant="standard"
                          value={row.description}
                          onChange={(e) => setLineItem(index, 'description', e.target.value)}
                          multiline
                          minRows={2}
                          InputProps={{ disableUnderline: true, sx: { fontSize: 12.5 } }}
                          fullWidth
                        />
                      </Box>
                      <Box sx={{ px: 0.75, py: 0.45, borderRight: '1px solid #000' }}>
                        <TextField
                          variant="standard"
                          type="text"
                          value={row.quantity}
                          onChange={(e) => setLineItem(index, 'quantity', e.target.value)}
                          InputProps={{ disableUnderline: true, sx: { fontSize: 12.5 } }}
                          inputProps={{ inputMode: 'numeric' }}
                          fullWidth
                        />
                      </Box>
                      <Box sx={{ px: 0.75, py: 0.45, display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
                        <TextField
                          variant="standard"
                          type="text"
                          value={row.total}
                          onChange={(e) => setLineItem(index, 'total', e.target.value)}
                          InputProps={{ disableUnderline: true, sx: { fontSize: 12.5 } }}
                          inputProps={{ inputMode: 'decimal' }}
                          fullWidth
                        />
                        <IconButton
                          size="small"
                          onClick={() => removeLineItem(index)}
                          disabled={estimateForm.lineItems.length <= 1}
                        >
                          <DeleteIcon fontSize="inherit" />
                        </IconButton>
                      </Box>
                    </Box>
                  ))}
                </Box>

                <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button size="small" startIcon={<AddIcon />} onClick={addLineItem}>
                    Add line
                  </Button>
                  <Box sx={{ width: 220, border: '1px solid #000', display: 'flex' }}>
                    <Box sx={{ width: '40%', borderRight: '1px solid #000', p: 1, fontWeight: 700, fontSize: 13 }}>
                      Total
                    </Box>
                    <Box sx={{ width: '60%', p: 1, textAlign: 'right', fontWeight: 700, fontSize: 15 }}>
                      ${estimateTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ mt: 1 }}>
                  <TextField
                    variant="standard"
                    value={estimateForm.footerNote}
                    onChange={(e) => setEstimateField('footerNote', e.target.value)}
                    InputProps={{ disableUnderline: true, sx: { fontSize: 12 } }}
                    fullWidth
                  />
                  <Typography sx={{ fontSize: 12, mt: 0.4 }}>Initials ____</Typography>
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', mt: 3, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                startIcon={<PictureAsPdfIcon />}
                onClick={downloadEstimatePdf}
              >
                Download PDF
              </Button>
              <Button variant="outlined" startIcon={<PrintIcon />} onClick={printEstimatePdf}>
                Print estimate
              </Button>
              <Button
                variant="contained"
                onClick={handleSaveEstimate}
                disabled={
                  savingEstimate ||
                  loadingJobEstimate ||
                  loadingCustomerJobs ||
                  (!estimateJobId &&
                    estimateForm.customerId &&
                    customerPipelineJobs.length > 1 &&
                    !estimateSaveTargetId)
                }
              >
                {savingEstimate ? 'Saving...' : 'Save estimate'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}

export default FinanceHubPage;
