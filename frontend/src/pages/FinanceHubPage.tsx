// @ts-nocheck — large page; tighten types incrementally
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
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
  Edit as EditIcon,
  PhotoCamera as PhotoCameraIcon,
  ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import axios from 'axios';
import toast from 'react-hot-toast';
import RegisterLedgerSection from '../components/finance/RegisterLedgerSection';
import { useAuth } from '../context/AuthContext';
import {
  DEFAULT_ESTIMATE_DOCUMENT_SETTINGS,
  mergeEstimateDocumentSettings,
  resolveEstimateDocumentLogoSrc,
} from '../utils/estimateDocumentSettings';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
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

const TAB_DEFS = [
  {
    key: 'register',
    label: 'Register (Balance Sheet)',
    subtitle: 'Track cash movement, balances, and account-level snapshots.',
  },
  {
    key: 'estimates',
    label: 'Estimates',
    subtitle: 'Create and review estimate documents.',
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

const REMOVED_TAB_KEYS = new Set(['contracts', 'invoices']);

function normalizeFinanceTab(tab) {
  if (!tab || REMOVED_TAB_KEYS.has(tab)) return 'register';
  return TAB_DEFS.some((x) => x.key === tab) ? tab : 'register';
}

/** Legacy browser snapshot key kept for one-time cleanup migration. */
const LOCAL_EST_SNAPSHOT_STACK_KEY = 'financeHubSavedEstimateSnapshots';

function cloneEstimateForm(f) {
  return JSON.parse(JSON.stringify(f));
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

function mapEstimateDocToLegacySnapshots(estimateDoc) {
  if (!estimateDoc) return { history: [], current: null };
  return {
    history: [],
    current: {
    number: estimateDoc.estimateNumber || '',
    amount: Number(estimateDoc?.grandTotal || 0),
    sentAt: estimateDoc?.sentAt || null,
    estimateDate: estimateDoc?.estimateDate ? new Date(estimateDoc.estimateDate).toISOString().slice(0, 10) : '',
    projectName: estimateDoc?.projectName || '',
    footerNote: estimateDoc?.footerNote || '',
    lineItems: Array.isArray(estimateDoc?.lineItems) ? estimateDoc.lineItems : [],
    __estimateId: estimateDoc._id || null,
    },
  };
}

function estimateNumberSortValue(estimateNumber) {
  const raw = String(estimateNumber || '').trim();
  const m = raw.match(/^(\d+)-(\d+)$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const prefix = Number(m[1]) || 0;
  const seq = Number(m[2]) || 0;
  return prefix * 100000 + seq;
}

function isPopulatedDocRef(value) {
  return value != null && typeof value === 'object';
}

function sortEstimatesByNumber(list) {
  return [...(list || [])].sort(
    (a, b) => estimateNumberSortValue(a?.estimateNumber) - estimateNumberSortValue(b?.estimateNumber)
  );
}

function findEstimateInLists(estimateId, lists) {
  const id = String(estimateId || '');
  if (!id) return null;
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const hit = list.find((e) => String(e?._id || '') === id);
    if (hit) return hit;
  }
  return null;
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
    estimateNumber: snapshot && est.number ? est.number : '',
    estimateDate:
      est.estimateDate ||
      (sent ? sent.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
    customerId: isPopulatedDocRef(cust) && cust._id ? cust._id : cust || null,
    customerName: isPopulatedDocRef(cust) ? cust.name || '' : '',
    customerAddress: hasMeaningfulJobSiteAddress(job.jobAddress)
      ? {
          street: job.jobAddress.street || '',
          city: job.jobAddress.city || '',
        }
      : isPopulatedDocRef(cust) && cust.address
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

function buildFreshEstimateDraftForJob(job) {
  const base = computeEstimateFormFromJobSnapshot(job, null);
  return {
    ...base,
    estimateNumber: '',
    estimateDate: new Date().toISOString().slice(0, 10),
    projectName: '',
    lineItems: DEFAULT_LINE_ITEMS(),
    footerNote: 'Customer acknowledges paint and stain are not included.',
  };
}

function FinanceHubPage() {
  const { user, tenantIdForBranding } = useAuth();
  const canEditEstimateHeader = ['super_admin', 'admin'].includes(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const estimateJobId = searchParams.get('jobId');
  const estimateIdParam = searchParams.get('estimateId');
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return TAB_DEFS[0].key;
    const t = new URLSearchParams(window.location.search).get('tab');
    return normalizeFinanceTab(t);
  });
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingJobEstimate, setLoadingJobEstimate] = useState(false);
  const [savingEstimate, setSavingEstimate] = useState(false);
  const [editingJobSummary, setEditingJobSummary] = useState(null);
  const [estimateBrowserRows, setEstimateBrowserRows] = useState([]);
  const [loadingEstimateBrowser, setLoadingEstimateBrowser] = useState(false);
  const [estimateJumpNumber, setEstimateJumpNumber] = useState('');
  const [showEstimateBrowserList, setShowEstimateBrowserList] = useState(false);
  const [customerPipelineJobs, setCustomerPipelineJobs] = useState([]);
  const [loadingCustomerJobs, setLoadingCustomerJobs] = useState(false);
  const [estimateSaveTargetId, setEstimateSaveTargetId] = useState(null);
  const [isEstimateExportMode, setIsEstimateExportMode] = useState(false);
  const estimateCanvasRef = useRef(null);
  /** Avoid refetching full jobs / estimate lists on arrow navigation. */
  const estimateNavPrevRef = useRef({ jobId: null, estimateId: null });
  const jobCacheRef = useRef(new Map());
  const jobEstimatesCacheRef = useRef(new Map());
  const estimateDocCacheRef = useRef(new Map());
  const [switchingEstimate, setSwitchingEstimate] = useState(false);
  const [changeOrdersList, setChangeOrdersList] = useState([]);
  const [loadingChangeOrders, setLoadingChangeOrders] = useState(false);
  /** Full job JSON (consumer context only). */
  const [loadedEstimateJob, setLoadedEstimateJob] = useState(null);
  /** First-class estimate source of truth for current job context. */
  const [loadedEstimateDoc, setLoadedEstimateDoc] = useState(null);
  /** All saved estimates on the open job (sorted by estimate number). */
  const [jobEstimates, setJobEstimates] = useState([]);
  /** True when user clicked "New estimate" and is editing a fresh unsaved estimate draft. */
  const [isNewEstimateDraft, setIsNewEstimateDraft] = useState(false);
  const [estimateDocSettings, setEstimateDocSettings] = useState(() => ({
    ...DEFAULT_ESTIMATE_DOCUMENT_SETTINGS,
  }));
  const [estimateHeaderDialogOpen, setEstimateHeaderDialogOpen] = useState(false);
  const [estimateHeaderDraft, setEstimateHeaderDraft] = useState(() => ({
    ...DEFAULT_ESTIMATE_DOCUMENT_SETTINGS,
  }));
  const [savingEstimateHeader, setSavingEstimateHeader] = useState(false);
  const [uploadingEstimateLogo, setUploadingEstimateLogo] = useState(false);
  const [estimateLogoCacheBust, setEstimateLogoCacheBust] = useState(() => Date.now());
  const [estimateForm, setEstimateForm] = useState(() => ({
    estimateNumber: '',
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

  const loadEstimateBrowser = useCallback(async (search = '') => {
    try {
      setLoadingEstimateBrowser(true);
      const params = {};
      const s = String(search || '').trim();
      if (s) params.search = s;
      const { data } = await axios.get(`${API_URL}/estimates`, { params });
      const list = Array.isArray(data) ? data : data?.estimates || [];
      setEstimateBrowserRows(list);
      return list;
    } catch (error) {
      console.error('Error loading estimates browser:', error);
      toast.error(error.response?.data?.error || 'Failed to load estimates browser');
      setEstimateBrowserRows([]);
      return [];
    } finally {
      setLoadingEstimateBrowser(false);
    }
  }, []);

  const openEstimateFromBrowser = useCallback(
    (row) => {
      const jobId = row?.jobId?._id || row?.jobId || null;
      if (!jobId) {
        toast.error('This estimate has no linked job');
        return;
      }
      const next = { tab: 'estimates', jobId: String(jobId) };
      if (row?._id) next.estimateId = String(row._id);
      setSearchParams(next);
    },
    [setSearchParams]
  );

  const selectedEstimateSnapshot = useMemo(() => {
    if (!loadedEstimateDoc) return null;
    return mapEstimateDocToLegacySnapshots(loadedEstimateDoc).current || null;
  }, [loadedEstimateDoc]);
  const orderedEstimateBrowserRows = useMemo(() => {
    return [...estimateBrowserRows].sort((a, b) => {
      const av = estimateNumberSortValue(a?.estimateNumber);
      const bv = estimateNumberSortValue(b?.estimateNumber);
      if (av !== bv) return av - bv;
      const ad = new Date(a?.createdAt || 0).getTime();
      const bd = new Date(b?.createdAt || 0).getTime();
      return ad - bd;
    });
  }, [estimateBrowserRows]);

  /** All estimates in number order (1102-001, 1102-002, …) for arrow + strip navigation. */
  const sequentialEstimateNavRows = useMemo(() => {
    const byId = new Map();
    const add = (row) => {
      if (!row?._id) return;
      byId.set(String(row._id), row);
    };
    orderedEstimateBrowserRows.forEach(add);
    jobEstimates.forEach(add);
    if (loadedEstimateDoc?._id) add(loadedEstimateDoc);
    const rows = Array.from(byId.values());
    rows.sort((a, b) => {
      const av = estimateNumberSortValue(a?.estimateNumber);
      const bv = estimateNumberSortValue(b?.estimateNumber);
      if (av !== bv) return av - bv;
      return new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime();
    });
    return rows;
  }, [orderedEstimateBrowserRows, jobEstimates, loadedEstimateDoc]);

  const activeEstimateNavId =
    estimateIdParam ||
    loadedEstimateDoc?._id ||
    selectedEstimateSnapshot?.__estimateId ||
    null;

  const invoiceEstimateNumber = useMemo(() => {
    if (isNewEstimateDraft) return estimateForm.estimateNumber || 'TBD';
    return selectedEstimateSnapshot?.number || estimateForm.estimateNumber || 'TBD';
  }, [
    isNewEstimateDraft,
    estimateForm.estimateNumber,
    selectedEstimateSnapshot,
  ]);

  const effectiveEstimateNavIndex = useMemo(() => {
    const rows = sequentialEstimateNavRows;
    if (!rows.length) return -1;

    const ids = [
      estimateIdParam,
      loadedEstimateDoc?._id,
      selectedEstimateSnapshot?.__estimateId,
    ].filter(Boolean);

    for (const id of ids) {
      const idx = rows.findIndex((r) => String(r?._id || '') === String(id));
      if (idx >= 0) return idx;
    }

    const num = invoiceEstimateNumber;
    if (num && num !== 'TBD') {
      const idx = rows.findIndex((r) => String(r?.estimateNumber || '') === String(num));
      if (idx >= 0) return idx;
    }

    return -1;
  }, [
    sequentialEstimateNavRows,
    estimateIdParam,
    loadedEstimateDoc,
    selectedEstimateSnapshot,
    invoiceEstimateNumber,
  ]);

  const hydrateJobWithEstimate = useCallback(async (job, preferredEstimateId = null) => {
    if (!job?._id) return { job, estimateDoc: null, estimatesForJob: [] };
    try {
      const { data } = await axios.get(`${API_URL}/estimates`, { params: { jobId: job._id } });
      const list = Array.isArray(data) ? data : data?.estimates || [];
      const sorted = [...list].sort(
        (a, b) => estimateNumberSortValue(a?.estimateNumber) - estimateNumberSortValue(b?.estimateNumber)
      );
      let estimateDoc = null;
      if (preferredEstimateId) {
        estimateDoc = list.find((e) => String(e._id) === String(preferredEstimateId)) || null;
      }
      if (!estimateDoc && sorted.length > 0) {
        estimateDoc = sorted[sorted.length - 1];
      }
      return { job, estimateDoc, estimatesForJob: sorted };
    } catch {
      return { job, estimateDoc: null, estimatesForJob: [] };
    }
  }, []);

  /** Clear legacy browser-only estimate snapshots. */
  useEffect(() => {
    if (activeTab !== 'estimates' || typeof window === 'undefined') return;
    window.localStorage.removeItem(LOCAL_EST_SNAPSHOT_STACK_KEY);
  }, [activeTab]);

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
    if (selectedEstimateSnapshot) {
      for (const d of collectDescriptionsFromEstimateSnapshot(selectedEstimateSnapshot)) {
        push(d);
      }
    }
    for (const d of readEstimateDescriptionHints()) {
      push(d);
    }
    return out;
  }, [estimateForm.lineItems, selectedEstimateSnapshot, estimateDescHintsRev]);

  const tabParam = searchParams.get('tab');
  const jobIdParam = searchParams.get('jobId');
  useEffect(() => {
    if (tabParam) {
      setActiveTab(normalizeFinanceTab(tabParam));
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
    if (activeTab !== 'estimates') return;
    let cancelled = false;
    const loadEstimateHeaderSettings = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/tenants/estimate-document-settings`);
        if (!cancelled) {
          setEstimateDocSettings(mergeEstimateDocumentSettings(data?.settings));
        }
      } catch (error) {
        console.error('Error loading estimate header settings:', error);
        if (!cancelled) {
          setEstimateDocSettings({ ...DEFAULT_ESTIMATE_DOCUMENT_SETTINGS });
        }
      }
    };
    loadEstimateHeaderSettings();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'estimates') return;
    loadEstimateBrowser();
  }, [activeTab, loadEstimateBrowser]);

  useEffect(() => {
    if (activeTab !== 'estimates') return;
    estimateBrowserRows.forEach((row) => {
      if (row?._id) estimateDocCacheRef.current.set(String(row._id), row);
    });
  }, [activeTab, estimateBrowserRows]);

  useEffect(() => {
    if (activeTab !== 'estimates' || !estimateJobId) {
      setLoadedEstimateJob(null);
      setLoadedEstimateDoc(null);
      setJobEstimates([]);
      estimateNavPrevRef.current = { jobId: null, estimateId: null };
      return undefined;
    }

    let cancelled = false;
    const jobKey = String(estimateJobId);
    const estimateKey = estimateIdParam ? String(estimateIdParam) : null;
    const prevNav = estimateNavPrevRef.current;
    const jobChanged = prevNav.jobId !== jobKey;
    const estimateChanged = prevNav.estimateId !== estimateKey;
    estimateNavPrevRef.current = { jobId: jobKey, estimateId: estimateKey };

    const mergeCustomerFromJob = (job) => {
      const cust = job?.customerId;
      if (isPopulatedDocRef(cust) && cust._id) {
        setCustomers((prev) =>
          prev.some((c) => String(c._id) === String(cust._id)) ? prev : [cust, ...prev]
        );
      }
    };

    const applyEditingJobSummary = (job) => {
      setEditingJobSummary({
        _id: job._id,
        title: job.title || '',
        stage: job.stage || '',
        description: job.description || '',
      });
    };

    const rememberEstimateDoc = (doc) => {
      if (!doc?._id) return;
      estimateDocCacheRef.current.set(String(doc._id), doc);
    };

    const lookupEstimateDoc = (estimateId) => {
      if (!estimateId) return null;
      return (
        estimateDocCacheRef.current.get(String(estimateId)) ||
        findEstimateInLists(estimateId, [jobEstimatesCacheRef.current.get(jobKey)])
      );
    };

    const upsertJobEstimate = (estimateDoc) => {
      if (!estimateDoc?._id) return;
      rememberEstimateDoc(estimateDoc);
      setJobEstimates((prev) => {
        const next = prev.some((e) => String(e._id) === String(estimateDoc._id))
          ? prev.map((e) => (String(e._id) === String(estimateDoc._id) ? estimateDoc : e))
          : [...prev, estimateDoc];
        const sorted = sortEstimatesByNumber(next);
        jobEstimatesCacheRef.current.set(jobKey, sorted);
        return sorted;
      });
    };

    (async () => {
      try {
        // Same job, new estimate only — skip full job + list refetch.
        if (!jobChanged && estimateChanged && estimateKey && !isNewEstimateDraft) {
          const cached = lookupEstimateDoc(estimateKey);
          if (cached) {
            setLoadedEstimateDoc(cached);
            setIsNewEstimateDraft(false);
            return;
          }

          setSwitchingEstimate(true);
          const { data: estimateDoc } = await axios.get(`${API_URL}/estimates/${estimateKey}`);
          if (cancelled) return;
          upsertJobEstimate(estimateDoc);
          setLoadedEstimateDoc(estimateDoc);
          setIsNewEstimateDraft(false);
          return;
        }

        const cachedJob = jobCacheRef.current.get(jobKey);
        const cachedJobEstimates = jobEstimatesCacheRef.current.get(jobKey);

        if (cachedJob && jobChanged) {
          setLoadedEstimateJob(cachedJob);
          mergeCustomerFromJob(cachedJob);
          applyEditingJobSummary(cachedJob);
        }
        if (cachedJobEstimates && jobChanged) {
          setJobEstimates(cachedJobEstimates);
        }
        if (estimateKey && !isNewEstimateDraft) {
          const cachedEstimate = lookupEstimateDoc(estimateKey);
          if (cachedEstimate) {
            setLoadedEstimateDoc(cachedEstimate);
          }
        }

        const showFullJobLoading = jobChanged && !cachedJob;
        if (showFullJobLoading) setLoadingJobEstimate(true);

        if (isNewEstimateDraft && !estimateKey) {
          const job =
            cachedJob || (await axios.get(`${API_URL}/jobs/${jobKey}`).then((res) => res.data));
          if (cancelled) return;
          jobCacheRef.current.set(jobKey, job);
          setLoadedEstimateJob(job);
          mergeCustomerFromJob(job);
          applyEditingJobSummary(job);

          let estimatesForJob = cachedJobEstimates;
          if (!estimatesForJob) {
            const { data } = await axios.get(`${API_URL}/estimates`, { params: { jobId: jobKey } });
            estimatesForJob = sortEstimatesByNumber(
              Array.isArray(data) ? data : data?.estimates || []
            );
            estimatesForJob.forEach(rememberEstimateDoc);
            jobEstimatesCacheRef.current.set(jobKey, estimatesForJob);
          }
          setJobEstimates(estimatesForJob);
          setLoadedEstimateDoc(null);
          return;
        }

        const needsJob = jobChanged && !cachedJob;
        const needsEstimateList = jobChanged && !cachedJobEstimates;
        const needsEstimateDoc =
          estimateKey && !isNewEstimateDraft && !lookupEstimateDoc(estimateKey);

        const [job, estimatesForJob, estimateDocFetched] = await Promise.all([
          needsJob
            ? axios.get(`${API_URL}/jobs/${jobKey}`).then((res) => res.data)
            : Promise.resolve(cachedJob || jobCacheRef.current.get(jobKey)),
          needsEstimateList
            ? axios
                .get(`${API_URL}/estimates`, { params: { jobId: jobKey } })
                .then((res) =>
                  sortEstimatesByNumber(Array.isArray(res.data) ? res.data : res.data?.estimates || [])
                )
            : Promise.resolve(cachedJobEstimates || jobEstimatesCacheRef.current.get(jobKey) || []),
          needsEstimateDoc
            ? axios.get(`${API_URL}/estimates/${estimateKey}`).then((res) => res.data)
            : Promise.resolve(lookupEstimateDoc(estimateKey)),
        ]);

        if (cancelled) return;

        if (job) {
          jobCacheRef.current.set(jobKey, job);
          setLoadedEstimateJob(job);
          mergeCustomerFromJob(job);
          applyEditingJobSummary(job);
        }

        if (Array.isArray(estimatesForJob)) {
          estimatesForJob.forEach(rememberEstimateDoc);
          jobEstimatesCacheRef.current.set(jobKey, estimatesForJob);
          setJobEstimates(estimatesForJob);
        }

        let estimateDoc = estimateDocFetched;
        if (!estimateDoc && estimateKey) {
          estimateDoc = findEstimateInLists(estimateKey, [estimatesForJob]);
        }
        if (!estimateDoc && !estimateKey && estimatesForJob?.length) {
          estimateDoc = estimatesForJob[estimatesForJob.length - 1];
        }

        if (estimateDoc) rememberEstimateDoc(estimateDoc);
        setLoadedEstimateDoc(estimateDoc || null);
        setIsNewEstimateDraft(false);

        if (estimateDoc?._id && String(estimateKey || '') !== String(estimateDoc._id)) {
          setSearchParams({
            tab: 'estimates',
            jobId: jobKey,
            estimateId: String(estimateDoc._id),
          });
        }
      } catch (error) {
        console.error('Error loading job for estimate:', error);
        setLoadedEstimateJob(null);
        setLoadedEstimateDoc(null);
        setJobEstimates([]);
        setEditingJobSummary(null);
        toast.error(error.response?.data?.error || 'Could not load estimate from job');
      } finally {
        if (!cancelled) {
          setLoadingJobEstimate(false);
          setSwitchingEstimate(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, estimateJobId, estimateIdParam, isNewEstimateDraft, setSearchParams]);

  useEffect(() => {
    if (activeTab !== 'estimates' || !estimateJobId || !loadedEstimateJob) return;
    if (String(loadedEstimateJob._id) !== String(estimateJobId)) return;
    if (isNewEstimateDraft) return;
    const nextForm = computeEstimateFormFromJobSnapshot(loadedEstimateJob, selectedEstimateSnapshot);
    setEstimateForm(nextForm);
    setLastSyncedEstimateForm(normalizeEstimateFormForCompare(nextForm));
  }, [activeTab, estimateJobId, loadedEstimateJob, selectedEstimateSnapshot, isNewEstimateDraft]);

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
          ? isPopulatedDocRef(loadedEstimateJob.customerId)
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

  const buildEstimateApiPayload = (opts = {}) => {
    const lineItems = buildNormalizedEstimateRows();
    const taxRate = Number(opts.taxRate ?? 0) || 0;
    const discountAmount = Number(opts.discountAmount ?? 0) || 0;
    const subtotal = lineItems.reduce((sum, li) => sum + (Number(li.total) || 0), 0);
    const taxAmount = subtotal * (taxRate / 100);
    const grandTotal = subtotal + taxAmount - discountAmount;
    return {
      estimateDate: estimateForm.estimateDate ? new Date(`${estimateForm.estimateDate}T12:00:00.000Z`).toISOString() : null,
      sentAt: estimateForm.estimateDate ? new Date(`${estimateForm.estimateDate}T12:00:00.000Z`).toISOString() : null,
      projectName: estimateForm.projectName || '',
      footerNote: estimateForm.footerNote || '',
      lineItems,
      taxRate,
      discountAmount,
      notes: '',
      subtotal,
      taxAmount,
      grandTotal,
    };
  };

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
      await persistEstimatePdfArtifact(doc, 'download');
      doc.save(`Estimate-${invoiceEstimateNumber || 'Draft'}.pdf`);
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
      await persistEstimatePdfArtifact(doc, 'print');
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

  const persistEstimatePdfArtifact = async (doc, exportKind) => {
    if (!doc || !loadedEstimateDoc?._id || !estimateForm.customerId) return;
    try {
      const estimateNumber = invoiceEstimateNumber || loadedEstimateDoc?.estimateNumber || 'Draft';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeKind = String(exportKind || 'export').toLowerCase();
      const filename = `Estimate-${estimateNumber}-${safeKind}-${stamp}.pdf`;
      const blob = doc.output('blob');
      const formData = new FormData();
      formData.append('file', new File([blob], filename, { type: 'application/pdf' }));
      formData.append('customerId', String(estimateForm.customerId));
      formData.append('fileType', 'estimate');
      formData.append(
        'description',
        `Immutable estimate PDF artifact (${safeKind}) for estimate ${estimateNumber} [estimateId=${loadedEstimateDoc._id}]`
      );
      await axios.post(`${API_URL}/files/upload-document`, formData);
    } catch (error) {
      console.warn('Failed to persist immutable estimate PDF artifact:', error);
    }
  };

  const estimatePrevJobIdRef = useRef(undefined);
  useEffect(() => {
    const prev = estimatePrevJobIdRef.current;
    estimatePrevJobIdRef.current = estimateJobId;
    if (activeTab !== 'estimates') return;
    if (!estimateJobId && prev) {
      setLoadedEstimateJob(null);
      setLoadedEstimateDoc(null);
      setJobEstimates([]);
      const fresh = {
        estimateNumber: '',
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
      setEditingJobSummary(null);
      setCustomerPipelineJobs([]);
      setEstimateSaveTargetId(null);
    }
  }, [estimateJobId, activeTab]);

  useEffect(() => {
    if (activeTab !== 'change-orders') return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingChangeOrders(true);
        const { data } = await axios.get(`${API_URL}/invoices`, {
          params: { invoiceKind: 'change_order' },
        });
        if (!cancelled) setChangeOrdersList(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error loading change orders:', error);
        if (!cancelled) {
          setChangeOrdersList([]);
          toast.error(error.response?.data?.error || 'Failed to load change orders');
        }
      } finally {
        if (!cancelled) setLoadingChangeOrders(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const estimateFormIsDirty = useMemo(() => {
    return (
      JSON.stringify(normalizeEstimateFormForCompare(estimateForm)) !==
      JSON.stringify(lastSyncedEstimateForm)
    );
  }, [estimateForm, lastSyncedEstimateForm]);

  const openEstimateOnCurrentJob = useCallback(
    (estimateDoc) => {
      if (!estimateJobId || !estimateDoc?._id) return;
      if (estimateFormIsDirty && !isNewEstimateDraft) {
        toast.error('Save or discard your changes before switching estimates');
        return;
      }
      setIsNewEstimateDraft(false);
      setSearchParams({
        tab: 'estimates',
        jobId: String(estimateJobId),
        estimateId: String(estimateDoc._id),
      });
    },
    [estimateJobId, estimateFormIsDirty, isNewEstimateDraft, setSearchParams]
  );

  const navigateToSequentialEstimate = useCallback(
    (row) => {
      if (!row?._id) return;
      if (estimateFormIsDirty && !isNewEstimateDraft) {
        toast.error('Save or discard your changes before switching estimates');
        return;
      }
      setIsNewEstimateDraft(false);
      openEstimateFromBrowser(row);
    },
    [estimateFormIsDirty, isNewEstimateDraft, openEstimateFromBrowser]
  );

  const goEstimateDocOlder = useCallback(() => {
    if (effectiveEstimateNavIndex <= 0) return;
    const target = sequentialEstimateNavRows[effectiveEstimateNavIndex - 1];
    if (target) navigateToSequentialEstimate(target);
  }, [effectiveEstimateNavIndex, sequentialEstimateNavRows, navigateToSequentialEstimate]);

  const goEstimateDocNewer = useCallback(() => {
    if (
      effectiveEstimateNavIndex < 0 ||
      effectiveEstimateNavIndex >= sequentialEstimateNavRows.length - 1
    ) {
      return;
    }
    const target = sequentialEstimateNavRows[effectiveEstimateNavIndex + 1];
    if (target) navigateToSequentialEstimate(target);
  }, [effectiveEstimateNavIndex, sequentialEstimateNavRows, navigateToSequentialEstimate]);

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
      const estimateDocId = loadedEstimateDoc?._id || null;
      const estimatePayload = buildEstimateApiPayload({});
      let savedEstimateId = null;

      let savedDoc = null;
      if (!estimateDocId || isNewEstimateDraft) {
        const { data: createdEstimate } = await axios.post(`${API_URL}/estimates`, {
          customerId: estimateForm.customerId,
          jobId: estimateJobId,
          status: 'draft',
          ...estimatePayload,
        });
        savedEstimateId = createdEstimate?._id || null;
        savedDoc = createdEstimate;
        toast.success(`Estimate ${createdEstimate?.estimateNumber || ''} saved on this job`);
      } else {
        const { data: updatedEstimate } = await axios.patch(`${API_URL}/estimates/${estimateDocId}`, estimatePayload);
        savedEstimateId = updatedEstimate?._id || estimateDocId;
        savedDoc = updatedEstimate;
        toast.success(`Estimate ${updatedEstimate?.estimateNumber || ''} updated`);
      }

      const jobKey = String(estimateJobId);
      if (savedDoc?._id) {
        estimateDocCacheRef.current.set(String(savedDoc._id), savedDoc);
      }

      const { data: refreshed } = await axios.get(`${API_URL}/jobs/${estimateJobId}`);
      jobCacheRef.current.set(jobKey, refreshed);
      setLoadedEstimateJob(refreshed);

      if (!estimateDocId || isNewEstimateDraft) {
        const { data } = await axios.get(`${API_URL}/estimates`, { params: { jobId: estimateJobId } });
        const sorted = sortEstimatesByNumber(Array.isArray(data) ? data : data?.estimates || []);
        sorted.forEach((row) => {
          if (row?._id) estimateDocCacheRef.current.set(String(row._id), row);
        });
        jobEstimatesCacheRef.current.set(jobKey, sorted);
        setJobEstimates(sorted);
        setLoadedEstimateDoc(
          sorted.find((e) => String(e._id) === String(savedEstimateId)) || savedDoc
        );
      } else {
        setLoadedEstimateDoc(savedDoc);
        setJobEstimates((prev) => {
          const next = prev.some((e) => String(e._id) === String(savedDoc._id))
            ? prev.map((e) => (String(e._id) === String(savedDoc._id) ? savedDoc : e))
            : [...prev, savedDoc];
          const sorted = sortEstimatesByNumber(next);
          jobEstimatesCacheRef.current.set(jobKey, sorted);
          return sorted;
        });
      }
      setIsNewEstimateDraft(false);
      if (savedEstimateId) {
        setSearchParams({
          tab: 'estimates',
          jobId: String(estimateJobId),
          estimateId: String(savedEstimateId),
        });
      }
      await loadEstimateBrowser();
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
      const { data: created } = await axios.post(`${API_URL}/jobs`, {
        title: `${estimateForm.customerName || 'Customer'} Estimate`,
        customerId: estimateForm.customerId,
        stage: 'ESTIMATE_IN_PROGRESS',
        valueEstimated: estimateTotal || 0,
      });
      const newId = created?._id;
      if (newId) {
        const { data: createdEstimate } = await axios.post(`${API_URL}/estimates`, {
          customerId: estimateForm.customerId,
          jobId: newId,
          status: 'draft',
          ...buildEstimateApiPayload({}),
        });
        mergeEstimateDescriptionHints(
          estimateForm.lineItems.map((r) => String(r.description || '').trim()).filter(Boolean)
        );
        setEstimateDescHintsRev((n) => n + 1);
        const next = { tab: 'estimates', jobId: String(newId) };
        if (createdEstimate?._id) next.estimateId = String(createdEstimate._id);
        setSearchParams(next);
      } else {
        mergeEstimateDescriptionHints(
          estimateForm.lineItems.map((r) => String(r.description || '').trim()).filter(Boolean)
        );
        setEstimateDescHintsRev((n) => n + 1);
      }
      toast.success('Estimate saved to new job');
      return true;
    }

    const { data: createdEstimate } = await axios.post(`${API_URL}/estimates`, {
      customerId: estimateForm.customerId,
      jobId: existingId,
      status: 'draft',
      ...buildEstimateApiPayload({}),
    });
    mergeEstimateDescriptionHints(
      estimateForm.lineItems.map((r) => String(r.description || '').trim()).filter(Boolean)
    );
    setEstimateDescHintsRev((n) => n + 1);
    const next = { tab: 'estimates', jobId: String(existingId) };
    if (createdEstimate?._id) next.estimateId = String(createdEstimate._id);
    setSearchParams(next);
    const picked = customerPipelineJobs.find((j) => String(j._id) === String(existingId));
    toast.success(
      `Estimate saved on ${formatEstimateJobPickLabel(estimateForm.customerName, picked)}`
    );
    return true;
  };

  const handleOpenEstimateHeaderDialog = () => {
    setEstimateHeaderDraft({ ...estimateDocSettings });
    setEstimateHeaderDialogOpen(true);
  };

  const handleEstimateHeaderDraftChange = (field, value) => {
    setEstimateHeaderDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveEstimateHeader = async () => {
    try {
      setSavingEstimateHeader(true);
      const { data } = await axios.patch(`${API_URL}/tenants/estimate-document-settings`, {
        settings: estimateHeaderDraft,
      });
      const merged = mergeEstimateDocumentSettings(data?.settings);
      setEstimateDocSettings(merged);
      setEstimateHeaderDraft(merged);
      setEstimateHeaderDialogOpen(false);
      toast.success('Estimate header updated');
    } catch (error) {
      console.error('Error saving estimate header settings:', error);
      toast.error(error.response?.data?.error || 'Failed to save estimate header');
    } finally {
      setSavingEstimateHeader(false);
    }
  };

  const handleEstimateLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!canEditEstimateHeader) {
      toast.error('Only admins can upload the estimate logo');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    try {
      setUploadingEstimateLogo(true);
      const formData = new FormData();
      formData.append('logo', file);
      const { data } = await axios.post(`${API_URL}/tenants/estimate-document-logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const merged = mergeEstimateDocumentSettings(data?.settings);
      const bust = Date.now();
      setEstimateLogoCacheBust(bust);
      setEstimateDocSettings(merged);
      setEstimateHeaderDraft(merged);
      toast.success('Estimate logo uploaded');
    } catch (error) {
      console.error('Error uploading estimate logo:', error);
      toast.error(error.response?.data?.error || 'Failed to upload estimate logo');
    } finally {
      setUploadingEstimateLogo(false);
    }
  };

  const resolveLogoSrc = (logoUrl) =>
    resolveEstimateDocumentLogoSrc(logoUrl, tenantIdForBranding, estimateLogoCacheBust);

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

  const handleCopyEstimate = async () => {
    if (!estimateJobId) {
      toast.error('Open an estimate on a job first');
      return;
    }
    if (!loadedEstimateDoc?._id || isNewEstimateDraft) {
      toast.error('Save this estimate before creating a copy');
      return;
    }
    if (estimateFormIsDirty) {
      toast.error('Save your changes before creating a copy');
      return;
    }
    try {
      setSavingEstimate(true);
      const estimatePayload = buildEstimateApiPayload({});
      const { data: copied } = await axios.post(`${API_URL}/estimates`, {
        customerId: estimateForm.customerId,
        jobId: estimateJobId,
        status: 'draft',
        ...estimatePayload,
      });
      const jobKey = String(estimateJobId);
      if (copied?._id) {
        estimateDocCacheRef.current.set(String(copied._id), copied);
      }
      const { data } = await axios.get(`${API_URL}/estimates`, { params: { jobId: estimateJobId } });
      const sorted = sortEstimatesByNumber(Array.isArray(data) ? data : data?.estimates || []);
      sorted.forEach((row) => {
        if (row?._id) estimateDocCacheRef.current.set(String(row._id), row);
      });
      jobEstimatesCacheRef.current.set(jobKey, sorted);
      setJobEstimates(sorted);
      setLoadedEstimateDoc(sorted.find((e) => String(e._id) === String(copied._id)) || copied);
      setIsNewEstimateDraft(false);
      setSearchParams({
        tab: 'estimates',
        jobId: jobKey,
        estimateId: String(copied._id),
      });
      const hydrated = computeEstimateFormFromJobSnapshot(
        loadedEstimateJob,
        mapEstimateDocToLegacySnapshots(copied).current
      );
      setEstimateForm(hydrated);
      setLastSyncedEstimateForm(normalizeEstimateFormForCompare(hydrated));
      await loadEstimateBrowser();
      toast.success(`Created copy ${copied?.estimateNumber || ''}`);
    } catch (error) {
      console.error('Error creating estimate copy:', error);
      toast.error(error.response?.data?.error || error.message || 'Failed to create a copy');
    } finally {
      setSavingEstimate(false);
    }
  };

  const handleDeleteEstimate = async () => {
    if (!estimateJobId) return;
    if (!loadedEstimateDoc?._id) {
      toast.error('No estimate to delete');
      return;
    }
    const ok = window.confirm('Delete this estimate? This cannot be undone.');
    if (!ok) return;
    try {
      setSavingEstimate(true);
      const estimateDocId = loadedEstimateDoc?._id || null;
      if (estimateDocId) {
        await axios.delete(`${API_URL}/estimates/${estimateDocId}`);
      }
      const { data: refreshed } = await axios.get(`${API_URL}/jobs/${estimateJobId}`);
      const hydrated = await hydrateJobWithEstimate(refreshed, null);
      setLoadedEstimateJob(hydrated.job);
      setLoadedEstimateDoc(hydrated.estimateDoc || null);
      setJobEstimates(hydrated.estimatesForJob || []);
      setIsNewEstimateDraft(false);
      const next = { tab: 'estimates', jobId: String(estimateJobId) };
      if (hydrated.estimateDoc?._id) next.estimateId = String(hydrated.estimateDoc._id);
      setSearchParams(next);
      await loadEstimateBrowser();
      toast.success('Estimate deleted');
    } catch (error) {
      console.error('Error deleting estimate:', error);
      toast.error(error.response?.data?.error || 'Failed to delete estimate');
    } finally {
      setSavingEstimate(false);
    }
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

  const docOlderDisabled =
    isNewEstimateDraft ||
    savingEstimate ||
    sequentialEstimateNavRows.length < 2 ||
    effectiveEstimateNavIndex <= 0;

  const docNewerDisabled =
    isNewEstimateDraft ||
    savingEstimate ||
    sequentialEstimateNavRows.length < 2 ||
    effectiveEstimateNavIndex < 0 ||
    effectiveEstimateNavIndex >= sequentialEstimateNavRows.length - 1;

  const showArrowHint =
    !isNewEstimateDraft &&
    sequentialEstimateNavRows.length > 1 &&
    effectiveEstimateNavIndex >= 0;

  const handleJumpToEstimateNumber = async () => {
    const q = String(estimateJumpNumber || '').trim();
    if (!q) return;
    const hitInLocal = estimateBrowserRows.find(
      (r) => String(r?.estimateNumber || '').toLowerCase() === q.toLowerCase()
    );
    if (hitInLocal) {
      openEstimateFromBrowser(hitInLocal);
      return;
    }
    const list = await loadEstimateBrowser(q);
    const exact = list.find(
      (r) => String(r?.estimateNumber || '').toLowerCase() === q.toLowerCase()
    );
    if (exact) {
      openEstimateFromBrowser(exact);
      return;
    }
    toast.error(`Estimate ${q} not found`);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h1" sx={{ mb: 1 }}>
          Finance Hub
        </Typography>
        <Typography variant="body1" color="text.secondary">
          One workspace for register, estimates, change orders, and payment schedules.
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
          ) : activeTab === 'change-orders' ? (
            <Card>
              <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
                  Change Orders
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Same PDF layout as an invoice, titled Change Order, numbered as CO (not INV). Create change orders from a
                  job&apos;s Files tab — estimate-style lines you edit — then find them listed here.
                </Typography>
                {loadingChangeOrders ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={32} />
                  </Box>
                ) : changeOrdersList.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No change orders yet. Create one from the Estimates tab while editing an estimate on a job.
                  </Typography>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Change Order #</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Estimate #</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Job</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Amount
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Issued</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {changeOrdersList.map((row) => (
                        <TableRow key={row._id}>
                          <TableCell>{row.invoiceNumber}</TableCell>
                          <TableCell>{row.estimateNumber || '—'}</TableCell>
                          <TableCell>
                            {isPopulatedDocRef(row.customerId) && row.customerId?.name
                              ? row.customerId.name
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {isPopulatedDocRef(row.jobId) && row.jobId?.title ? row.jobId.title : '—'}
                          </TableCell>
                          <TableCell align="right">${formatInvoiceMoney(row.total)}</TableCell>
                          <TableCell>
                            {row.issuedAt
                              ? new Date(row.issuedAt).toLocaleDateString('en-US')
                              : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
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
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                {canEditEstimateHeader && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={handleOpenEstimateHeaderDialog}
                  >
                    Edit header
                  </Button>
                )}
                <Chip size="small" color="primary" label={invoiceEstimateNumber || 'Pending number'} />
              </Box>
            </Box>

            {!estimateJobId && !loadingJobEstimate && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Estimates are saved to the database and shared across devices. Use a specific job to
                view and browse estimate documents for that job.
              </Typography>
            )}


            {estimateJobId && isNewEstimateDraft && (
              <Typography variant="body2" color="warning.main" sx={{ mb: 1 }}>
                New estimate draft. Save to generate the next estimate number.
              </Typography>
            )}

            <Box
              sx={{
                mb: 2,
                p: 1.5,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1.5,
                bgcolor: (t) =>
                  t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Estimate Browser
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
                <TextField
                  size="small"
                  label="Jump to estimate number"
                  placeholder="1102-0001"
                  value={estimateJumpNumber}
                  onChange={(e) => setEstimateJumpNumber(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleJumpToEstimateNumber();
                  }}
                  sx={{ minWidth: 220 }}
                />
                <Button variant="outlined" onClick={handleJumpToEstimateNumber}>
                  Jump
                </Button>
                <Button variant="text" onClick={() => loadEstimateBrowser()}>
                  Refresh list
                </Button>
                <Button variant="text" onClick={() => setShowEstimateBrowserList((v) => !v)}>
                  {showEstimateBrowserList ? 'Hide list' : 'Show list'}
                </Button>
              </Box>
              {showEstimateBrowserList && (
              <Box sx={{ maxHeight: 180, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                {loadingEstimateBrowser ? (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                    Loading estimates...
                  </Typography>
                ) : estimateBrowserRows.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                    No estimates found.
                  </Typography>
                ) : (
                  estimateBrowserRows.slice(0, 120).map((row) => {
                    const jobLabel = row?.jobId?.title || row?.jobId || 'No job';
                    const customerLabel = row?.customerId?.name || row?.customerId || 'Unknown customer';
                    const isActive =
                      String(row?._id || '') === String(loadedEstimateDoc?._id || '') && !isNewEstimateDraft;
                    const updated = row?.updatedAt
                      ? new Date(row.updatedAt).toLocaleString()
                      : row?.createdAt
                        ? new Date(row.createdAt).toLocaleString()
                        : '-';
                    return (
                      <Box
                        key={row._id}
                        sx={{
                          p: 1,
                          borderTop: 1,
                          borderColor: 'divider',
                          cursor: 'pointer',
                          bgcolor: isActive ? 'action.selected' : undefined,
                          '&:first-of-type': { borderTop: 'none' },
                          '&:hover': {
                            bgcolor: (t) =>
                              t.palette.mode === 'dark'
                                ? 'rgba(255,255,255,0.06)'
                                : 'rgba(0,0,0,0.04)',
                          },
                        }}
                        onClick={() => openEstimateFromBrowser(row)}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {row?.estimateNumber || 'No number'} · {row?.status || '-'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {customerLabel} · {jobLabel}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Updated: {updated}
                        </Typography>
                      </Box>
                    );
                  })
                )}
              </Box>
              )}
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

            {estimateJobId && (jobEstimates.length > 0 || isNewEstimateDraft) && (
              <Box sx={{ mt: 1.5, mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                  Estimates on this job — <strong>Create a copy</strong> duplicates the current estimate and assigns the next available number (e.g. copy 1102-0001 when 1102-0023 exists → 1102-0024).
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  {jobEstimates.map((est) => {
                    const active =
                      !isNewEstimateDraft && String(loadedEstimateDoc?._id || '') === String(est._id);
                    return (
                      <Chip
                        key={est._id}
                        label={est.estimateNumber || 'Draft'}
                        clickable
                        color={active ? 'primary' : 'default'}
                        variant={active ? 'filled' : 'outlined'}
                        onClick={() => openEstimateOnCurrentJob(est)}
                      />
                    );
                  })}
                  {isNewEstimateDraft && <Chip label="New draft" color="warning" variant="outlined" />}
                </Box>
              </Box>
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
              {sequentialEstimateNavRows.length > 0 && (
                <Box sx={{ width: '100%', maxWidth: 816, mb: 1.25, px: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                    All estimates in order — click a number or use the arrows
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 0.75,
                      overflowX: 'auto',
                      py: 0.5,
                      px: 0.25,
                      borderRadius: 2,
                      border: 1,
                      borderColor: 'divider',
                      bgcolor: (t) =>
                        t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    }}
                  >
                    {sequentialEstimateNavRows.map((row) => {
                      const active =
                        !isNewEstimateDraft &&
                        String(activeEstimateNavId || '') === String(row?._id || '');
                      return (
                        <Chip
                          key={row._id}
                          label={row.estimateNumber || 'Draft'}
                          size="small"
                          clickable
                          color={active ? 'primary' : 'default'}
                          variant={active ? 'filled' : 'outlined'}
                          onClick={() => navigateToSequentialEstimate(row)}
                          sx={{ flexShrink: 0, fontFamily: 'monospace', fontSize: '0.78rem' }}
                        />
                      );
                    })}
                    {isNewEstimateDraft && (
                      <Chip label="New draft" size="small" color="warning" variant="outlined" sx={{ flexShrink: 0 }} />
                    )}
                  </Box>
                </Box>
              )}

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
                    title="Previous estimate number"
                    disabled={docOlderDisabled}
                    onClick={goEstimateDocOlder}
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
                  display: 'flex',
                  flexDirection: 'column',
                  boxSizing: 'border-box',
                  opacity: switchingEstimate ? 0.72 : 1,
                  transition: 'opacity 0.15s ease',
                  pointerEvents: switchingEstimate ? 'none' : 'auto',
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
                <Box sx={{ flex: '0 0 auto', width: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Box
                      component="img"
                      src={resolveLogoSrc(estimateDocSettings.logoUrl)}
                      alt={`${estimateDocSettings.companyName || 'Company'} logo`}
                      sx={{ width: 68, height: 68, objectFit: 'contain' }}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = DEFAULT_ESTIMATE_DOCUMENT_SETTINGS.logoUrl;
                      }}
                    />
                    <Box>
                      <Typography sx={{ fontWeight: 700, fontSize: 24, lineHeight: 1 }}>
                        {estimateDocSettings.companyName}
                      </Typography>
                      {estimateDocSettings.addressLine1 ? (
                        <Typography sx={{ fontSize: 14, mt: 0.8 }}>{estimateDocSettings.addressLine1}</Typography>
                      ) : null}
                      {estimateDocSettings.addressLine2 ? (
                        <Typography sx={{ fontSize: 14 }}>{estimateDocSettings.addressLine2}</Typography>
                      ) : null}
                      <Box sx={{ mt: 2, ml: -9 }}>
                        {(estimateDocSettings.phoneLabel || estimateDocSettings.phone) && (
                          <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center' }}>
                            <Typography sx={{ fontSize: 13 }}>{estimateDocSettings.phoneLabel || 'Phone #'}</Typography>
                            <Typography sx={{ fontSize: 13, minWidth: 150 }}>{estimateDocSettings.phone}</Typography>
                          </Box>
                        )}
                        {estimateDocSettings.website ? (
                          <Typography sx={{ fontSize: 13, ml: 0 }}>{estimateDocSettings.website}</Typography>
                        ) : null}
                        {estimateDocSettings.email ? (
                          <Typography sx={{ fontSize: 13, minWidth: 260, ml: 0 }}>{estimateDocSettings.email}</Typography>
                        ) : null}
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
                          value={invoiceEstimateNumber}
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
                </Box>

                <Box sx={{ flex: '1 1 auto', minHeight: 32, width: '100%' }} aria-hidden />

                <Box sx={{ flex: '0 0 auto', width: '100%', mt: 'auto' }}>
                  <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {!isEstimateExportMode && (
                      <Button size="small" startIcon={<AddIcon />} onClick={addLineItem}>
                        Add line
                      </Button>
                    )}
                    <Box sx={{ width: 220, border: '1px solid #000', display: 'flex', ml: 'auto' }}>
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
              </Box>

                <Box sx={estimateRevisionRailSx}>
                  <IconButton
                    size="large"
                    aria-label="Newer estimate"
                    title="Next estimate number"
                    disabled={docNewerDisabled}
                    onClick={goEstimateDocNewer}
                    sx={{
                      color: 'text.secondary',
                      '&.Mui-disabled': { color: 'action.disabled' },
                    }}
                  >
                    <ChevronRightIcon fontSize="large" />
                  </IconButton>
                </Box>
              </Box>

              {showArrowHint && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1, textAlign: 'center', width: '100%', maxWidth: 816 }}
                >
                  Arrows browse every estimate in number order (1102-0001 ← → 1102-0002 ← → 1102-0003 …).
                </Typography>
              )}
              {isNewEstimateDraft && sequentialEstimateNavRows.length > 0 && (
                <Typography
                  variant="caption"
                  color="warning.main"
                  sx={{ mt: 1, textAlign: 'center', width: '100%', maxWidth: 816 }}
                >
                  Save this draft first to browse other estimates with the arrows.
                </Typography>
              )}
              {!isNewEstimateDraft && sequentialEstimateNavRows.length === 1 && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1, textAlign: 'center', width: '100%', maxWidth: 816 }}
                >
                  Only one estimate exists — create another to enable arrow navigation.
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
              <Button variant="outlined" startIcon={<PrintIcon />} onClick={printEstimatePdf}>
                Print estimate
              </Button>
              {estimateJobId && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleDeleteEstimate}
                  disabled={savingEstimate || loadingJobEstimate || !loadedEstimateDoc?._id}
                >
                  Delete estimate
                </Button>
              )}
              {estimateJobId && (
                <Button
                  variant="outlined"
                  startIcon={<ContentCopyIcon />}
                  onClick={() => void handleCopyEstimate()}
                  disabled={
                    savingEstimate ||
                    loadingJobEstimate ||
                    !loadedEstimateDoc?._id ||
                    isNewEstimateDraft ||
                    estimateFormIsDirty
                  }
                >
                  Create a copy
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

      <Dialog
        open={estimateHeaderDialogOpen}
        onClose={() => {
          if (!savingEstimateHeader) setEstimateHeaderDialogOpen(false);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit estimate header</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This information appears at the top of every estimate PDF and printout for your organization.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Company logo
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Box
                  component="img"
                  src={resolveLogoSrc(estimateHeaderDraft.logoUrl)}
                  alt="Logo preview"
                  sx={{
                    width: 72,
                    height: 72,
                    objectFit: 'contain',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 0.5,
                    bgcolor: '#fff',
                  }}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = DEFAULT_ESTIMATE_DOCUMENT_SETTINGS.logoUrl;
                  }}
                />
                <Button
                  variant="outlined"
                  component="label"
                  disabled={uploadingEstimateLogo || savingEstimateHeader}
                  startIcon={
                    uploadingEstimateLogo ? <CircularProgress size={18} /> : <PhotoCameraIcon />
                  }
                >
                  {uploadingEstimateLogo ? 'Uploading…' : 'Upload logo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                    hidden
                    onChange={handleEstimateLogoUpload}
                  />
                </Button>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Upload a PNG, JPG, or SVG. This logo appears on every estimate PDF and printout.
              </Typography>
              <TextField
                label="Or image URL / public path (optional)"
                value={
                  String(estimateHeaderDraft.logoUrl || '').includes('/estimate-logo')
                    ? ''
                    : estimateHeaderDraft.logoUrl
                }
                onChange={(e) => handleEstimateHeaderDraftChange('logoUrl', e.target.value)}
                placeholder="/scww.png"
                helperText="Leave blank when using an uploaded logo. Use /public paths or https:// URLs."
                fullWidth
                sx={{ mt: 1.5 }}
              />
            </Box>
            <TextField
              label="Company name"
              value={estimateHeaderDraft.companyName}
              onChange={(e) => handleEstimateHeaderDraftChange('companyName', e.target.value)}
              fullWidth
            />
            <TextField
              label="Address line 1"
              value={estimateHeaderDraft.addressLine1}
              onChange={(e) => handleEstimateHeaderDraftChange('addressLine1', e.target.value)}
              fullWidth
            />
            <TextField
              label="Address line 2"
              value={estimateHeaderDraft.addressLine2}
              onChange={(e) => handleEstimateHeaderDraftChange('addressLine2', e.target.value)}
              fullWidth
            />
            <TextField
              label="Phone label"
              value={estimateHeaderDraft.phoneLabel}
              onChange={(e) => handleEstimateHeaderDraftChange('phoneLabel', e.target.value)}
              fullWidth
            />
            <TextField
              label="Phone number"
              value={estimateHeaderDraft.phone}
              onChange={(e) => handleEstimateHeaderDraftChange('phone', e.target.value)}
              fullWidth
            />
            <TextField
              label="Website"
              value={estimateHeaderDraft.website}
              onChange={(e) => handleEstimateHeaderDraftChange('website', e.target.value)}
              fullWidth
            />
            <TextField
              label="Email"
              value={estimateHeaderDraft.email}
              onChange={(e) => handleEstimateHeaderDraftChange('email', e.target.value)}
              fullWidth
            />
            <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: '#fff', color: '#000' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Preview
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Box
                  component="img"
                  src={resolveLogoSrc(estimateHeaderDraft.logoUrl)}
                  alt="Header preview logo"
                  sx={{ width: 48, height: 48, objectFit: 'contain' }}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = DEFAULT_ESTIMATE_DOCUMENT_SETTINGS.logoUrl;
                  }}
                />
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#000' }}>
                    {estimateHeaderDraft.companyName || 'Company name'}
                  </Typography>
                  {estimateHeaderDraft.addressLine1 ? (
                    <Typography sx={{ fontSize: 12, color: '#000' }}>{estimateHeaderDraft.addressLine1}</Typography>
                  ) : null}
                  {estimateHeaderDraft.addressLine2 ? (
                    <Typography sx={{ fontSize: 12, color: '#000' }}>{estimateHeaderDraft.addressLine2}</Typography>
                  ) : null}
                  {estimateHeaderDraft.phone ? (
                    <Typography sx={{ fontSize: 12, color: '#000', mt: 0.5 }}>
                      {(estimateHeaderDraft.phoneLabel || 'Phone #') + ' ' + estimateHeaderDraft.phone}
                    </Typography>
                  ) : null}
                  {estimateHeaderDraft.website ? (
                    <Typography sx={{ fontSize: 12, color: '#000' }}>{estimateHeaderDraft.website}</Typography>
                  ) : null}
                  {estimateHeaderDraft.email ? (
                    <Typography sx={{ fontSize: 12, color: '#000' }}>{estimateHeaderDraft.email}</Typography>
                  ) : null}
                </Box>
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEstimateHeaderDialogOpen(false)} disabled={savingEstimateHeader}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSaveEstimateHeader} disabled={savingEstimateHeader}>
            {savingEstimateHeader ? 'Saving…' : 'Save header'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default FinanceHubPage;
