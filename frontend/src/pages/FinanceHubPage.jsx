import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  Link,
  Radio,
  RadioGroup,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { createFilterOptions } from '@mui/material/Autocomplete';
import {
  Add as AddIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Delete as DeleteIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Print as PrintIcon,
  ReceiptLong as ReceiptLongIcon,
} from '@mui/icons-material';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import axios from 'axios';
import toast from 'react-hot-toast';
import RegisterLedgerSection from '../components/finance/RegisterLedgerSection';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const ESTIMATE_PREFIX = '1102';
const ESTIMATE_SEQ_KEY = 'financeHubEstimateSequence';
const ESTIMATE_DESC_HINTS_KEY = 'financeHubEstimateDescriptionHints';
const ESTIMATE_DESC_HINTS_MAX = 250;

const filterEstimateDescriptionOptions = createFilterOptions({
  limit: 80,
  stringify: (option) => option,
});

function readEstimateDescriptionHints() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ESTIMATE_DESC_HINTS_KEY);
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.trim()) : [];
  } catch {
    return [];
  }
}

/** Remember descriptions from saved estimates for autocomplete on this browser. */
function mergeEstimateDescriptionHints(newDescriptions) {
  if (typeof window === 'undefined') return;
  const incoming = newDescriptions.map((d) => String(d || '').trim()).filter(Boolean);
  if (incoming.length === 0) return;
  const prev = readEstimateDescriptionHints();
  const seen = new Set();
  const merged = [];
  for (const s of [...incoming, ...prev]) {
    if (seen.has(s)) continue;
    seen.add(s);
    merged.push(s);
    if (merged.length >= ESTIMATE_DESC_HINTS_MAX) break;
  }
  window.localStorage.setItem(ESTIMATE_DESC_HINTS_KEY, JSON.stringify(merged));
}

function collectDescriptionsFromEstimateSnapshot(est) {
  if (!est?.lineItems || !Array.isArray(est.lineItems)) return [];
  return est.lineItems
    .map((li) => String(li.description || '').trim())
    .filter(Boolean);
}

const COMPANY_PHONE = '951 491-1137';
const COMPANY_EMAIL = 'office@sanclementewoodworking.com';
const COMPANY_WEBSITE = 'www.sanclementewoodworking.com';

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

/** Legacy browser snapshot key kept for one-time cleanup migration. */
const LOCAL_EST_SNAPSHOT_STACK_KEY = 'financeHubSavedEstimateSnapshots';

