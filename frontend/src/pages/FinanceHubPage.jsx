import { useEffect, useMemo, useRef, useState } from 'react';
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
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, PictureAsPdf as PictureAsPdfIcon } from '@mui/icons-material';
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

function parseCreateNewOptionName(option) {
  if (!option || option._id !== 'new' || typeof option.name !== 'string') return '';
  const m = /^Create "(.*)"$/.exec(option.name);
  return m ? m[1] : '';
}

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

function FinanceHubPage() {
  const [activeTab, setActiveTab] = useState(TAB_DEFS[0].key);
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerInputValue, setCustomerInputValue] = useState('');
  const [savingEstimate, setSavingEstimate] = useState(false);
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
      state: '',
      zip: '',
    },
    projectName: '',
    lineItems: [
      { itemName: 'Staircase', description: '', quantity: 1, total: '' },
      { itemName: 'Wall Rail', description: '', quantity: 1, total: '' },
      { itemName: 'Additional', description: '', quantity: 1, total: '' },
    ],
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
      if (newValue._id === 'new') {
        const typedName = parseCreateNewOptionName(newValue);
        setEstimateForm((prev) => ({
          ...prev,
          customerId: null,
          customerName: typedName || prev.customerName,
          customerPhone: '',
          customerEmail: '',
          customerAddress: { street: '', city: '', state: '', zip: '' },
        }));
        if (typedName) setCustomerInputValue(typedName);
      } else {
        setEstimateForm((prev) => ({
          ...prev,
          customerId: newValue._id,
          customerName: newValue.name || '',
          customerPhone: newValue.primaryPhone || '',
          customerEmail: newValue.primaryEmail || '',
          customerAddress: newValue.address || { street: '', city: '', state: '', zip: '' },
        }));
        setCustomerInputValue(newValue.name || '');
      }
    } else if (reason === 'clear') {
      setEstimateForm((prev) => ({
        ...prev,
        customerId: null,
        customerName: '',
      }));
      setCustomerInputValue('');
    }
  };

  const handleEstimateCustomerInputChange = (_, value) => {
    setCustomerInputValue(value);
    setEstimateForm((prev) => ({
      ...prev,
      customerName: value,
      customerId: prev.customerName.toLowerCase() === value.toLowerCase() ? prev.customerId : null,
    }));
  };

  const ensureCustomerForEstimate = async () => {
    if (estimateForm.customerId) return estimateForm.customerId;
    const name = estimateForm.customerName.trim();
    if (!name) throw new Error('Customer name is required');

    const existing = customers.find((c) => (c.name || '').toLowerCase() === name.toLowerCase());
    if (existing?._id) return existing._id;

    const payload = {
      name,
      primaryPhone: estimateForm.customerPhone || undefined,
      primaryEmail: estimateForm.customerEmail || undefined,
      address:
        estimateForm.customerAddress.street || estimateForm.customerAddress.city
          ? estimateForm.customerAddress
          : undefined,
      skipInitialJob: true,
    };
    const response = await axios.post(`${API_URL}/customers`, payload);
    const newCustomer = response.data;
    setCustomers((prev) => [newCustomer, ...prev]);
    setEstimateForm((prev) => ({ ...prev, customerId: newCustomer._id }));
    return newCustomer._id;
  };

  const createEstimateJob = async () => {
    const customerId = await ensureCustomerForEstimate();
    const estimateDateIso = new Date(`${estimateForm.estimateDate}T12:00:00.000Z`);
    const normalizedRows = estimateForm.lineItems
      .filter((r) => r.itemName.trim() || r.description.trim())
      .map((r) => ({
        description: `${r.itemName || 'Item'}${r.description ? ` - ${r.description}` : ''}`,
        quantity: Number(r.quantity) || 0,
        total: Number(r.total) || 0,
      }));

    const payload = {
      title: `${estimateForm.customerName || 'Customer'} Estimate ${estimateForm.estimateNumber}`,
      customerId,
      stage: 'ESTIMATE_IN_PROGRESS',
      valueEstimated: estimateTotal || 0,
      estimate: {
        number: estimateForm.estimateNumber,
        amount: estimateTotal || 0,
        sentAt: estimateDateIso.toISOString(),
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

    await axios.post(`${API_URL}/jobs`, payload);
  };

  const downloadEstimatePdf = async () => {
    if (!estimateForm.customerName.trim()) {
      toast.error('Please choose or create a customer first');
      return;
    }

    try {
      if (!estimateCanvasRef.current) {
        toast.error('Estimate canvas not ready');
        return;
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
      doc.save(`Estimate-${estimateForm.estimateNumber}.pdf`);
      toast.success('Estimate PDF downloaded');
    } catch (error) {
      console.error('Error generating estimate PDF:', error);
      toast.error('Failed to generate estimate PDF');
    }
  };

  const handleCreateEstimate = async () => {
    if (!estimateForm.customerName.trim()) {
      toast.error('Customer name is required');
      return;
    }
    if (!estimateForm.estimateDate) {
      toast.error('Estimate date is required');
      return;
    }
    try {
      setSavingEstimate(true);
      await createEstimateJob();
      const currentSeq = readEstimateSequence();
      const nextSeq = currentSeq + 1;
      writeEstimateSequence(nextSeq);
      setEstimateForm((prev) => ({
        ...prev,
        estimateNumber: formatEstimateNumber(nextSeq),
      }));
      toast.success(`Estimate ${estimateForm.estimateNumber} created`);
    } catch (error) {
      console.error('Error creating estimate:', error);
      toast.error(error.response?.data?.error || error.message || 'Failed to create estimate');
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
                New Estimate
              </Typography>
              <Chip size="small" color="primary" label={estimateForm.estimateNumber} />
            </Box>

            <Autocomplete
              freeSolo
              options={customers}
              loading={loadingCustomers}
              value={estimateForm.customerId ? customers.find((c) => c._id === estimateForm.customerId) || null : null}
              inputValue={customerInputValue}
              onChange={handleEstimateCustomerChange}
              onInputChange={handleEstimateCustomerInputChange}
              isOptionEqualToValue={(option, value) => String(option?._id) === String(value?._id)}
              getOptionLabel={(option) => {
                if (typeof option === 'string') return option;
                if (option._id === 'new') return option.name;
                return option.name || '';
              }}
              filterOptions={(options, params) => {
                const filtered = options.filter((option) =>
                  (option.name || '').toLowerCase().includes(params.inputValue.toLowerCase())
                );
                if (
                  params.inputValue &&
                  !options.some((opt) => (opt.name || '').toLowerCase() === params.inputValue.toLowerCase())
                ) {
                  return [{ _id: 'new', name: `Create "${params.inputValue}"` }, ...filtered];
                }
                return filtered;
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Customer (select or create)"
                  helperText="Type a new name to create a customer when saving estimate"
                  fullWidth
                />
              )}
            />

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
                      <TextField
                        variant="standard"
                        value={estimateForm.customerAddress.state}
                        onChange={(e) => setEstimateAddressField('state', e.target.value)}
                        placeholder="ST"
                        InputProps={{ disableUnderline: true, sx: { fontSize: 13 } }}
                        sx={{ width: 60 }}
                      />
                      <TextField
                        variant="standard"
                        value={estimateForm.customerAddress.zip}
                        onChange={(e) => setEstimateAddressField('zip', e.target.value)}
                        placeholder="ZIP"
                        InputProps={{ disableUnderline: true, sx: { fontSize: 13 } }}
                        sx={{ width: 90 }}
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
                          type="number"
                          value={row.quantity}
                          onChange={(e) => setLineItem(index, 'quantity', e.target.value)}
                          InputProps={{ disableUnderline: true, sx: { fontSize: 12.5 } }}
                          fullWidth
                        />
                      </Box>
                      <Box sx={{ px: 0.75, py: 0.45, display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
                        <TextField
                          variant="standard"
                          type="number"
                          value={row.total}
                          onChange={(e) => setLineItem(index, 'total', e.target.value)}
                          InputProps={{ disableUnderline: true, sx: { fontSize: 12.5 } }}
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

            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', mt: 3 }}>
              <Button
                variant="outlined"
                startIcon={<PictureAsPdfIcon />}
                onClick={downloadEstimatePdf}
              >
                Download PDF
              </Button>
              <Button variant="contained" onClick={handleCreateEstimate} disabled={savingEstimate}>
                {savingEstimate ? 'Saving...' : 'Save Estimate'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}

export default FinanceHubPage;
