/**
 * JobDetailModal — Full job editor: notes, files, tasks, AI summary.
 * Docs: ../../../docs/COMPONENTS.md
 */
import { useState, useEffect, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Typography,
  Box,
  GridLegacy as Grid,
  Chip,
  Divider,
  Tabs,
  Tab,
  Paper,
  Button,
  CircularProgress,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Link as MuiLink,
  Tooltip,
} from '@mui/material';
import {
  Close as CloseIcon,
  Person as PersonIcon,
  AttachMoney as MoneyIcon,
  CalendarToday as CalendarIcon,
  LocationOn as LocationIcon,
  Description as DescriptionIcon,
  Assignment as AssignmentIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Delete as DeleteIcon,
  Archive as ArchiveIcon,
  SwapHoriz as SwapHorizIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  CloudUpload as CloudUploadIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Image as ImageIcon,
  InsertDriveFile as InsertDriveFileIcon,
  Share as ShareIcon,
  PostAdd as PostAddIcon,
  AutoAwesome as AutoAwesomeIcon,
  ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import axios from 'axios';
import PdfThumbnail from '../common/PdfThumbnail';
import toast from 'react-hot-toast';
import AddNoteModal from './AddNoteModal';
import AddJobTaskModal from './AddJobTaskModal';
import AddAppointmentModal from '../appointments/AddAppointmentModal';
import JobChangeOrderDialog from './JobChangeOrderDialog';
import JobPaymentScheduleEditor from './JobPaymentScheduleEditor';
import EmployeeSmsRecipientField, {
  parseSmsRecipientSelection,
} from '../common/EmployeeSmsRecipientField';
import { formatPhoneForDisplay, telHref } from '../../utils/phoneFormat';
import {
  getJobFilesCache,
  invalidateJobFilesCache,
  setJobFilesCache,
} from '../../utils/fileListCache';
import { renderSummaryBlocks } from '../../utils/summaryMarkdown';
import {
  formatScheduleItemLabel,
  resolvePaymentSchedule,
  validatePaymentSchedule,
} from '../../utils/paymentSchedule';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function estimateNumberSortValue(estimateNumber) {
  const raw = String(estimateNumber || '').trim();
  const m = raw.match(/^(\d+)-(\d+)$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const prefix = Number(m[1]) || 0;
  const seq = Number(m[2]) || 0;
  return prefix * 100000 + seq;
}

function sortJobEstimatesByNumber(list) {
  return [...(list || [])].sort(
    (a, b) => estimateNumberSortValue(a?.estimateNumber) - estimateNumberSortValue(b?.estimateNumber)
  );
}

const openPdfViewer = (fileId) => {
  window.open(`/pdf/${fileId}`, '_blank');
};

const openPictureViewer = (fileId) => {
  window.open(`/picture/${fileId}`, '_blank');
};

const STAGE_LABELS = {
  APPOINTMENT_SCHEDULED: 'Appointment Scheduled',
  ESTIMATE_IN_PROGRESS: 'Estimate Current, first 5 days',
  ESTIMATE_SENT: 'Estimate Sent',
  ENGAGED_DESIGN_REVIEW: 'Design Review',
  CONTRACT_OUT: 'Contract Out',
  CONTRACT_SIGNED: 'Contract Signed',
  DEPOSIT_PENDING: 'Signed / Deposit Pending',
  JOB_PREP: 'Job Prep',
  TAKEOFF_COMPLETE: 'Fabrication',
  READY_TO_SCHEDULE: 'Ready to Schedule',
  SCHEDULED: 'Scheduled',
  IN_PRODUCTION: 'In Production',
  INSTALLED: 'Installed',
  FINAL_PAYMENT_CLOSED: 'Final Payment Closed',
};

// All stages in order
const ALL_STAGES = [
  'APPOINTMENT_SCHEDULED',
  'ESTIMATE_IN_PROGRESS',
  'ESTIMATE_SENT',
  'ENGAGED_DESIGN_REVIEW',
  'CONTRACT_OUT',
  'DEPOSIT_PENDING',
  'JOB_PREP',
  'TAKEOFF_COMPLETE',
  'READY_TO_SCHEDULE',
  'SCHEDULED',
  'IN_PRODUCTION',
  'INSTALLED',
  'FINAL_PAYMENT_CLOSED'
];

// Get next stage
const getNextStage = (currentStage) => {
  const currentIndex = ALL_STAGES.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex === ALL_STAGES.length - 1) {
    return null; // Already at last stage or invalid stage
  }
  return ALL_STAGES[currentIndex + 1];
};

const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const URL_PART_REGEX = /^https?:\/\/[^\s]+$/;

function renderTextWithLinks(text) {
  const raw = String(text || '');
  if (!raw) return '';
  const parts = raw.split(URL_REGEX);
  return parts.map((part, index) => {
    if (URL_PART_REGEX.test(part)) {
      return (
        <MuiLink
          key={`link-${index}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          underline="always"
          sx={{ wordBreak: 'break-all' }}
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </MuiLink>
      );
    }
    return <Box key={`txt-${index}`} component="span">{part}</Box>;
  });
}

export const JOB_MODAL_TAB = {
  overview: 0,
  payments: 1,
  files: 2,
  notes: 3,
};

function resolveJobModalTab(tab) {
  if (typeof tab === 'number' && tab >= 0 && tab <= 3) return tab;
  if (typeof tab === 'string' && tab in JOB_MODAL_TAB) return JOB_MODAL_TAB[tab];
  return JOB_MODAL_TAB.overview;
}

function JobDetailModal({
  jobId,
  open,
  onClose,
  onJobUpdate,
  onJobDelete,
  onJobArchive,
  onAppointmentCreated = () => {},
  initialTab = 'overview',
  sx = {},
  hideSensitive = false,
  onRequestSensitiveUnlock = () => {},
}) {
  const [activeTab, setActiveTab] = useState(() => resolveJobModalTab(initialTab));
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedJob, setEditedJob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [fileType, setFileType] = useState('other');
  const [dragActive, setDragActive] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addAppointmentOpen, setAddAppointmentOpen] = useState(false);
  const [jobTasks, setJobTasks] = useState([]);
  const [jobEstimates, setJobEstimates] = useState([]);
  const [changeOrderOpen, setChangeOrderOpen] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const hideFinancials = hideSensitive;
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareSmsRecipient, setShareSmsRecipient] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [sendingShare, setSendingShare] = useState(false);
  const [aiSummaryOpen, setAiSummaryOpen] = useState(false);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryText, setAiSummaryText] = useState('');
  const [aiSummaryPrompt, setAiSummaryPrompt] = useState('');
  const [aiSummaryMeta, setAiSummaryMeta] = useState(null);

  const fetchJobFiles = useCallback(async ({ force = false } = {}) => {
    const jobKey = String(jobId || '');
    if (!jobKey) return;

    const cached = getJobFilesCache(jobKey);
    if (cached && !force) {
      setFiles(cached);
    }

    try {
      const response = await axios.get(`${API_URL}/files/job/${jobKey}`);
      const list = Array.isArray(response.data) ? response.data : [];
      setJobFilesCache(jobKey, list);
      setFiles(list);
    } catch (error) {
      console.error('Error fetching files:', error);
      if (!cached) setFiles([]);
    }
  }, [jobId]);

  const fetchJobDetails = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/jobs/${jobId}`);
      setJob(response.data);
      setEditedJob(response.data);
      setIsEditing(false);
      try {
        const tasksResponse = await axios.get(`${API_URL}/tasks/job/${jobId}`);
        setJobTasks(Array.isArray(tasksResponse.data) ? tasksResponse.data : []);
      } catch (taskError) {
        console.error('Error fetching job tasks:', taskError);
        setJobTasks([]);
      }
      try {
        const estimatesResponse = await axios.get(`${API_URL}/estimates`, { params: { jobId } });
        const list = Array.isArray(estimatesResponse.data)
          ? estimatesResponse.data
          : estimatesResponse.data?.estimates || [];
        setJobEstimates(sortJobEstimatesByNumber(list));
      } catch (estimateError) {
        console.error('Error fetching job estimates:', estimateError);
        setJobEstimates([]);
      }
    } catch (error) {
      console.error('Error fetching job details:', error);
      toast.error('Failed to load job details');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [jobId, onClose]);

  useEffect(() => {
    if (open && jobId) {
      setActiveTab(resolveJobModalTab(initialTab));
      fetchJobDetails();
      fetchJobFiles();
    } else {
      setIsEditing(false);
      setEditedJob(null);
    }
  }, [open, jobId, initialTab, fetchJobDetails, fetchJobFiles]);

  const validateUploadFile = (file) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return 'Only images and PDFs are allowed';
    }
    if (file.size > 10 * 1024 * 1024) {
      return 'File must be less than 10MB';
    }
    return null;
  };

  const uploadOneFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('jobId', jobId);
    formData.append('fileType', fileType);
    await axios.post(`${API_URL}/files/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  };

  const handleUploadFiles = async (fileList, resetInput = null) => {
    const files = [...(fileList || [])].filter(Boolean);
    if (!files.length) return;

    const valid = [];
    const skipped = [];
    for (const file of files) {
      const reason = validateUploadFile(file);
      if (reason) skipped.push({ name: file.name, reason });
      else valid.push(file);
    }

    if (skipped.length) {
      const first = skipped[0];
      const more = skipped.length > 1 ? ` (+${skipped.length - 1} more skipped)` : '';
      toast.error(`${first.name}: ${first.reason}${more}`);
    }
    if (!valid.length) return;

    setUploading(true);
    let succeeded = 0;
    let failed = 0;
    try {
      for (let i = 0; i < valid.length; i += 1) {
        const file = valid[i];
        try {
          await uploadOneFile(file);
          succeeded += 1;
        } catch (error) {
          failed += 1;
          console.error('Error uploading file:', file.name, error);
        }
      }
      await fetchJobFiles({ force: true });
      setFileType('other');
      if (resetInput) resetInput.value = '';
      if (succeeded && !failed) {
        toast.success(succeeded === 1 ? 'File uploaded successfully' : `Uploaded ${succeeded} files`);
      } else if (succeeded && failed) {
        toast.error(`Uploaded ${succeeded} of ${valid.length} files`);
      } else {
        toast.error('Failed to upload files');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files?.length) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files?.length) {
      handleUploadFiles(e.target.files, e.target);
    }
  };

  const headerBaseEstimatedValue = Number((isEditing ? editedJob?.valueEstimated : job?.valueEstimated) || 0);
  const headerContractedValue = Number((isEditing ? editedJob?.valueContracted : job?.valueContracted) || 0);
  const headerContractBase = headerContractedValue > 0 ? headerContractedValue : headerBaseEstimatedValue;
  const headerChangeOrderValue = jobTasks.reduce((sum, task) => sum + (Number(task.amount) || 0), 0);
  const headerScheduleSource = isEditing ? editedJob || job : job;
  const headerPaymentSchedule = resolvePaymentSchedule({
    ...headerScheduleSource,
    valueEstimated: headerBaseEstimatedValue,
    valueContracted: headerContractedValue,
  });
  const jobCardId = job?._id ? String(job._id).slice(-6).toUpperCase() : 'N/A';

  const handleFileDelete = async (fileId) => {
    if (!window.confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/files/${fileId}`);
      toast.success('File deleted successfully');
      await fetchJobFiles({ force: true });
    } catch (error) {
      console.error('Error deleting file:', error);
      toast.error('Failed to delete file');
    }
  };

  const openFileByType = (file) => {
    if (!file?._id) return;
    if (file.mimetype?.startsWith('image/')) {
      openPictureViewer(file._id);
      return;
    }
    if (file.mimetype === 'application/pdf') {
      openPdfViewer(file._id);
      return;
    }
    window.open(`${API_URL}/files/${file._id}/download`, '_blank', 'noopener,noreferrer');
  };

  const handleFileCardClick = (file) => {
    if (!file) return;
    openFileByType(file);
  };

  const getFileIcon = (mimetype) => {
    if (mimetype.startsWith('image/')) {
      return <ImageIcon />;
    } else if (mimetype === 'application/pdf') {
      return <PictureAsPdfIcon />;
    }
    return <InsertDriveFileIcon />;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedJob({ ...job });
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedJob({ ...job });
  };

  const handleSavePaymentSchedule = async (paymentSchedule) => {
    try {
      setScheduleSaving(true);
      await onJobUpdate(jobId, { paymentSchedule });
      await fetchJobDetails();
      if (paymentSchedule) {
        toast.success('Payment schedule saved');
      }
    } catch (error) {
      console.error('Error saving payment schedule:', error);
      toast.error('Failed to save payment schedule');
      throw error;
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const jobAddress = {
        street: String(editedJob?.jobAddress?.street || '').trim(),
        city: String(editedJob?.jobAddress?.city || '').trim(),
        state: String(editedJob?.jobAddress?.state || '').trim(),
        zip: String(editedJob?.jobAddress?.zip || '').trim(),
      };
      const updates = {
        title: editedJob.title,
        description: editedJob.description || '',
        valueEstimated: editedJob.valueEstimated,
        valueContracted: editedJob.valueContracted,
        source: editedJob.source,
        jobAddress,
      };

      await onJobUpdate(jobId, updates);
      setIsEditing(false);
      await fetchJobDetails(); // Refresh job data
      toast.success('Job updated successfully');
    } catch (error) {
      console.error('Error saving job:', error);
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (field, value) => {
    setEditedJob((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleJobAddressFieldChange = (field, value) => {
    setEditedJob((prev) => ({
      ...prev,
      jobAddress: {
        ...(prev?.jobAddress || {}),
        [field]: value,
      },
    }));
  };

  const handleDeleteClick = () => {
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/jobs/${jobId}`);
      invalidateJobFilesCache(jobId);
      toast.success('Job deleted successfully');
      setDeleteConfirmOpen(false);
      if (onJobDelete) {
        onJobDelete(jobId);
      }
      onClose();
    } catch (error) {
      console.error('Error deleting job:', error);
      toast.error('Failed to delete job');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
  };

  const handleArchive = async () => {
    try {
      setSaving(true);
      await axios.post(`${API_URL}/jobs/${jobId}/archive`);
      toast.success('Job archived successfully');
      if (onJobArchive) {
        onJobArchive(jobId);
      }
      onClose();
    } catch (error) {
      console.error('Error archiving job:', error);
      toast.error('Failed to archive job');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value) => {
    if (!value) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date) => {
    if (!date) return 'Not set';
    return format(new Date(date), 'MMM dd, yyyy');
  };

  const formatDateTime = (date) => {
    if (!date) return 'Not set';
    return format(new Date(date), 'MMM dd, yyyy h:mm a');
  };

  const getNoteAuthor = (note) =>
    note?.createdBy?.name || note?.createdByName || job?.createdBy?.name || 'Unknown';

  /** Job site / customer address + contact for header strip */
  const getCustomerContact = (j) => {
    if (!j) return { name: '', addressLine: '', email: '', phone: '' };
    const cust = j.customerId && typeof j.customerId === 'object' ? j.customerId : null;
    const ja = j.jobAddress;
    let addressLine = '';
    if (ja && (ja.street || ja.city || ja.state || ja.zip)) {
      addressLine = [ja.street, ja.city, ja.state, ja.zip].filter(Boolean).join(', ');
    } else if (cust?.address && (cust.address.street || cust.address.city || cust.address.state || cust.address.zip)) {
      addressLine = [cust.address.street, cust.address.city, cust.address.state, cust.address.zip]
        .filter(Boolean)
        .join(', ');
    }
    const email = j.jobContact?.email || cust?.primaryEmail || '';
    const phone = j.jobContact?.phone || cust?.primaryPhone || '';
    const name = cust?.name || '';
    return { name, addressLine, email, phone };
  };

  const renderCustomerHeaderStrip = (j) => {
    const { name, addressLine, email, phone } = getCustomerContact(j);
    if (!name && !addressLine && !email && !phone) return null;
    const smallText = { fontSize: '0.7rem', lineHeight: 1.4 };
    const iconSm = { fontSize: 14, flexShrink: 0 };
    return (
      <Box
        sx={{
          mt: 1.25,
          py: 0.75,
          px: 1,
          borderRadius: 0.75,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'action.hover',
          display: 'inline-flex',
          flexDirection: 'column',
          alignSelf: 'flex-start',
          gap: 0.4,
          maxWidth: '100%',
          width: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {name && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
              <PersonIcon sx={{ ...iconSm, color: 'primary.main', mt: '1px' }} />
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, fontSize: '0.78rem', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {name}
              </Typography>
            </Box>
            <Tooltip title="Share customer info by text">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => {
                e.stopPropagation();
                const messageLines = [
                  `Customer: ${name || 'Unknown'}`,
                  j?.title ? `Job: ${j.title}` : null,
                  addressLine ? `Address: ${addressLine}` : null,
                  email ? `Email: ${email}` : null,
                  phone ? `Phone: ${formatPhoneForDisplay(phone)}` : null,
                ].filter(Boolean);
                setShareSmsRecipient('');
                setShareMessage(messageLines.join('\n'));
                setShareDialogOpen(true);
              }}>
                <ShareIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}
        {addressLine && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
            <LocationIcon sx={{ ...iconSm, color: 'text.secondary', mt: '2px' }} />
            <Typography variant="caption" color="text.secondary" sx={smallText}>
              {addressLine}
            </Typography>
          </Box>
        )}
        {(email || phone) && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
            {email && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <EmailIcon sx={{ ...iconSm, color: 'text.secondary' }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="a"
                  href={`mailto:${email}`}
                  sx={{ ...smallText, wordBreak: 'break-all', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                >
                  {email}
                </Typography>
              </Box>
            )}
            {phone && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PhoneIcon sx={{ ...iconSm, color: 'text.secondary' }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="a"
                  href={telHref(phone) || `tel:${phone.replace(/\s/g, '')}`}
                  sx={{ ...smallText, wordBreak: 'break-all', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                >
                  {formatPhoneForDisplay(phone)}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>
    );
  };

  if (!open || !job) return null;
  const customerEntityId =
    job?.customerId && typeof job.customerId === 'object'
      ? job.customerId?._id
      : job?.customerId || null;

  const handleCloseShareDialog = () => {
    setShareDialogOpen(false);
    setShareSmsRecipient('');
    setShareMessage('');
    setSendingShare(false);
  };

  const handleSendShareSms = async () => {
    if (!shareSmsRecipient) {
      toast.error('Select an employee to send to');
      return;
    }
    if (!shareMessage.trim()) {
      toast.error('Message cannot be empty');
      return;
    }
    try {
      setSendingShare(true);
      await axios.post(`${API_URL}/twilio/send-sms`, {
        ...parseSmsRecipientSelection(shareSmsRecipient),
        message: shareMessage.trim(),
        customerId: customerEntityId || undefined,
      });
      toast.success('Customer info sent by text');
      handleCloseShareDialog();
    } catch (error) {
      console.error('Error sending customer info text:', error);
      toast.error(error.response?.data?.error || 'Failed to send text');
    } finally {
      setSendingShare(false);
    }
  };

  const handleGenerateAiSummary = async () => {
    if (!jobId) return;
    setAiSummaryLoading(true);
    setAiSummaryText('');
    setAiSummaryMeta(null);
    try {
      const trimmed = aiSummaryPrompt.trim();
      const payload = { jobId };
      if (trimmed) payload.prompt = trimmed;

      const summaryUrls = [
        `${API_URL}/activities/summary`,
        `${API_URL}/activities/job/${jobId}/summary`,
        `${API_URL}/jobs/${jobId}/summary`,
      ];

      let res;
      let lastError;
      for (const url of summaryUrls) {
        try {
          res = await axios.post(url, payload);
          break;
        } catch (error) {
          lastError = error;
          if (error.response?.status !== 404) {
            throw error;
          }
        }
      }
      if (!res) {
        throw lastError;
      }

      setAiSummaryText(res.data.summary || '');
      setAiSummaryMeta({
        activityCount: res.data.activityCount,
        totalActivities: res.data.totalActivities,
        noteCount: res.data.noteCount,
        taskCount: res.data.taskCount,
        appointmentCount: res.data.appointmentCount,
        truncated: res.data.truncated,
        generatedAt: res.data.generatedAt,
      });
    } catch (error) {
      console.error('Job AI summary error:', error);
      const status = error.response?.status;
      if (status === 404) {
        toast.error(
          'Job summary API is not available yet. Redeploy the backend on Render with the latest code.'
        );
      } else if (status === 400 && !error.response?.data?.error) {
        toast.error('Job summary requires a backend update. Redeploy the backend, then try again.');
      } else {
        toast.error(error.response?.data?.error || 'Failed to generate summary');
      }
      setAiSummaryOpen(false);
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const handleOpenAiSummary = () => {
    setAiSummaryOpen(true);
    handleGenerateAiSummary();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      sx={sx}
      PaperProps={{
        sx: {
          borderRadius: '16px',
          maxHeight: '90vh',
        },
      }}
    >
      <DialogTitle sx={{ pb: 1, pt: 2 }}>
        {job._id != null && String(job._id).trim() !== '' && (
          <Box sx={{ textAlign: 'center', width: '100%', mb: 1.25 }}>
            <Tooltip title={`Full job id: ${job._id}`} placement="bottom">
              <Typography
                variant="caption"
                component="span"
                sx={{
                  color: 'text.disabled',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: '0.7rem',
                  letterSpacing: '0.04em',
                  userSelect: 'all',
                  cursor: 'default',
                }}
              >
                ID{' '}
                {String(job._id).length >= 8 ? String(job._id).slice(-8) : String(job._id)}
              </Typography>
            </Tooltip>
          </Box>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            {isEditing ? (
              <>
                <TextField
                  fullWidth
                  value={editedJob?.title || ''}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  variant="outlined"
                  size="small"
                  label="Job Name"
                  sx={{ mb: 1 }}
                />
                <TextField
                  fullWidth
                  value={editedJob?.description || ''}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  variant="outlined"
                  size="small"
                  label="Description"
                  multiline
                  rows={2}
                  placeholder="Add a short description to help identify this job..."
                />
                <Box sx={{ mt: 1.25 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                    Job site address (can be different from customer card)
                  </Typography>
                  <Grid container spacing={1}>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Street"
                        value={editedJob?.jobAddress?.street || ''}
                        onChange={(e) => handleJobAddressFieldChange('street', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={5}>
                      <TextField
                        fullWidth
                        size="small"
                        label="City"
                        value={editedJob?.jobAddress?.city || ''}
                        onChange={(e) => handleJobAddressFieldChange('city', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField
                        fullWidth
                        size="small"
                        label="State"
                        value={editedJob?.jobAddress?.state || ''}
                        onChange={(e) => handleJobAddressFieldChange('state', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={6} sm={4}>
                      <TextField
                        fullWidth
                        size="small"
                        label="ZIP"
                        value={editedJob?.jobAddress?.zip || ''}
                        onChange={(e) => handleJobAddressFieldChange('zip', e.target.value)}
                      />
                    </Grid>
                  </Grid>
                </Box>
                {renderCustomerHeaderStrip(job)}
              </>
            ) : (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 600, display: 'block' }}>
                  {job.title}
                </Typography>
                {renderCustomerHeaderStrip(job)}
                {job.description && (
                  <Typography
                    variant="body2"
                    sx={{
                      mt: 1.5,
                      color: 'text.secondary',
                      fontStyle: 'italic',
                      fontWeight: 400,
                      display: 'block',
                      lineHeight: 1.5,
                    }}
                  >
                    {job.description}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            {/* Estimated Value in Header */}
            <Box sx={{ textAlign: 'right' }}>
              {hideFinancials ? (
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Locked
                  </Typography>
                  {onRequestSensitiveUnlock && (
                    <Button size="small" onClick={() => onRequestSensitiveUnlock?.()}>
                      Unlock
                    </Button>
                  )}
                </Box>
              ) : isEditing ? (
                <>
                  <Typography variant="h6" sx={{ color: 'success.main', fontWeight: 600 }}>
                    {formatCurrency(headerContractBase)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Contract / Estimate
                  </Typography>
                  <TextField
                    type="number"
                    value={editedJob?.valueEstimated || 0}
                    onChange={(e) => handleFieldChange('valueEstimated', parseFloat(e.target.value) || 0)}
                    variant="outlined"
                    size="small"
                    sx={{ width: '150px', mt: 1 }}
                    InputProps={{
                      startAdornment: <Typography sx={{ mr: 1 }}>$</Typography>,
                    }}
                  />
                </>
              ) : (
                <Typography variant="h6" sx={{ color: 'success.main', fontWeight: 600 }}>
                  {formatCurrency(headerContractBase)}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {isEditing ? 'Base Estimate' : 'Contract / Estimate'}
              </Typography>
              {!hideFinancials && (
                <>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.25 }}>
                    Base Estimate: {formatCurrency(headerBaseEstimatedValue)}
                  </Typography>
                  {headerContractedValue > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.25 }}>
                      Contracted: {formatCurrency(headerContractedValue)}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.25 }}>
                    Change Orders: {formatCurrency(headerChangeOrderValue)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, fontWeight: 600 }}>
                    Payment schedule
                  </Typography>
                  {headerPaymentSchedule.items.map((item, idx) => (
                    <Typography
                      key={`${item.label}-${idx}`}
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', lineHeight: 1.25 }}
                    >
                      {formatScheduleItemLabel(item)}
                      {item.status === 'paid' ? ' · Paid' : ''}
                    </Typography>
                  ))}
                  <Button
                    size="small"
                    variant="text"
                    sx={{ mt: 0.5, p: 0, minWidth: 0, textTransform: 'none' }}
                    onClick={() => setActiveTab(JOB_MODAL_TAB.payments)}
                  >
                    Edit payments
                  </Button>
                </>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {!isEditing ? (
                <>
                  <IconButton onClick={handleEdit} size="small" color="primary" title="Edit">
                    <EditIcon />
                  </IconButton>
                  {!job?.isArchived && !job?.isDeadEstimate && (
                    <IconButton onClick={handleArchive} size="small" color="warning" title="Archive" disabled={saving}>
                      <ArchiveIcon />
                    </IconButton>
                  )}
                  {customerEntityId && (
                    <IconButton
                      component={RouterLink}
                      to={`/customers?customerId=${customerEntityId}`}
                      onClick={onClose}
                      size="small"
                      color="info"
                      title="Open customer card"
                    >
                      <PersonIcon />
                    </IconButton>
                  )}
                  <IconButton onClick={handleDeleteClick} size="small" color="error" title="Delete">
                    <DeleteIcon />
                  </IconButton>
                </>
              ) : (
                <>
                  <IconButton onClick={handleSave} size="small" color="primary" disabled={saving} title="Save">
                    <SaveIcon />
                  </IconButton>
                  <IconButton onClick={handleCancel} size="small" disabled={saving} title="Cancel">
                    <CancelIcon />
                  </IconButton>
                </>
              )}
              <IconButton onClick={onClose} size="small" title="Close">
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>
        </Box>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
          <Tab label="Overview" />
          <Tab label="Payments" />
          <Tab label="Files" />
          <Tab label="Notes" />
        </Tabs>

        {activeTab === 0 && (
          <Grid container spacing={3}>
            {/* Recent Activity - First thing users see */}
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <DescriptionIcon sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Recent Activity
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AutoAwesomeIcon />}
                    onClick={handleOpenAiSummary}
                    disabled={!jobId || aiSummaryLoading}
                  >
                    AI summary
                  </Button>
                </Box>
                
                {job.notes && job.notes.length > 0 ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: '400px', overflowY: 'auto' }}>
                    {[...job.notes]
                      .sort((a, b) => {
                        const dateA = new Date(a.createdAt || 0).getTime();
                        const dateB = new Date(b.createdAt || 0).getTime();
                        return dateB - dateA; // Descending order (newest first)
                      })
                      .slice(0, 10) // Show only last 10 activities
                      .map((note, index) => (
                        <Box 
                          key={index} 
                          sx={{ 
                            p: 1.5, 
                            borderRadius: 1, 
                            bgcolor: 'action.hover',
                            borderLeft: '3px solid',
                            borderColor: note.important
                              ? 'error.main'
                              : note.isStageChange
                                ? 'primary.main'
                                : note.isAppointment
                                  ? 'warning.main'
                                  : 'divider'
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              <Box component="span" sx={{ fontWeight: 700 }}>
                                [{getNoteAuthor(note)}]
                              </Box>
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatDateTime(note.createdAt)}
                            </Typography>
                          </Box>
                          <Typography 
                            variant="body2"
                            sx={{
                              color: note.important
                                ? 'error.main'
                                : note.isStageChange
                                  ? 'primary.main'
                                  : note.isAppointment
                                    ? 'warning.main'
                                    : 'text.primary',
                              fontStyle: (note.isStageChange || note.isAppointment) && !note.important ? 'italic' : 'normal',
                              fontWeight: note.important ? 600 : note.isStageChange ? 500 : 'normal'
                            }}
                          >
                            {renderTextWithLinks(note.content)}
                          </Typography>
                        </Box>
                      ))}
                    {job.notes.length > 10 && (
                      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: 1 }}>
                        Showing 10 most recent. View all in Notes tab.
                      </Typography>
                    )}
                  </Box>
                ) : (
                  <Box sx={{ textAlign: 'center', py: 3 }}>
                    <DescriptionIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      No activity yet. View Notes tab to add notes or tasks.
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Grid>

            {/* Current Stage - At the top */}
            <Grid item xs={12} sm={6}>
              <Paper sx={{ p: 2, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <AssignmentIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="subtitle2" color="text.secondary">
                    Current Stage
                  </Typography>
                </Box>
                <Chip
                  label={STAGE_LABELS[job.stage] || job.stage}
                  color="primary"
                  sx={{ mt: 1 }}
                />
              </Paper>
            </Grid>

            {/* Customer Information - At the bottom */}
            <Grid item xs={12} sm={6}>
              <Paper sx={{ p: 2, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="subtitle2" color="text.secondary">
                    Customer Information
                  </Typography>
                </Box>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {job.customerId?.name || 'Unknown Customer'}
                  </Typography>
                  {job.customerId?._id && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      Customer #: {job.customerId._id.toString().slice(-6).toUpperCase()}
                    </Typography>
                  )}
                  {/* Show job-specific contact if available, otherwise show customer contact */}
                  {(job.jobContact?.phone || job.customerId?.primaryPhone) && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      Phone:{' '}
                      {formatPhoneForDisplay(
                        String(job.jobContact?.phone || job.customerId?.primaryPhone || '').trim()
                      )}
                    </Typography>
                  )}
                  {(job.jobContact?.email || job.customerId?.primaryEmail) && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      Email: {job.jobContact?.email || job.customerId.primaryEmail}
                    </Typography>
                  )}
                  {/* Show job-specific address if available, otherwise show customer address */}
                  {(job.jobAddress?.street || job.jobAddress?.city || 
                    (!job.jobAddress && (job.customerId?.address?.street || job.customerId?.address?.city))) && (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', mt: 1 }}>
                      <LocationIcon sx={{ fontSize: 16, color: 'text.secondary', mr: 0.5, mt: 0.25 }} />
                      <Typography variant="caption" color="text.secondary">
                        {job.jobAddress ? (
                          // Job-specific address
                          [
                            job.jobAddress.street,
                            job.jobAddress.city,
                            job.jobAddress.state,
                            job.jobAddress.zip
                          ].filter(Boolean).join(', ')
                        ) : (
                          // Customer address
                          [
                            job.customerId.address?.street,
                            job.customerId.address?.city,
                            job.customerId.address?.state,
                            job.customerId.address?.zip
                          ].filter(Boolean).join(', ')
                        )}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Paper>
            </Grid>

            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <MoneyIcon sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Tasks
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      Job Card #: {jobCardId}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {jobTasks.length} total
                    </Typography>
                  </Box>
                </Box>

                {jobTasks.length > 0 ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 320, overflowY: 'auto' }}>
                    {jobTasks
                      .slice()
                      .sort(
                        (a, b) =>
                          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
                      )
                      .map((task) => (
                        <Box
                          key={task._id}
                          sx={{
                            p: 1.5,
                            borderRadius: 1,
                            bgcolor: 'action.hover',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 2,
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {task.title}
                            </Typography>
                            {task.description && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                {task.description}
                              </Typography>
                            )}
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                              {formatDateTime(task.createdAt)}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No tasks yet. Use Add Task to add as many as needed.
                  </Typography>
                )}
              </Paper>
            </Grid>

            {isEditing && (
              <Grid item xs={12} sm={6}>
                <Paper sx={{ p: 2, height: '100%' }}>
                  <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                    <InputLabel>Source</InputLabel>
                    <Select
                      value={editedJob?.source || 'other'}
                      onChange={(e) => handleFieldChange('source', e.target.value)}
                      label="Source"
                    >
                      <MenuItem value="referral">Referral</MenuItem>
                      <MenuItem value="yelp">Yelp</MenuItem>
                      <MenuItem value="instagram">Instagram</MenuItem>
                      <MenuItem value="facebook">Facebook</MenuItem>
                      <MenuItem value="website">Website</MenuItem>
                      <MenuItem value="repeat">Repeat Customer</MenuItem>
                      <MenuItem value="other">Other</MenuItem>
                    </Select>
                  </FormControl>
                </Paper>
              </Grid>
            )}

            {job.appointment?.dateTime && (
              <Grid item xs={12}>
                <Paper sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <CalendarIcon sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="subtitle2" color="text.secondary">
                      Appointment
                    </Typography>
                  </Box>
                  <Typography variant="body1" sx={{ mt: 1 }}>
                    {formatDateTime(job.appointment.dateTime)}
                  </Typography>
                  {job.appointment.location && (
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                      <LocationIcon sx={{ mr: 0.5, fontSize: '1rem', color: 'text.secondary' }} />
                      <Typography variant="body2" color="text.secondary">
                        {job.appointment.location}
                      </Typography>
                    </Box>
                  )}
                  {job.appointment.notes && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {job.appointment.notes}
                    </Typography>
                  )}
                </Paper>
              </Grid>
            )}

            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Additional Information
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={4}>
                    <Typography variant="caption" color="text.secondary">
                      Source
                    </Typography>
                    <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                      {job.source || 'Other'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <Typography variant="caption" color="text.secondary">
                      Created
                    </Typography>
                    <Typography variant="body2">
                      {formatDate(job.createdAt)}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <Typography variant="caption" color="text.secondary">
                      Last Updated
                    </Typography>
                    <Typography variant="body2">
                      {formatDate(job.updatedAt)}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
          </Grid>
        )}

        {activeTab === JOB_MODAL_TAB.payments && (
          <Box>
            {hideFinancials ? (
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body1" sx={{ mb: 1 }}>
                  Financial details are locked in Shop View.
                </Typography>
                {onRequestSensitiveUnlock && (
                  <Button variant="contained" onClick={() => onRequestSensitiveUnlock?.()}>
                    Unlock with PIN
                  </Button>
                )}
              </Paper>
            ) : (
              <JobPaymentScheduleEditor
                job={job}
                onSave={handleSavePaymentSchedule}
                saving={scheduleSaving}
              />
            )}
          </Box>
        )}

        {activeTab === JOB_MODAL_TAB.files && (
          <Box>
            {hideFinancials ? (
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body1" sx={{ mb: 1 }}>
                  Financial details are locked in Shop View.
                </Typography>
                {onRequestSensitiveUnlock && (
                  <Button variant="contained" onClick={() => onRequestSensitiveUnlock?.()}>
                    Unlock with PIN
                  </Button>
                )}
              </Paper>
            ) : null}
            <>
            {!hideFinancials && (
              <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                      Estimate Amount
                    </Typography>
                    <Typography variant="h5" sx={{ color: 'success.main', fontWeight: 600 }}>
                      {formatCurrency(job.estimate?.amount || job.valueEstimated || 0)}
                    </Typography>
                    {job.estimate?.sentAt && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Sent: {formatDate(job.estimate.sentAt)}
                      </Typography>
                    )}
                    <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {jobEstimates.length > 0 ? (
                        jobEstimates.map((est) => (
                          <Button
                            key={est._id}
                            size="small"
                            variant="outlined"
                            component={RouterLink}
                            to={`/finance?tab=estimates&jobId=${job._id}&estimateId=${est._id}`}
                          >
                            Open {est.estimateNumber || 'estimate'}
                          </Button>
                        ))
                      ) : (
                        <Button
                          size="small"
                          variant="outlined"
                          component={RouterLink}
                          to={`/finance?tab=estimates&jobId=${job._id}`}
                        >
                          Create estimate
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PostAddIcon />}
                        onClick={() => setChangeOrderOpen(true)}
                      >
                        Change order
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        component={RouterLink}
                        to={`/takeoff-sheet?jobId=${job._id}`}
                      >
                        Open takeoff sheet
                      </Button>
                    </Box>
                  </Paper>
                </Grid>
              </Grid>
            )}

            {/* Files Display */}
            {files.length > 0 ? (
              <Grid container spacing={2} sx={{ mb: 2 }}>
                {files.map((file) => (
                  <Grid item xs={12} sm={6} md={4} key={file._id}>
                    <Paper
                      onClick={() => handleFileCardClick(file)}
                      sx={{
                        p: 2,
                        position: 'relative',
                        border: '2px solid',
                        borderColor: 'primary.main',
                        backgroundColor: 'primary.50',
                        cursor: 'pointer',
                        '&:hover': {
                          boxShadow: 6,
                          borderColor: 'primary.dark',
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                        <Box sx={{ color: 'primary.main', mt: 0.5 }}>
                          {getFileIcon(file.mimetype)}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="body1"
                            sx={{
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: 'primary.dark',
                            }}
                          >
                            {file.originalName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            {formatFileSize(file.size)} • {formatDate(file.createdAt)}
                          </Typography>
                          <Chip
                            label={file.fileType}
                            size="small"
                            sx={{ mt: 0.5, textTransform: 'capitalize', fontWeight: 600 }}
                            color="primary"
                          />
                        </Box>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFileDelete(file._id);
                          }}
                          sx={{ mt: -1 }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>

                      {/* Preview for images */}
                      {file.mimetype.startsWith('image/') && (
                        <Box sx={{ mt: 2, borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                          <img
                            src={`${API_URL}/files/${file._id}`}
                            alt={file.originalName}
                            style={{
                              width: '100%',
                              height: 'auto',
                              maxHeight: '200px',
                              objectFit: 'cover',
                              cursor: 'pointer',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openPictureViewer(file._id);
                            }}
                          />
                        </Box>
                      )}

                      {/* PDF first-page thumbnail (click to open) */}
                      {file.mimetype === 'application/pdf' && (
                        <Box sx={{ mt: 2, borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                          <Box
                            onClick={() => openPdfViewer(file._id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openPdfViewer(file._id);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            sx={{
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              bgcolor: 'action.hover',
                              py: 1,
                              '&:hover': { bgcolor: 'action.selected' },
                            }}
                            title="Open PDF"
                          >
                            <PdfThumbnail fileId={file._id} apiUrl={API_URL} maxWidth={360} maxHeight={200} />
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', py: 0.75 }}>
                            Click preview to open PDF
                          </Typography>
                        </Box>
                      )}
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Paper sx={{ p: 3, textAlign: 'center', mb: 2, border: '1px dashed', borderColor: 'grey.300' }}>
                <DescriptionIcon sx={{ fontSize: 32, color: 'text.secondary', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  No files uploaded yet
                </Typography>
              </Paper>
            )}

            {/* File Upload Section with Drag and Drop - Compact */}
            <Paper
              sx={{
                p: 2,
                border: '2px dashed',
                borderColor: dragActive ? 'primary.main' : 'grey.300',
                backgroundColor: dragActive ? 'primary.50' : 'grey.50',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
              }}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <CloudUploadIcon
                  sx={{
                    fontSize: 32,
                    color: 'primary.main',
                    transition: 'transform 0.2s ease',
                    transform: dragActive ? 'scale(1.1)' : 'scale(1)',
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                    {dragActive ? 'Drop files here' : 'Upload Files'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Drag & drop multiple files or click to browse • Images and PDFs • Max 10MB each
                  </Typography>
                </Box>
                <FormControl size="small" sx={{ minWidth: 120 }} onClick={(e) => e.stopPropagation()}>
                  <InputLabel>File Type</InputLabel>
                  <Select
                    value={fileType}
                    onChange={(e) => setFileType(e.target.value)}
                    label="File Type"
                    disabled={uploading}
                  >
                    <MenuItem value="estimate">Estimate</MenuItem>
                    <MenuItem value="contract">Contract</MenuItem>
                    <MenuItem value="photo">Photo</MenuItem>
                    <MenuItem value="other">Other</MenuItem>
                  </Select>
                </FormControl>
                <input
                  style={{ display: 'none' }}
                  id="file-upload"
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={handleFileInputChange}
                  disabled={uploading}
                />
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={uploading ? <CircularProgress size={16} /> : <CloudUploadIcon />}
                  disabled={uploading}
                  sx={{ textTransform: 'none' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    document.getElementById('file-upload')?.click();
                  }}
                >
                  {uploading ? 'Uploading...' : 'Browse'}
                </Button>
              </Box>
            </Paper>
            </>
          </Box>
        )}

        {activeTab === JOB_MODAL_TAB.notes && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 2 }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<DescriptionIcon />}
                onClick={() => setAddNoteOpen(true)}
                sx={{ borderRadius: '8px', textTransform: 'none' }}
              >
                Add Note
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AssignmentIcon />}
                onClick={() => setAddTaskOpen(true)}
                sx={{ borderRadius: '8px', textTransform: 'none' }}
              >
                Add Task
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<CalendarIcon />}
                onClick={() => setAddAppointmentOpen(true)}
                sx={{ borderRadius: '8px', textTransform: 'none' }}
              >
                Add Appointment
              </Button>
            </Box>
            
            {job.notes && job.notes.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[...job.notes]
                  .sort((a, b) => {
                    const dateA = new Date(a.createdAt || 0).getTime();
                    const dateB = new Date(b.createdAt || 0).getTime();
                    return dateB - dateA; // Descending order (newest first)
                  })
                  .map((note, index) => (
                    <Paper
                      key={index}
                      sx={{
                        p: 2,
                        ...(note.important && {
                          borderLeft: '4px solid',
                          borderColor: 'error.main',
                        }),
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          <Box component="span" sx={{ fontWeight: 700 }}>
                            [{getNoteAuthor(note)}]
                          </Box>{' '}
                          • {formatDateTime(note.createdAt)}
                        </Typography>
                      </Box>
                      <Typography 
                        variant="body2"
                        sx={{
                          color: note.important
                            ? 'error.main'
                            : note.isStageChange
                              ? '#1976D2'
                              : note.isAppointment
                                ? '#F57C00'
                                : 'inherit',
                          fontStyle: (note.isStageChange || note.isAppointment) && !note.important ? 'italic' : 'normal',
                          fontWeight: note.important ? 600 : note.isStageChange ? 500 : 'normal'
                        }}
                      >
                        {renderTextWithLinks(note.content)}
                      </Typography>
                    </Paper>
                  ))}
              </Box>
            ) : (
              <Paper sx={{ p: 4, textAlign: 'center' }}>
                <DescriptionIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                <Typography variant="body1" color="text.secondary">
                  No notes yet
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Click "Add Note" or "Add Task" above to get started
                </Typography>
              </Paper>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleDeleteCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Job</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>"{job?.title}"</strong>?
          </Typography>
          <Typography variant="body2" color="error" sx={{ mt: 2 }}>
            This action cannot be undone. All job data, estimates, and notes will be permanently deleted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Note Modal */}
      <AddNoteModal
        open={addNoteOpen}
        onClose={() => setAddNoteOpen(false)}
        onSuccess={() => {
          fetchJobDetails(); // Refresh job data to show new note
        }}
        job={job}
      />

      {/* Add Task Modal */}
      <AddJobTaskModal
        open={addTaskOpen}
        onClose={() => setAddTaskOpen(false)}
        onSuccess={() => {
          fetchJobDetails(); // Refresh job data to show new note (task creation adds a note)
        }}
        job={job}
      />

      {/* Add Appointment Modal */}
      <AddAppointmentModal
        open={addAppointmentOpen}
        onClose={() => setAddAppointmentOpen(false)}
        onSuccess={() => {
          fetchJobDetails(); // Refresh job data to show new note (appointment creation adds a note)
          if (onAppointmentCreated) {
            onAppointmentCreated(); // Trigger refresh of appointments list
          }
        }}
        job={job}
      />

      {job && (
        <JobChangeOrderDialog
          open={changeOrderOpen}
          onClose={() => setChangeOrderOpen(false)}
          job={job}
          onCreated={() => {
            fetchJobDetails();
          }}
        />
      )}

      <Dialog open={shareDialogOpen} onClose={handleCloseShareDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Share Customer by Text</DialogTitle>
        <DialogContent>
          <EmployeeSmsRecipientField
            dialogOpen={shareDialogOpen}
            value={shareSmsRecipient}
            onChange={setShareSmsRecipient}
            disabled={sendingShare}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth
            multiline
            minRows={4}
            label="Message"
            value={shareMessage}
            onChange={(e) => setShareMessage(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseShareDialog} disabled={sendingShare}>Cancel</Button>
          <Button onClick={handleSendShareSms} variant="contained" disabled={sendingShare}>
            {sendingShare ? 'Sending...' : 'Send Text'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={aiSummaryOpen}
        onClose={() => {
          if (!aiSummaryLoading) setAiSummaryOpen(false);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>AI job summary</DialogTitle>
        <DialogContent dividers>
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Optional focus (e.g. scheduling, customer communication)"
            value={aiSummaryPrompt}
            onChange={(e) => setAiSummaryPrompt(e.target.value)}
            disabled={aiSummaryLoading}
            sx={{ mb: 2 }}
            helperText={`${aiSummaryPrompt.length}/1500`}
            inputProps={{ maxLength: 1500 }}
          />
          {aiSummaryMeta && !aiSummaryLoading && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Based on {aiSummaryMeta.noteCount ?? 0} note(s), {aiSummaryMeta.activityCount ?? 0} activity
              row(s)
              {aiSummaryMeta.truncated ? ' (activity list capped)' : ''}, {aiSummaryMeta.taskCount ?? 0}{' '}
              task(s), {aiSummaryMeta.appointmentCount ?? 0} appointment(s).
              {aiSummaryMeta.generatedAt
                ? ` Generated ${formatDateTime(aiSummaryMeta.generatedAt)}.`
                : null}
            </Typography>
          )}
          {aiSummaryLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 4, justifyContent: 'center' }}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">
                Summarizing job history…
              </Typography>
            </Box>
          ) : (
            <Box sx={{ maxHeight: '50vh', overflowY: 'auto' }}>{renderSummaryBlocks(aiSummaryText)}</Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (aiSummaryText) {
                navigator.clipboard.writeText(aiSummaryText);
                toast.success('Summary copied');
              }
            }}
            disabled={!aiSummaryText || aiSummaryLoading}
            startIcon={<ContentCopyIcon />}
          >
            Copy
          </Button>
          <Button onClick={handleGenerateAiSummary} disabled={aiSummaryLoading}>
            Refresh
          </Button>
          <Button onClick={() => setAiSummaryOpen(false)} disabled={aiSummaryLoading}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

export default JobDetailModal;