function cloneEstimateForm(f) {
  return JSON.parse(JSON.stringify(f));
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

function hasMeaningfulJobSiteAddress(addr) {
  if (!addr || typeof addr !== 'object') return false;
  return !!(String(addr.street || '').trim() || String(addr.city || '').trim());
}

/** True if this snapshot is worth listing (matches server push heuristic). */
function revisionSnapshotNonEmpty(est) {
  if (!est || typeof est !== 'object') return false;
  return !!(
    (est.number && String(est.number).trim()) ||
    (Array.isArray(est.lineItems) && est.lineItems.length > 0) ||
    (typeof est.amount === 'number' && est.amount > 0) ||
    est.sentAt != null ||
    !!(est.estimateDate && String(est.estimateDate).trim())
  );
}

/** Oldest → newest; current `job.estimate` is always last when non-empty. */
function buildEstimateRevisions(job) {
  const history = Array.isArray(job?.estimateHistory) ? job.estimateHistory : [];
  const current = job?.estimate || {};
  const revs = history.filter(revisionSnapshotNonEmpty).map((snap) => ({ ...snap }));
  if (revisionSnapshotNonEmpty(current)) {
    revs.push({ ...current });
  }
  return revs;
}

/**
 * Revisions shown in Finance Hub ← → for a job: server history + current, augmented with
 * this-browser saves for the same job when the server stack has fewer than two entries
 * (so you can browse after a single save).
 */
function buildJobEstimateBrowseRevisions(job) {
  return buildEstimateRevisions(job);
}

function computeEstimateFormFromJobSnapshot(job, snapshot) {
  const cust = job.customerId;
  const est = snapshot || {};
  const sent = est.sentAt ? new Date(est.sentAt) : null;
  const lineItems =
    snapshot && Array.isArray(est.lineItems) && est.lineItems.length > 0
      ? est.lineItems.map(mapEstimateLineFromJob)
      : DEFAULT_LINE_ITEMS();
  return {
    estimateNumber:
      snapshot && est.number
        ? est.number
        : formatEstimateNumber(readEstimateSequence()),
    estimateDate:
      est.estimateDate ||
      (sent ? sent.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
    customerId: typeof cust === 'object' && cust?._id ? cust._id : cust || null,
    customerName: typeof cust === 'object' ? cust.name || '' : '',
    customerAddress: hasMeaningfulJobSiteAddress(job.jobAddress)
      ? {
          street: job.jobAddress.street || '',
          city: job.jobAddress.city || '',
        }
      : typeof cust === 'object' && cust.address
        ? {
            street: cust.address.street || '',
            city: cust.address.city || '',
          }
        : { street: '', city: '' },
    projectName: est.projectName || job.title || '',
    lineItems,
    footerNote:
      est.footerNote || 'Customer acknowledges paint and stain are not included.',
  };
}

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

function normalizeEstimateFormForCompare(form) {
  if (!form || typeof form !== 'object') return {};
  return {
    estimateNumber: String(form.estimateNumber || ''),
    estimateDate: String(form.estimateDate || ''),
    customerId:
      form.customerId != null && typeof form.customerId === 'object'
        ? String(form.customerId?._id || '')
        : String(form.customerId || ''),
    customerName: String(form.customerName || ''),
    customerAddress: {
      street: String(form.customerAddress?.street || ''),
      city: String(form.customerAddress?.city || ''),
    },
    projectName: String(form.projectName || ''),
    lineItems: Array.isArray(form.lineItems)
      ? form.lineItems.map((row) => ({
          itemName: String(row?.itemName || ''),
          description: String(row?.description || ''),
          quantity: Number(row?.quantity) || 0,
          total: String(row?.total || ''),
        }))
      : [],
    footerNote: String(form.footerNote || ''),
  };
}

function buildFreshEstimateDraftForJob(job, nextEstimateNumber) {
  const base = computeEstimateFormFromJobSnapshot(job, null);
  return {
    ...base,
    estimateNumber: nextEstimateNumber,
    estimateDate: new Date().toISOString().slice(0, 10),
    projectName: '',
    lineItems: DEFAULT_LINE_ITEMS(),
    footerNote: 'Customer acknowledges paint and stain are not included.',
  };
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
  const [isEstimateExportMode, setIsEstimateExportMode] = useState(false);
  const estimateCanvasRef = useRef(null);
  const invoicePdfRef = useRef(null);
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [createInvoiceKind, setCreateInvoiceKind] = useState('deposit');
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [invoicePdfPayload, setInvoicePdfPayload] = useState(null);
  /** Full job JSON when editing via `jobId` (drives revision stack). */
  const [loadedEstimateJob, setLoadedEstimateJob] = useState(null);
  /** Index into server revision list for this job (0 = oldest). */
  const [estimateRevisionIndex, setEstimateRevisionIndex] = useState(0);
  /** True when user clicked "New estimate" and is editing a fresh unsaved estimate draft. */
  const [isNewEstimateDraft, setIsNewEstimateDraft] = useState(false);
  const [newEstimatePromptOpen, setNewEstimatePromptOpen] = useState(false);
  const [estimateForm, setEstimateForm] = useState(() => ({
    estimateNumber: formatEstimateNumber(readEstimateSequence()),
    estimateDate: new Date().toISOString().slice(0, 10),
    customerId: null,
    customerName: '',
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

  /** Bumps when localStorage description hints change so the list refreshes. */
  const [estimateDescHintsRev, setEstimateDescHintsRev] = useState(0);

  const estimateFormRef = useRef(estimateForm);
  const [lastSyncedEstimateForm, setLastSyncedEstimateForm] = useState(() =>
    normalizeEstimateFormForCompare(estimateForm)
  );

  useEffect(() => {
    estimateFormRef.current = estimateForm;
  }, [estimateForm]);

  const estimateRevisions = useMemo(
    () => (loadedEstimateJob ? buildJobEstimateBrowseRevisions(loadedEstimateJob) : []),
    [loadedEstimateJob]
  );

  const invoiceEstimateNumber = useMemo(() => {
    if (isNewEstimateDraft) return estimateForm.estimateNumber;
    const rev = estimateRevisions[estimateRevisionIndex];
    return rev?.number || estimateForm.estimateNumber;
  }, [
    isNewEstimateDraft,
    estimateForm.estimateNumber,
    estimateRevisions,
    estimateRevisionIndex,
  ]);

  const invoiceDepositPreview = useMemo(
    () => Math.round((estimateTotal * 0.4 + Number.EPSILON) * 100) / 100,
    [estimateTotal]
  );
  const invoiceFinalPreview = useMemo(
    () => Math.round((estimateTotal * 0.6 + Number.EPSILON) * 100) / 100,
    [estimateTotal]
  );

  const canCreateInvoice =
    Boolean(estimateJobId) &&
    !loadingJobEstimate &&
    !isNewEstimateDraft &&
    estimateTotal > 0 &&
    Boolean(estimateForm.customerId);

  /** Clear legacy browser-only estimate snapshots; server revisions are authoritative. */
  useEffect(() => {
    if (activeTab !== 'estimates' || typeof window === 'undefined') return;
    window.localStorage.removeItem(LOCAL_EST_SNAPSHOT_STACK_KEY);
  }, [activeTab]);

  /** Use live revision count so → never caps with a stale `estimateRevisions.length` from a past render. */
  const goJobEstimateRevisionOlder = useCallback(() => {
    setEstimateRevisionIndex((i) => Math.max(0, i - 1));
  }, []);

  const goJobEstimateRevisionNewer = useCallback(() => {
    setEstimateRevisionIndex((i) => {
      if (!loadedEstimateJob) return i;
      const revs = buildJobEstimateBrowseRevisions(loadedEstimateJob);
      const maxIdx = revs.length > 0 ? revs.length - 1 : 0;
      return Math.min(maxIdx, i + 1);
    });
  }, [loadedEstimateJob]);

  const descriptionAutocompleteOptions = useMemo(() => {
    const out = [];
    const seen = new Set();
    const push = (s) => {
      const t = String(s || '').trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    };
    for (const row of estimateForm.lineItems) {
      push(row.description);
    }
    if (loadedEstimateJob) {
      for (const d of collectDescriptionsFromEstimateSnapshot(loadedEstimateJob.estimate)) {
        push(d);
      }
      for (const h of loadedEstimateJob.estimateHistory || []) {
        for (const d of collectDescriptionsFromEstimateSnapshot(h)) {
          push(d);
        }
      }
    }
    for (const d of readEstimateDescriptionHints()) {
      push(d);
    }
    return out;
  }, [estimateForm.lineItems, loadedEstimateJob, estimateDescHintsRev]);

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
    if (activeTab !== 'estimates' || !estimateJobId) {
      setLoadedEstimateJob(null);
      setEstimateRevisionIndex(0);
      return undefined;
    }
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
        setLoadedEstimateJob(job);
        const revs = buildJobEstimateBrowseRevisions(job);
        setEstimateRevisionIndex(revs.length > 0 ? revs.length - 1 : 0);
        setIsNewEstimateDraft(false);
        setNewEstimatePromptOpen(false);
        setEditingJobSummary({
          _id: job._id,
          title: job.title || '',
          stage: job.stage || '',
          description: job.description || '',
        });
      } catch (error) {
        console.error('Error loading job for estimate:', error);
        setLoadedEstimateJob(null);
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
    if (activeTab !== 'estimates' || !estimateJobId || !loadedEstimateJob) return;
    if (String(loadedEstimateJob._id) !== String(estimateJobId)) return;
    const revs = buildJobEstimateBrowseRevisions(loadedEstimateJob);
    const maxIdx = revs.length > 0 ? revs.length - 1 : 0;
    const idx = revs.length > 0 ? Math.max(0, Math.min(estimateRevisionIndex, maxIdx)) : 0;
    if (revs.length === 0 && estimateRevisionIndex !== 0) {
      setEstimateRevisionIndex(0);
      return;
    }
    if (revs.length > 0 && estimateRevisionIndex !== idx) {
      setEstimateRevisionIndex(idx);
      return;
    }
    const snapshot = revs.length > 0 ? revs[idx] : null;
    const nextForm = computeEstimateFormFromJobSnapshot(loadedEstimateJob, snapshot);
    setEstimateForm(nextForm);
    setLastSyncedEstimateForm(normalizeEstimateFormForCompare(nextForm));
    setIsNewEstimateDraft(false);
  }, [activeTab, estimateJobId, loadedEstimateJob, estimateRevisionIndex]);

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
      const jobCustId =
        loadedEstimateJob?.customerId != null
          ? typeof loadedEstimateJob.customerId === 'object'
            ? loadedEstimateJob.customerId?._id
            : loadedEstimateJob.customerId
          : null;
      const sameJobCustomer =
        estimateJobId &&
        loadedEstimateJob &&
        jobCustId != null &&
        String(newValue._id) === String(jobCustId);
      const jobSite =
        sameJobCustomer && hasMeaningfulJobSiteAddress(loadedEstimateJob.jobAddress)
          ? {
              street: loadedEstimateJob.jobAddress.street || '',
              city: loadedEstimateJob.jobAddress.city || '',
            }
          : null;
      setEstimateForm((prev) => ({
        ...prev,
        customerId: newValue._id,
        customerName: newValue.name || '',
        customerAddress:
          jobSite ||
          {
            street: newValue?.address?.street || '',
            city: newValue?.address?.city || '',
          },
      }));
    } else if (reason === 'clear') {
      setEstimateForm((prev) => ({
        ...prev,
        customerId: null,
        customerName: '',
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
  const buildEstimatePatchPayload = (opts = {}) => {
    const estimateNumber = opts.estimateNumberOverride ?? estimateForm.estimateNumber;
    const estimateDateIso = new Date(`${estimateForm.estimateDate}T12:00:00.000Z`);
    const normalizedRows = buildNormalizedEstimateRows();
    return {
      valueEstimated: estimateTotal || 0,
      estimate: {
        number: estimateNumber,
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
    try {
      setIsEstimateExportMode(true);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const canvas = await html2canvas(estimateCanvasRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        onclone: (_clonedDoc, cloned) => {
          const table = cloned.querySelector('[data-estimate-line-table]');
          if (!table) return;
          const replaceWithWrappedText = (field) => {
            const div = _clonedDoc.createElement('div');
            div.textContent = field.value ?? '';
            const isTotal = field.dataset?.estimateTotal === '1';
            Object.assign(div.style, {
              width: '100%',
              boxSizing: 'border-box',
              fontSize: '12.5px',
              lineHeight: '1.35',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#000',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
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
      setIsEstimateExportMode(false);
    }
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

  const formatInvoiceMoney = (value) =>
    Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const renderInvoicePdfDoc = async () => {
    if (!invoicePdfRef.current) {
      throw new Error('Invoice layout not ready');
    }
    const canvas = await html2canvas(invoicePdfRef.current, {
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

  const handleOpenCreateInvoice = () => {
    setCreateInvoiceKind('deposit');
    setCreateInvoiceOpen(true);
  };

  const handleConfirmCreateInvoice = async () => {
    if (!estimateJobId || !canCreateInvoice) return;
    try {
      setSavingInvoice(true);
      const { data } = await axios.post(`${API_URL}/jobs/${estimateJobId}/invoices`, {
        kind: createInvoiceKind,
        contractTotal: estimateTotal,
        estimateNumber: invoiceEstimateNumber,
        invoiceDate: estimateForm.estimateDate,
      });

      const inv = data.invoice;
      const headline =
        createInvoiceKind === 'deposit' ? 'DEPOSIT INVOICE' : 'FINAL PAYMENT INVOICE';
      const payload = {
        headline,
        kind: createInvoiceKind,
        amount: inv.amount,
        contractTotal: inv.contractTotal,
        estimateNumber: inv.estimateNumber,
        invoiceDate: inv.invoiceDate,
        customerName: estimateForm.customerName,
        projectName: estimateForm.projectName,
        customerAddress: estimateForm.customerAddress,
      };

      flushSync(() => {
        setInvoicePdfPayload(payload);
      });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const doc = await renderInvoicePdfDoc();
      doc.save(`Invoice-${createInvoiceKind}-${inv.estimateNumber}.pdf`);
      flushSync(() => {
        setInvoicePdfPayload(null);
      });
      setCreateInvoiceOpen(false);
      toast.success(
        createInvoiceKind === 'deposit'
          ? 'Deposit invoice saved and downloaded'
          : 'Final invoice saved and downloaded'
      );

      const { data: refreshed } = await axios.get(`${API_URL}/jobs/${estimateJobId}`);
      setLoadedEstimateJob(refreshed);
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error(error.response?.data?.error || error.message || 'Failed to create invoice');
      flushSync(() => {
        setInvoicePdfPayload(null);
      });
    } finally {
      setSavingInvoice(false);
    }
  };

  const estimatePrevJobIdRef = useRef(undefined);
  useEffect(() => {
    const prev = estimatePrevJobIdRef.current;
    estimatePrevJobIdRef.current = estimateJobId;
    if (activeTab !== 'estimates') return;
    if (!estimateJobId && prev) {
      setLoadedEstimateJob(null);
      setEstimateRevisionIndex(0);
      const fresh = {
        estimateNumber: formatEstimateNumber(readEstimateSequence()),
        estimateDate: new Date().toISOString().slice(0, 10),
        customerId: null,
        customerName: '',
        customerAddress: { street: '', city: '' },
        projectName: '',
        lineItems: DEFAULT_LINE_ITEMS(),
        footerNote: 'Customer acknowledges paint and stain are not included.',
      };
      setEstimateForm(fresh);
      setLastSyncedEstimateForm(normalizeEstimateFormForCompare(fresh));
      setIsNewEstimateDraft(false);
      setNewEstimatePromptOpen(false);
      setEditingJobSummary(null);
      setCustomerPipelineJobs([]);
      setEstimateSaveTargetId(null);
    }
  }, [estimateJobId, activeTab]);

  const estimateFormIsDirty = useMemo(() => {
    return (
      JSON.stringify(normalizeEstimateFormForCompare(estimateForm)) !==
      JSON.stringify(lastSyncedEstimateForm)
    );
  }, [estimateForm, lastSyncedEstimateForm]);

  const startNewEstimateDraft = useCallback(() => {
    if (!loadedEstimateJob || !estimateJobId) return;
    const nextNum = formatEstimateNumber(readEstimateSequence());
    const draft = buildFreshEstimateDraftForJob(loadedEstimateJob, nextNum);
    setEstimateForm(draft);
    setLastSyncedEstimateForm(normalizeEstimateFormForCompare(draft));
    setIsNewEstimateDraft(true);
    setEstimateRevisionIndex(Math.max(0, estimateRevisions.length - 1));
  }, [loadedEstimateJob, estimateJobId, estimateRevisions.length]);

  const saveEstimateOnCurrentContext = async () => {
    if (!estimateForm.customerId) {
      toast.error('Select an existing customer');
      return false;
    }
    if (!estimateForm.estimateDate) {
      toast.error('Estimate date is required');
      return false;
    }

    if (estimateJobId) {
      if (isNewEstimateDraft) {
        const newNum = estimateForm.estimateNumber || formatEstimateNumber(readEstimateSequence());
        const patchPayload = buildEstimatePatchPayload({ estimateNumberOverride: newNum });
        await axios.patch(`${API_URL}/jobs/${estimateJobId}`, patchPayload);
        writeEstimateSequence(readEstimateSequence() + 1);
        toast.success(`Estimate ${newNum} saved on this job`);
      } else {
        const currentRevision = estimateRevisions[estimateRevisionIndex] || null;
        const fixedNumber = currentRevision?.number || estimateForm.estimateNumber;
        const patchPayload = buildEstimatePatchPayload({ estimateNumberOverride: fixedNumber });
        await axios.patch(`${API_URL}/jobs/${estimateJobId}/estimate-revision`, {
          revisionIndex: estimateRevisionIndex,
          estimate: patchPayload.estimate,
          valueEstimated: patchPayload.valueEstimated,
          jobAddress: patchPayload.jobAddress,
        });
        toast.success(`Estimate ${fixedNumber} updated`);
      }

      const { data: refreshed } = await axios.get(`${API_URL}/jobs/${estimateJobId}`);
      setLoadedEstimateJob(refreshed);
      const revs = buildJobEstimateBrowseRevisions(refreshed);
      setEstimateRevisionIndex(revs.length > 0 ? revs.length - 1 : 0);
      setIsNewEstimateDraft(false);
      mergeEstimateDescriptionHints(
        estimateForm.lineItems.map((r) => String(r.description || '').trim()).filter(Boolean)
      );
      setEstimateDescHintsRev((n) => n + 1);
      return true;
    }

    const useNewCard = customerPipelineJobs.length === 0 || estimateSaveTargetId === ESTIMATE_NEW_JOB_ID;
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
      return false;
    }

    if (useNewCard) {
      const { data: created } = await axios.post(`${API_URL}/jobs`, buildEstimateCreatePayload());
      const newId = created?._id;
      writeEstimateSequence(readEstimateSequence() + 1);
      mergeEstimateDescriptionHints(
        estimateForm.lineItems.map((r) => String(r.description || '').trim()).filter(Boolean)
      );
      setEstimateDescHintsRev((n) => n + 1);
      if (newId) {
        setSearchParams({ tab: 'estimates', jobId: String(newId) });
      }
      toast.success(`Estimate ${estimateForm.estimateNumber} saved to new job`);
      return true;
    }

    await axios.patch(
      `${API_URL}/jobs/${existingId}`,
      buildEstimatePatchPayload({ estimateNumberOverride: estimateForm.estimateNumber })
    );
    mergeEstimateDescriptionHints(
      estimateForm.lineItems.map((r) => String(r.description || '').trim()).filter(Boolean)
    );
    setEstimateDescHintsRev((n) => n + 1);
    setSearchParams({ tab: 'estimates', jobId: String(existingId) });
    const picked = customerPipelineJobs.find((j) => String(j._id) === String(existingId));
    toast.success(
      `Estimate ${estimateForm.estimateNumber} saved on ${formatEstimateJobPickLabel(estimateForm.customerName, picked)}`
    );
    return true;
  };

  const handleSaveEstimate = async () => {
    try {
      setSavingEstimate(true);
      await saveEstimateOnCurrentContext();
    } catch (error) {
      console.error('Error saving estimate:', error);
      toast.error(error.response?.data?.error || error.message || 'Failed to save estimate');
    } finally {
      setSavingEstimate(false);
    }
  };

  const handleDeleteEstimate = async () => {
    if (!estimateJobId) return;
    if (estimateRevisions.length === 0) {
      toast.error('No estimate revision to delete');
      return;
    }
    const ok = window.confirm('Delete this estimate revision? This cannot be undone.');
    if (!ok) return;
    try {
      setSavingEstimate(true);
      await axios.post(`${API_URL}/jobs/${estimateJobId}/estimate-revision/delete`, {
        revisionIndex: estimateRevisionIndex,
      });
      const { data: refreshed } = await axios.get(`${API_URL}/jobs/${estimateJobId}`);
      setLoadedEstimateJob(refreshed);
      const revs = buildJobEstimateBrowseRevisions(refreshed);
      const maxIdx = revs.length > 0 ? revs.length - 1 : 0;
      setEstimateRevisionIndex(Math.max(0, Math.min(estimateRevisionIndex, maxIdx)));
      setIsNewEstimateDraft(false);
      toast.success('Estimate revision deleted');
    } catch (error) {
      console.error('Error deleting estimate revision:', error);
      toast.error(error.response?.data?.error || 'Failed to delete estimate revision');
    } finally {
      setSavingEstimate(false);
    }
  };

  const handleStartNewEstimate = async () => {
    if (!estimateJobId || !loadedEstimateJob) return;
    if (estimateFormIsDirty) {
      setNewEstimatePromptOpen(true);
      return;
    }
    startNewEstimateDraft();
  };

  const handleCreateNewAfterSave = async () => {
    setNewEstimatePromptOpen(false);
    try {
      setSavingEstimate(true);
      const saved = await saveEstimateOnCurrentContext();
      if (saved) startNewEstimateDraft();
    } catch (error) {
      console.error('Error saving before new estimate:', error);
      toast.error(error.response?.data?.error || error.message || 'Failed to save estimate');
    } finally {
      setSavingEstimate(false);
    }
  };

  const handleCreateNewDiscardCurrent = () => {
    setNewEstimatePromptOpen(false);
    startNewEstimateDraft();
  };

  const estimateRevisionRailSx = {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    py: 1,
    px: 0.5,
    borderRadius: 2,
    bgcolor: (t) =>
      t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    border: 1,
    borderColor: 'divider',
  };

  const revOlderDisabled =
    !estimateJobId ||
    isNewEstimateDraft ||
    loadingJobEstimate ||
    savingEstimate ||
    estimateRevisions.length < 2 ||
    estimateRevisionIndex <= 0;

  const revNewerDisabled =
    !estimateJobId ||
    isNewEstimateDraft ||
    loadingJobEstimate ||
    savingEstimate ||
    estimateRevisions.length < 2 ||
    estimateRevisionIndex >= estimateRevisions.length - 1;

  const showRevisionCaption = estimateJobId && !isNewEstimateDraft && estimateRevisions.length >= 2;

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

      {activeTab === 'register' ? (
        <Card>
          <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
            <RegisterLedgerSection
              active
              headerTitle={activeSection.label}
              headerSubtitle={activeSection.subtitle}
            />
          </CardContent>
        </Card>
      ) : activeTab !== 'estimates' ? (
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
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 2,
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {estimateJobId ? 'Edit estimate' : 'New estimate'}
              </Typography>
              <Chip size="small" color="primary" label={estimateForm.estimateNumber} />
            </Box>

            {!estimateJobId && !loadingJobEstimate && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Estimates are saved to the database and shared across devices. Use a specific job to
                view and browse estimate revisions for that job.
              </Typography>
            )}

            {estimateJobId && estimateRevisions.length < 2 && !loadingJobEstimate && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                To see 1102-0001 and 0002 together here, both saves must be on{' '}
                <strong>this same job</strong> (same jobId). Each <strong>Save estimate</strong>{' '}
                archives the previous version on the server; then use ← →. If you created two
                separate pipeline cards, each card only shows its own latest estimate until you save
                again on that card.
              </Typography>
            )}

            {estimateJobId && isNewEstimateDraft && (
              <Typography variant="body2" color="warning.main" sx={{ mb: 1 }}>
                New estimate draft. Save to create estimate <strong>{estimateForm.estimateNumber}</strong>.
              </Typography>
            )}

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

            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: { xs: 0.75, sm: 1.25, md: 2 },
                  width: '100%',
                  maxWidth: '100%',
                  overflowX: 'auto',
                }}
              >
                <Box sx={estimateRevisionRailSx}>
                  <IconButton
                    size="large"
                    aria-label="Older estimate"
                    title="Older estimate"
                    disabled={revOlderDisabled}
                    onClick={goJobEstimateRevisionOlder}
                    sx={{
                      color: 'text.secondary',
                      '&.Mui-disabled': { color: 'action.disabled' },
                    }}
                  >
                    <ChevronLeftIcon fontSize="large" />
                  </IconButton>
                </Box>

              <Box sx={{ overflowX: 'auto', width: { xs: '100%', md: 'auto' }, flex: '0 1 auto', minWidth: 0 }}>
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
                          <Typography sx={{ fontSize: 13, minWidth: 150 }}>{COMPANY_PHONE}</Typography>
                        </Box>
                        <Typography sx={{ fontSize: 13, ml: 0 }}>{COMPANY_WEBSITE}</Typography>
                        <Typography sx={{ fontSize: 13, minWidth: 260, ml: 0 }}>{COMPANY_EMAIL}</Typography>
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

                <Box sx={{ mt: 3, border: '1px solid #000' }} data-estimate-line-table>
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
                          onChange={(e) => setLineItem(index, 'itemName', e.target.value)}
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
                        <Autocomplete
                          freeSolo
                          options={descriptionAutocompleteOptions}
                          inputValue={row.description}
                          onInputChange={(_, newInputValue, reason) => {
                            if (reason === 'input' || reason === 'clear' || reason === 'reset') {
                              setLineItem(index, 'description', newInputValue);
                            }
                          }}
                          onChange={(_, newValue) => {
                            if (typeof newValue === 'string') {
                              setLineItem(index, 'description', newValue);
                            }
                          }}
                          filterOptions={filterEstimateDescriptionOptions}
                          sx={{ width: '100%' }}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              variant="standard"
                              multiline
                              minRows={2}
                              maxRows={40}
                              InputProps={{
                                ...params.InputProps,
                                disableUnderline: true,
                                sx: {
                                  fontSize: 12.5,
                                  width: '100%',
                                  alignItems: 'flex-start',
                                  overflow: 'visible',
                                  '& .MuiInputBase-root': {
                                    overflow: 'visible',
                                  },
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
                          )}
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
                          onChange={(e) => setLineItem(index, 'quantity', e.target.value)}
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
                          onChange={(e) => setLineItem(index, 'total', e.target.value)}
                          InputProps={{ disableUnderline: true, sx: { fontSize: 12.5 } }}
                          inputProps={{ inputMode: 'decimal', 'data-estimate-total': '1' }}
                          fullWidth
                        />
                        {!isEstimateExportMode && (
                          <IconButton
                            size="small"
                            onClick={() => removeLineItem(index)}
                            disabled={estimateForm.lineItems.length <= 1}
                          >
                            <DeleteIcon fontSize="inherit" />
                          </IconButton>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>

                <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {!isEstimateExportMode && (
                    <Button size="small" startIcon={<AddIcon />} onClick={addLineItem}>
                      Add line
                    </Button>
                  )}
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

                <Box sx={estimateRevisionRailSx}>
                  <IconButton
                    size="large"
                    aria-label="Newer estimate"
                    title="Newer estimate"
                    disabled={revNewerDisabled}
                    onClick={goJobEstimateRevisionNewer}
                    sx={{
                      color: 'text.secondary',
                      '&.Mui-disabled': { color: 'action.disabled' },
                    }}
                  >
                    <ChevronRightIcon fontSize="large" />
                  </IconButton>
                </Box>
              </Box>

              {showRevisionCaption && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1, textAlign: 'center', width: '100%', maxWidth: 816 }}
                >
                  {`Rev ${estimateRevisionIndex + 1} / ${estimateRevisions.length}`}
                </Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', mt: 3, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                startIcon={<PictureAsPdfIcon />}
                onClick={downloadEstimatePdf}
              >
                Download PDF
              </Button>
              <Button
                variant="outlined"
                startIcon={<ReceiptLongIcon />}
                onClick={handleOpenCreateInvoice}
                disabled={!canCreateInvoice || savingInvoice}
              >
                Create invoice
              </Button>
              <Button variant="outlined" startIcon={<PrintIcon />} onClick={printEstimatePdf}>
                Print estimate
              </Button>
              {estimateJobId && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleDeleteEstimate}
                  disabled={savingEstimate || loadingJobEstimate || estimateRevisions.length === 0}
                >
                  Delete estimate
                </Button>
              )}
              {estimateJobId && (
                <Button
                  variant="outlined"
                  onClick={handleStartNewEstimate}
                  disabled={savingEstimate || loadingJobEstimate}
                >
                  New estimate
                </Button>
              )}
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
                {savingEstimate ? 'Saving...' : isNewEstimateDraft ? 'Create estimate' : 'Save estimate'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {invoicePdfPayload && (
        <Box
          ref={invoicePdfRef}
          sx={{
            position: 'fixed',
            left: -12000,
            top: 0,
            width: 816,
            minHeight: 720,
            bgcolor: '#fff',
            color: '#000',
            p: 5,
            boxSizing: 'border-box',
            fontFamily: 'Arial, Helvetica, sans-serif',
            '& .MuiTypography-root': { color: '#000' },
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Box
                component="img"
                src="/logo.png"
                alt=""
                sx={{ width: 56, height: 56, objectFit: 'contain', borderRadius: '50%' }}
              />
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 18 }}>San Clemente Woodworking</Typography>
                <Typography sx={{ fontSize: 12 }}>1030 Calle Sombra, Unit F · San Clemente, CA 92673</Typography>
                <Typography sx={{ fontSize: 12 }}>{COMPANY_PHONE}</Typography>
                <Typography sx={{ fontSize: 12 }}>{COMPANY_EMAIL}</Typography>
              </Box>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontWeight: 700, fontSize: 22 }}>Invoice</Typography>
              <Typography sx={{ fontSize: 12, mt: 0.5 }}>Date: {invoicePdfPayload.invoiceDate}</Typography>
              <Typography sx={{ fontSize: 12 }}>Estimate #: {invoicePdfPayload.estimateNumber}</Typography>
            </Box>
          </Box>

          <Typography
            sx={{
              fontWeight: 800,
              fontSize: 17,
              bgcolor: '#000',
              color: '#fff',
              textAlign: 'center',
              py: 1.25,
              mb: 2,
              letterSpacing: 1,
            }}
          >
            {invoicePdfPayload.headline}
          </Typography>

          <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 0.5 }}>Bill to</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{invoicePdfPayload.customerName}</Typography>
          {invoicePdfPayload.projectName ? (
            <Typography sx={{ fontSize: 13 }}>Project: {invoicePdfPayload.projectName}</Typography>
          ) : null}
          <Typography sx={{ fontSize: 13 }}>
            {[invoicePdfPayload.customerAddress?.street, invoicePdfPayload.customerAddress?.city]
              .filter(Boolean)
              .join(', ')}
          </Typography>

          <Box sx={{ mt: 3, border: '1px solid #000' }}>
            <Box sx={{ display: 'flex', bgcolor: '#000', color: '#fff', fontWeight: 700, fontSize: 12, p: 1 }}>
              <Box sx={{ flex: 1 }}>Description</Box>
              <Box sx={{ width: 128, textAlign: 'right' }}>Amount</Box>
            </Box>
            <Box sx={{ display: 'flex', p: 1.5, fontSize: 13, alignItems: 'flex-start' }}>
              <Box sx={{ flex: 1, pr: 1 }}>
                {invoicePdfPayload.kind === 'deposit'
                  ? 'Deposit invoice — 40% of the contract total shown on the referenced estimate.'
                  : 'Final payment invoice — 60% of the contract total shown on the referenced estimate.'}
              </Box>
              <Box sx={{ width: 128, textAlign: 'right', fontWeight: 700 }}>
                ${formatInvoiceMoney(invoicePdfPayload.amount)}
              </Box>
            </Box>
          </Box>

          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Box sx={{ border: '2px solid #000', px: 2, py: 1, minWidth: 200, textAlign: 'right' }}>
              <Typography sx={{ fontSize: 11, color: '#444' }}>Total due</Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 800 }}>
                ${formatInvoiceMoney(invoicePdfPayload.amount)}
              </Typography>
            </Box>
          </Box>

          <Typography sx={{ fontSize: 11, mt: 3, lineHeight: 1.5 }}>
            Contract total (from estimate): ${formatInvoiceMoney(invoicePdfPayload.contractTotal)}. This invoice is
            for the {invoicePdfPayload.kind === 'deposit' ? 'deposit (40%)' : 'final payment (60%)'} only and
            references estimate {invoicePdfPayload.estimateNumber}.
          </Typography>
        </Box>
      )}

      <Dialog
        open={createInvoiceOpen}
        onClose={() => {
          if (!savingInvoice) setCreateInvoiceOpen(false);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create invoice from estimate</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Invoices are saved on this job. Choose deposit (typically 40% of the estimate total) or final (typically
            60%). The PDF clearly states which type this is.
          </Typography>
          <FormControl component="fieldset" variant="standard" sx={{ width: '100%' }}>
            <FormLabel component="legend">Invoice type</FormLabel>
            <RadioGroup
              value={createInvoiceKind}
              onChange={(e) => setCreateInvoiceKind(e.target.value)}
            >
              <FormControlLabel
                value="deposit"
                control={<Radio />}
                label={`Deposit — $${formatInvoiceMoney(invoiceDepositPreview)} (40% of $${formatInvoiceMoney(estimateTotal)} total)`}
              />
              <FormControlLabel
                value="final"
                control={<Radio />}
                label={`Final — $${formatInvoiceMoney(invoiceFinalPreview)} (60% of $${formatInvoiceMoney(estimateTotal)} total)`}
              />
            </RadioGroup>
          </FormControl>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Estimate # {invoiceEstimateNumber}
            {estimateJobId ? ` · Job ${String(estimateJobId).slice(-8)}` : ''}. Save any estimate edits before
            creating an invoice so totals match.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateInvoiceOpen(false)} disabled={savingInvoice}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleConfirmCreateInvoice} disabled={savingInvoice}>
            {savingInvoice ? 'Working…' : 'Create & download PDF'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={newEstimatePromptOpen} onClose={() => setNewEstimatePromptOpen(false)}>
        <DialogTitle>Unsaved estimate changes</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            You have unsaved edits. Save this estimate first, or discard these changes and start a
            fresh estimate draft.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewEstimatePromptOpen(false)}>Cancel</Button>
          <Button color="warning" onClick={handleCreateNewDiscardCurrent}>
            Discard & start new
          </Button>
          <Button variant="contained" onClick={handleCreateNewAfterSave} disabled={savingEstimate}>
            Save & start new
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default FinanceHubPage;
