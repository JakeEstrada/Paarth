import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Typography,
  Box,
  Grid,
  Chip,
  Divider,
  Tabs,
  Tab,
  Paper,
  Button,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
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
  ArrowForward as ArrowForwardIcon,
  SwapHoriz as SwapHorizIcon,
  CloudUpload as CloudUploadIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Image as ImageIcon,
  InsertDriveFile as InsertDriveFileIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import axios from 'axios';
import toast from 'react-hot-toast';
import AddNoteModal from './AddNoteModal';
import AddJobTaskModal from './AddJobTaskModal';
import AddAppointmentModal from '../appointments/AddAppointmentModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const STAGE_LABELS = {
  APPOINTMENT_SCHEDULED: 'Appointment Scheduled',
  ESTIMATE_IN_PROGRESS: 'Estimate Current, first 5 days',
  ESTIMATE_SENT: 'Estimate Sent',
  ENGAGED_DESIGN_REVIEW: 'Design Review',
  CONTRACT_OUT: 'Contract Out',
  CONTRACT_SIGNED: 'Contract Signed',
  DEPOSIT_PENDING: 'Signed / Deposit Pending',
  JOB_PREP: 'Job Prep',
  TAKEOFF_COMPLETE: 'Takeoff Complete',
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

function JobDetailModal({ jobId, open, onClose, onJobUpdate, onJobDelete, onJobArchive, onAppointmentCreated }) {
  const [activeTab, setActiveTab] = useState(0);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedJob, setEditedJob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [selectedStage, setSelectedStage] = useState('');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [fileType, setFileType] = useState('other');
  const [dragActive, setDragActive] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addAppointmentOpen, setAddAppointmentOpen] = useState(false);

  useEffect(() => {
    if (open && jobId) {
      fetchJobDetails();
      setSelectedStage('');
    } else {
      setIsEditing(false);
      setEditedJob(null);
      setSelectedStage('');
    }
  }, [open, jobId]);

  const fetchJobDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/jobs/${jobId}`);
      setJob(response.data);
      setEditedJob(response.data);
      setIsEditing(false);
      // Fetch files for this job
      await fetchFiles();
    } catch (error) {
      console.error('Error fetching job details:', error);
      toast.error('Failed to load job details');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const fetchFiles = async () => {
    try {
      const response = await axios.get(`${API_URL}/files/job/${jobId}`);
      setFiles(response.data || []);
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const handleFileUpload = async (file, resetInput = null) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Only images and PDFs are allowed.');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('jobId', jobId);
      formData.append('fileType', fileType);

      await axios.post(`${API_URL}/files/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast.success('File uploaded successfully');
      await fetchFiles();
      setFileType('other'); // Reset file type
      if (resetInput) {
        resetInput.value = ''; // Reset file input
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error(error.response?.data?.error || 'Failed to upload file');
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

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0], e.target);
    }
  };

  const handleFileDelete = async (fileId) => {
    if (!window.confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/files/${fileId}`);
      toast.success('File deleted successfully');
      await fetchFiles();
    } catch (error) {
      console.error('Error deleting file:', error);
      toast.error('Failed to delete file');
    }
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

  const handleSave = async () => {
    try {
      setSaving(true);
      const updates = {
        title: editedJob.title,
        valueEstimated: editedJob.valueEstimated,
        valueContracted: editedJob.valueContracted,
        source: editedJob.source,
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

  const handleDeleteClick = () => {
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/jobs/${jobId}`);
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

  const handleMoveToNextStage = async () => {
    const nextStage = getNextStage(job.stage);
    if (!nextStage) {
      toast.error('Already at the final stage');
      return;
    }
    await handleMoveStage(nextStage);
  };

  const handleMoveStage = async (toStage) => {
    if (!toStage) {
      toast.error('Please select a stage');
      return;
    }

    if (toStage === job.stage) {
      toast.error('Job is already in this stage');
      return;
    }

    try {
      setMovingStage(true);
      await axios.post(`${API_URL}/jobs/${jobId}/move-stage`, {
        toStage,
        note: `Moved from ${STAGE_LABELS[job.stage]} to ${STAGE_LABELS[toStage]}`
      });
      
      toast.success(`Moved to ${STAGE_LABELS[toStage]}`);
      await fetchJobDetails(); // Refresh job data
      if (onJobUpdate) {
        onJobUpdate(jobId, { stage: toStage });
      }
      setSelectedStage('');
    } catch (error) {
      console.error('Error moving stage:', error);
      toast.error(error.response?.data?.error || 'Failed to move stage');
    } finally {
      setMovingStage(false);
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

  if (!open || !job) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '16px',
          maxHeight: '90vh',
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            {isEditing ? (
              <TextField
                fullWidth
                value={editedJob?.title || ''}
                onChange={(e) => handleFieldChange('title', e.target.value)}
                variant="outlined"
                size="small"
                sx={{ mb: 1 }}
              />
            ) : (
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
                {job.title}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              {job.customerId?.name || 'Unknown Customer'}
            </Typography>
            {job.customerId && (
              <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap' }}>
                {job.customerId._id && (
                  <Typography variant="caption" color="text.secondary">
                    Customer #: {job.customerId._id.toString().slice(-6).toUpperCase()}
                  </Typography>
                )}
                {(job.customerId.address?.street || job.customerId.address?.city) && (
                  <Typography variant="caption" color="text.secondary">
                    <LocationIcon sx={{ fontSize: 12, verticalAlign: 'middle', mr: 0.5 }} />
                    {[
                      job.customerId.address?.street,
                      job.customerId.address?.city,
                      job.customerId.address?.state,
                      job.customerId.address?.zip
                    ].filter(Boolean).join(', ')}
                  </Typography>
                )}
              </Box>
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
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
          <Tab label="Overview" />
          <Tab label="Files" />
          <Tab label="Schedule" />
          <Tab label="Notes" />
        </Tabs>

        {activeTab === 0 && (
          <Grid container spacing={3}>
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
                  sx={{ mt: 1, mb: 2 }}
                />
                
                {/* Stage Movement Controls */}
                {!job?.isArchived && !job?.isDeadEstimate && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 2 }}>
                    {/* Move to Next Stage Button */}
                    {getNextStage(job.stage) && (
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<ArrowForwardIcon />}
                        onClick={handleMoveToNextStage}
                        disabled={movingStage}
                        fullWidth
                        sx={{ textTransform: 'none' }}
                      >
                        Move to Next Stage
                      </Button>
                    )}
                    
                    {/* Move to Any Stage Dropdown */}
                    <FormControl fullWidth size="small">
                      <InputLabel>Move to Stage</InputLabel>
                      <Select
                        value={selectedStage}
                        onChange={(e) => {
                          const stage = e.target.value;
                          setSelectedStage(stage);
                          if (stage && stage !== job.stage) {
                            handleMoveStage(stage);
                          }
                        }}
                        label="Move to Stage"
                        disabled={movingStage}
                      >
                        <MenuItem value="">
                          <em>Select a stage...</em>
                        </MenuItem>
                        {ALL_STAGES.map((stage) => (
                          <MenuItem 
                            key={stage} 
                            value={stage}
                            disabled={stage === job.stage}
                          >
                            {STAGE_LABELS[stage]}
                            {stage === job.stage && ' (Current)'}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                )}
              </Paper>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Paper sx={{ p: 2, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <MoneyIcon sx={{ mr: 1, color: 'success.main' }} />
                  <Typography variant="subtitle2" color="text.secondary">
                    Estimated Value
                  </Typography>
                </Box>
                {isEditing ? (
                  <TextField
                    type="number"
                    value={editedJob?.valueEstimated || 0}
                    onChange={(e) => handleFieldChange('valueEstimated', parseFloat(e.target.value) || 0)}
                    variant="outlined"
                    size="small"
                    fullWidth
                    sx={{ mt: 1 }}
                    InputProps={{
                      startAdornment: <Typography sx={{ mr: 1 }}>$</Typography>,
                    }}
                  />
                ) : (
                  <Typography variant="h5" sx={{ color: 'success.main', fontWeight: 600, mt: 1 }}>
                    {formatCurrency(job.valueEstimated)}
                  </Typography>
                )}
              </Paper>
            </Grid>

            {/* Customer Information */}
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
                  {job.customerId?.primaryPhone && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      Phone: {job.customerId.primaryPhone}
                    </Typography>
                  )}
                  {job.customerId?.primaryEmail && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      Email: {job.customerId.primaryEmail}
                    </Typography>
                  )}
                  {(job.customerId?.address?.street || job.customerId?.address?.city) && (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', mt: 1 }}>
                      <LocationIcon sx={{ fontSize: 16, color: 'text.secondary', mr: 0.5, mt: 0.25 }} />
                      <Typography variant="caption" color="text.secondary">
                        {[
                          job.customerId.address?.street,
                          job.customerId.address?.city,
                          job.customerId.address?.state,
                          job.customerId.address?.zip
                        ].filter(Boolean).join(', ')}
                      </Typography>
                    </Box>
                  )}
                </Box>
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

        {activeTab === 1 && (
          <Box>
            <Grid container spacing={3} sx={{ mb: 3 }}>
              {/* Estimate Info */}
              <Grid item xs={12} sm={6}>
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
                </Paper>
              </Grid>

              {/* Contract Info */}
              <Grid item xs={12} sm={6}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Contract Signed
                  </Typography>
                  {job.contract?.signedAt ? (
                    <>
                      <Typography variant="body1">
                        {formatDate(job.contract.signedAt)}
                      </Typography>
                      {job.contract.depositRequired > 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          Deposit: {formatCurrency(job.contract.depositRequired)}
                        </Typography>
                      )}
                    </>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Not signed yet
                    </Typography>
                  )}
                </Paper>
              </Grid>
            </Grid>

            {/* Files Display */}
            {files.length > 0 ? (
              <Grid container spacing={2} sx={{ mb: 2 }}>
                {files.map((file) => (
                  <Grid item xs={12} sm={6} md={4} key={file._id}>
                    <Paper
                      sx={{
                        p: 2,
                        position: 'relative',
                        border: '2px solid',
                        borderColor: 'primary.main',
                        backgroundColor: 'primary.50',
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
                          onClick={() => handleFileDelete(file._id)}
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
                            onClick={() => window.open(`${API_URL}/files/${file._id}`, '_blank')}
                          />
                        </Box>
                      )}

                      {/* Link for PDFs */}
                      {file.mimetype === 'application/pdf' && (
                        <Button
                          fullWidth
                          variant="contained"
                          size="medium"
                          startIcon={<PictureAsPdfIcon />}
                          onClick={() => window.open(`${API_URL}/files/${file._id}`, '_blank')}
                          sx={{ mt: 2, textTransform: 'none', fontWeight: 600 }}
                        >
                          View PDF
                        </Button>
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
                    Drag & drop or click to browse • PDFs or photos • Max 10MB
                  </Typography>
                </Box>
                <FormControl size="small" sx={{ minWidth: 120 }}>
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
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  id="file-upload"
                  type="file"
                  onChange={handleFileInputChange}
                  disabled={uploading}
                />
                <label htmlFor="file-upload">
                  <Button
                    variant="outlined"
                    component="span"
                    size="small"
                    startIcon={<CloudUploadIcon />}
                    disabled={uploading}
                    sx={{ textTransform: 'none' }}
                  >
                    {uploading ? 'Uploading...' : 'Browse'}
                  </Button>
                </label>
              </Box>
            </Paper>
          </Box>
        )}

        {activeTab === 2 && (
          <Box>
            {job.schedule?.startDate ? (
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                      Start Date
                    </Typography>
                    <Typography variant="body1">
                      {formatDate(job.schedule.startDate)}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                      End Date
                    </Typography>
                    <Typography variant="body1">
                      {formatDate(job.schedule.endDate)}
                    </Typography>
                  </Paper>
                </Grid>
                {job.schedule.crewNotes && (
                  <Grid item xs={12}>
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                        Crew Notes
                      </Typography>
                      <Typography variant="body2">
                        {job.schedule.crewNotes}
                      </Typography>
                    </Paper>
                  </Grid>
                )}
              </Grid>
            ) : (
              <Paper sx={{ p: 4, textAlign: 'center' }}>
                <CalendarIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                <Typography variant="body1" color="text.secondary">
                  No schedule has been set yet
                </Typography>
              </Paper>
            )}
          </Box>
        )}

        {activeTab === 3 && (
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
                    const dateA = new Date(a.createdAt || 0);
                    const dateB = new Date(b.createdAt || 0);
                    return dateB - dateA; // Descending order (newest first)
                  })
                  .map((note, index) => (
                    <Paper key={index} sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          {note.createdBy?.name || 'Unknown'} • {formatDateTime(note.createdAt)}
                        </Typography>
                      </Box>
                      <Typography 
                        variant="body2"
                        sx={{
                          color: note.isStageChange ? '#1976D2' : (note.isAppointment ? '#F57C00' : 'inherit'),
                          fontStyle: (note.isStageChange || note.isAppointment) ? 'italic' : 'normal',
                          fontWeight: note.isStageChange ? 500 : 'normal'
                        }}
                      >
                        {note.content}
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
    </Dialog>
  );
}

export default JobDetailModal;

