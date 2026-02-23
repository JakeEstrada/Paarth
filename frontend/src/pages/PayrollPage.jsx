import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Button,
  Grid,
  Card,
  CardContent,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  useTheme,
} from '@mui/material';
import {
  Print as PrintIcon,
  AccessTime as TimeIcon,
  DirectionsCar as CarIcon,
  Receipt as ReceiptIcon,
  AccountBalance as PaycheckIcon,
  Add as AddIcon,
  Save as SaveIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';

const DAYS = ['Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

const PRESETS_STORAGE_KEY = 'payroll_saved_presets';

function PayrollPage() {
  const theme = useTheme();
  const [employeeName, setEmployeeName] = useState('Dave');
  const [ratePerHour, setRatePerHour] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' }));
  const [presetSelect, setPresetSelect] = useState('');
  const [savedPresets, setSavedPresets] = useState([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  
  // Work hours - default 6:00 AM - 2:30 PM (600 - 1430)
  const [workHours, setWorkHours] = useState(
    DAYS.map(day => ({
      day,
      in: day === 'Saturday' || day === 'Sunday' ? '0' : '600',
      out: day === 'Saturday' || day === 'Sunday' ? '0' : '1430',
      breaks: day === 'Saturday' || day === 'Sunday' ? '0' : '30',
    }))
  );

  // Load saved presets from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (saved) {
      try {
        setSavedPresets(JSON.parse(saved));
      } catch (error) {
        console.error('Error loading saved presets:', error);
      }
    }
  }, []);

  // Travel miles
  const [travelMiles, setTravelMiles] = useState(
    DAYS.map(day => ({
      day,
      miles: '',
    }))
  );

  // Receipts - array of { amount: '', description: '' }
  const [receipts, setReceipts] = useState([]);

  // Price per mile
  const pricePerMile = 0.725;

  // Convert time string (e.g., "630" or "1430") to minutes since midnight
  const timeToMinutes = (timeStr) => {
    if (!timeStr || timeStr === '') return 0;
    const padded = timeStr.padStart(4, '0');
    const hours = parseInt(padded.substring(0, 2), 10);
    const minutes = parseInt(padded.substring(2, 4), 10);
    return hours * 60 + minutes;
  };

  // Convert minutes to hours (decimal)
  const minutesToHours = (minutes) => {
    return minutes / 60;
  };

  // Calculate hours worked for a day
  const calculateHours = (inTime, outTime, breaks) => {
    if (!inTime || !outTime) return 0;
    const inMinutes = timeToMinutes(inTime);
    const outMinutes = timeToMinutes(outTime);
    const breakMinutes = parseInt(breaks || '0', 10);
    
    if (outMinutes <= inMinutes) return 0; // Invalid time range
    
    const totalMinutes = outMinutes - inMinutes - breakMinutes;
    return Math.max(0, minutesToHours(totalMinutes));
  };

  // Calculate weighted hours (overtime calculation)
  // Regular hours: first 40 hours at 1x
  // Overtime hours: hours over 40 at 1.5x
  const calculateWeightedHours = () => {
    const totalHours = workHours.reduce((sum, day) => {
      return sum + calculateHours(day.in, day.out, day.breaks);
    }, 0);

    if (totalHours <= 40) {
      return { regular: totalHours, overtime: 0, weighted: totalHours };
    } else {
      const regular = 40;
      const overtime = totalHours - 40;
      const weighted = regular + (overtime * 1.5);
      return { regular, overtime, weighted };
    }
  };

  // Calculate total hours
  const totalHours = workHours.reduce((sum, day) => {
    return sum + calculateHours(day.in, day.out, day.breaks);
  }, 0);

  // Calculate calculatable hours (total hours)
  const calculatableHours = totalHours;

  // Calculate total travel miles
  const totalMiles = travelMiles.reduce((sum, day) => {
    return sum + (parseFloat(day.miles) || 0);
  }, 0);

  // Calculate travel cost
  const travelCost = totalMiles * pricePerMile;

  // Calculate total receipts
  const totalReceipts = receipts.reduce((sum, receipt) => {
    return sum + (parseFloat(receipt.amount) || 0);
  }, 0);

  // Calculate pay hours (weighted hours × rate per hour)
  const weightedHoursData = calculateWeightedHours();
  const payHours = (parseFloat(ratePerHour) || 0) * weightedHoursData.weighted;

  // Calculate overall total
  const overallTotal = payHours + travelCost + totalReceipts;

  // Format time for display (e.g., "630" -> "6:30 AM")
  const formatTime = (timeStr) => {
    if (!timeStr || timeStr === '') return '';
    const padded = timeStr.padStart(4, '0');
    const hours = parseInt(padded.substring(0, 2), 10);
    const minutes = padded.substring(2, 4);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours}:${minutes} ${period}`;
  };

  // Handle work hours change
  const handleWorkHoursChange = (index, field, value) => {
    const updated = [...workHours];
    updated[index] = { ...updated[index], [field]: value };
    setWorkHours(updated);
  };

  // Handle travel miles change
  const handleTravelMilesChange = (index, value) => {
    const updated = [...travelMiles];
    updated[index] = { ...updated[index], miles: value };
    setTravelMiles(updated);
  };

  // Handle receipts change
  const handleReceiptsChange = (index, field, value) => {
    const updated = [...receipts];
    updated[index] = { ...updated[index], [field]: value };
    setReceipts(updated);
  };

  // Add new receipt
  const handleAddReceipt = () => {
    setReceipts([...receipts, { amount: '', description: '' }]);
  };

  // Remove receipt
  const handleRemoveReceipt = (index) => {
    const updated = receipts.filter((_, i) => i !== index);
    setReceipts(updated);
  };

  // Load preset hours
  const handlePresetChange = (preset) => {
    if (preset === 'zero') {
      // All zeros
      setWorkHours(
        DAYS.map(day => ({
          day,
          in: '0',
          out: '0',
          breaks: '0',
        }))
      );
    } else if (preset === 'standard') {
      // Friday and Mon-Thurs: 600-1430 with 30min break
      setWorkHours(
        DAYS.map(day => {
          if (day === 'Friday' || day === 'Monday' || day === 'Tuesday' || day === 'Wednesday' || day === 'Thursday') {
            return {
              day,
              in: '600',
              out: '1430',
              breaks: '30',
            };
          } else {
            // Saturday and Sunday
            return {
              day,
              in: '0',
              out: '0',
              breaks: '0',
            };
          }
        })
      );
    } else {
      // Load saved preset
      const savedPreset = savedPresets.find(p => p.id === preset);
      if (savedPreset) {
        setWorkHours(savedPreset.hours);
      }
    }
    // Reset the select after loading
    setPresetSelect('');
  };

  // Save current hours as a new preset
  const handleSavePreset = () => {
    if (!presetName.trim()) {
      return;
    }

    const newPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      hours: [...workHours],
      createdAt: new Date().toISOString(),
    };

    const updatedPresets = [...savedPresets, newPreset];
    setSavedPresets(updatedPresets);
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updatedPresets));
    
    setPresetName('');
    setSaveDialogOpen(false);
    toast.success(`Preset "${newPreset.name}" saved successfully`);
  };

  // Delete a saved preset
  const handleDeletePreset = (presetId, e) => {
    e.stopPropagation(); // Prevent dropdown from closing
    if (window.confirm('Are you sure you want to delete this preset?')) {
      const updatedPresets = savedPresets.filter(p => p.id !== presetId);
      setSavedPresets(updatedPresets);
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updatedPresets));
      toast.success('Preset deleted');
    }
  };

  // Print functionality
  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Print-specific styles */}
      <style>{`
        @media print {
          @page {
            margin: 1in;
          }
          body * {
            visibility: hidden;
          }
          .print-summary, .print-summary * {
            visibility: visible;
          }
          .print-summary {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          /* Hide sidebar and navigation */
          nav, aside, header, footer,
          [class*="Sidebar"], [class*="sidebar"],
          [class*="Drawer"], [class*="drawer"] {
            display: none !important;
          }
        }
      `}</style>
      
      <Box sx={{ p: { xs: 1, sm: 2, md: 4 }, width: '100%', '@media print': { p: 0 } }}>
        {/* Print Summary - Only visible when printing */}
        <Box className="print-summary" sx={{ display: 'none', '@media print': { display: 'block', p: 2 } }}>
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          {/* Logo at top left */}
          <Box sx={{ flexShrink: 0 }}>
            <Box
              component="img"
              src="/logo.png"
              alt="San Clemente Woodworking"
              sx={{
                height: 60,
                width: 60,
                objectFit: 'contain',
              }}
            />
          </Box>
          {/* Employee info on the right */}
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="body1" sx={{ fontSize: '10pt' }}><strong>Employee:</strong> {employeeName}</Typography>
            <Typography variant="body1" sx={{ fontSize: '10pt' }}><strong>Rate Per Hour:</strong> ${ratePerHour || '0.00'}</Typography>
            <Typography variant="body1" sx={{ fontSize: '10pt' }}><strong>Date:</strong> {date}</Typography>
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5, borderBottom: '2px solid #000', pb: 0.5, fontSize: '12pt' }}>
            Work Hours
          </Typography>
          <Table size="small" sx={{ mb: 2, border: '1px solid #000', borderCollapse: 'collapse', '& td, & th': { borderCollapse: 'collapse' } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, borderRight: '1px solid #000', borderBottom: '1px solid #000', fontSize: '9pt', py: 0.5 }}>Day</TableCell>
                <TableCell sx={{ fontWeight: 700, borderRight: '1px solid #000', borderBottom: '1px solid #000', fontSize: '9pt', py: 0.5 }}>In</TableCell>
                <TableCell sx={{ fontWeight: 700, borderRight: '1px solid #000', borderBottom: '1px solid #000', fontSize: '9pt', py: 0.5 }}>Out</TableCell>
                <TableCell sx={{ fontWeight: 700, borderRight: '1px solid #000', borderBottom: '1px solid #000', fontSize: '9pt', py: 0.5 }} align="center">Hours</TableCell>
                <TableCell sx={{ fontWeight: 700, borderBottom: '1px solid #000', fontSize: '9pt', py: 0.5 }} align="center">Breaks (min)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {workHours.map((day) => {
                const hours = calculateHours(day.in, day.out, day.breaks);
                return (
                  <TableRow key={day.day}>
                    <TableCell sx={{ fontWeight: 600, borderRight: '1px solid #000', fontSize: '8pt', py: 0.5 }}>{day.day}</TableCell>
                    <TableCell sx={{ borderRight: '1px solid #000', fontSize: '8pt', py: 0.5 }}>{day.in || '0'}</TableCell>
                    <TableCell sx={{ borderRight: '1px solid #000', fontSize: '8pt', py: 0.5 }}>{day.out || '0'}</TableCell>
                    <TableCell sx={{ borderRight: '1px solid #000', fontSize: '8pt', py: 0.5 }} align="center">{hours.toFixed(2)} hrs</TableCell>
                    <TableCell sx={{ fontSize: '8pt', py: 0.5 }} align="center">{day.breaks || '0'}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow sx={{ backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5', '& td': { fontWeight: 700, borderTop: `2px solid ${theme.palette.divider}`, fontSize: '9pt', py: 0.5 } }}>
                <TableCell sx={{ borderRight: '1px solid #000' }}>Total</TableCell>
                <TableCell sx={{ borderRight: '1px solid #000' }}></TableCell>
                <TableCell sx={{ borderRight: '1px solid #000' }}></TableCell>
                <TableCell sx={{ borderRight: '1px solid #000' }} align="center">{totalHours.toFixed(2)} hrs</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="body1" sx={{ fontSize: '9pt', mb: 0.5 }}><strong>Total Hours:</strong> {totalHours.toFixed(2)} hrs</Typography>
            <Typography variant="body1" sx={{ fontSize: '9pt', mb: 0.5 }}><strong>Weighted Hours:</strong> {weightedHoursData.weighted.toFixed(2)} hrs</Typography>
            {weightedHoursData.overtime > 0 && (
              <Typography variant="body2" sx={{ ml: 2, fontSize: '8pt' }}>
                ({weightedHoursData.regular.toFixed(2)} regular + {weightedHoursData.overtime.toFixed(2)} overtime × 1.5)
              </Typography>
            )}
          </Box>
        </Box>

        {/* Always show Travel Miles section */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, fontSize: '12pt' }}>
            Miles
          </Typography>
          <Box sx={{ borderBottom: '1px solid #000', mb: 1.5 }}></Box>
          {totalMiles > 0 ? (
            <>
              {travelMiles
                .filter(day => parseFloat(day.miles) > 0)
                .map((day) => (
                  <Typography key={day.day} variant="body1" sx={{ fontSize: '9pt', mb: 0.3 }}>
                    {day.day}: {day.miles} miles
                  </Typography>
                ))}
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="body1" sx={{ fontSize: '9pt' }}><strong>Travel Cost:</strong> ${travelCost.toFixed(2)}</Typography>
              </Box>
            </>
          ) : (
            <Typography variant="body1" sx={{ fontSize: '9pt' }}>0</Typography>
          )}
        </Box>

        {/* Always show Receipts section */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, fontSize: '12pt' }}>
            Receipts
          </Typography>
          <Box sx={{ borderBottom: '1px solid #000', mb: 1.5 }}></Box>
          <Typography variant="body1" sx={{ fontSize: '9pt' }}>
            ${totalReceipts.toFixed(2)}
          </Typography>
        </Box>

        <Box sx={{ mt: 3, p: 2, border: `2px solid ${theme.palette.divider}`, backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f9f9f9' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, textAlign: 'center', fontSize: '12pt' }}>
            Paycheck Summary
          </Typography>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body1" sx={{ fontSize: '9pt', mb: 1 }}><strong>Pay Hours:</strong> ${payHours.toFixed(2)}</Typography>
            <Typography variant="body1" sx={{ fontSize: '9pt', mb: 1 }}><strong>Travel Cost:</strong> ${travelCost.toFixed(2)}</Typography>
            <Typography variant="body1" sx={{ fontSize: '9pt', mb: 1 }}><strong>Receipts:</strong> ${totalReceipts.toFixed(2)}</Typography>
          </Box>
          <Divider sx={{ my: 2, borderWidth: 2 }} />
          <Box sx={{ textAlign: 'center', mt: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '14pt' }}>
              Overall Total: ${overallTotal.toFixed(2)}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Interactive Form - Hidden when printing */}
      <Box sx={{ '@media print': { display: 'none' } }}>
        {/* Header */}
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between', 
          alignItems: { xs: 'stretch', md: 'center' }, 
          mb: { xs: 3, sm: 4, md: 5 },
          gap: { xs: 2, md: 0 }
        }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: theme.palette.primary.main, fontSize: { xs: '1.5rem', sm: '2rem' } }}>
              SAN CLEMENTE WOODWORKING
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
              Payroll Timesheet
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 1, sm: 2 }, alignItems: 'stretch', width: { xs: '100%', md: 'auto' } }}>
            <FormControl size="small" sx={{ minWidth: 250 }}>
              <InputLabel>Load Hours</InputLabel>
              <Select
                label="Load Hours"
                value={presetSelect}
                onChange={(e) => {
                  const preset = e.target.value;
                  if (preset) {
                    handlePresetChange(preset);
                  }
                }}
                sx={{ textTransform: 'none' }}
              >
                <MenuItem value="zero">Clear All (Set to Zero)</MenuItem>
                <MenuItem value="standard">Standard Week (Mon-Thurs & Fri: 6:00-14:30, 30min break)</MenuItem>
                {savedPresets.length > 0 && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    {savedPresets.map((preset) => (
                      <MenuItem 
                        key={preset.id} 
                        value={preset.id}
                        sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          pr: 0.5
                        }}
                      >
                        <Box sx={{ flex: 1 }}>{preset.name}</Box>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleDeletePreset(preset.id, e);
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                          }}
                          sx={{ 
                            ml: 1,
                            '&:hover': { backgroundColor: 'error.light', color: 'error.main' }
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </MenuItem>
                    ))}
                  </>
                )}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              startIcon={<SaveIcon />}
              onClick={() => setSaveDialogOpen(true)}
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              Save Current Hours
            </Button>
            <Button
              variant="contained"
              startIcon={<PrintIcon />}
              onClick={handlePrint}
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              Print
            </Button>
          </Box>
        </Box>

        {/* Employee Info Card */}
        <Card sx={{ mb: { xs: 2, sm: 3, md: 4 }, boxShadow: 2 }}>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Grid container spacing={{ xs: 2, sm: 3, md: 4 }}>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Employee Name"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  fullWidth
                  variant="outlined"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Rate Per Hour ($)"
                  value={ratePerHour}
                  onChange={(e) => setRatePerHour(e.target.value)}
                  fullWidth
                  type="number"
                  variant="outlined"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  fullWidth
                  variant="outlined"
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Locked Container for Sections - Same width as header card */}
        <Box sx={{ 
          width: '100%',
          border: '1px solid #e0e0e0',
          borderRadius: 2,
          p: { xs: 1.5, sm: 2, md: 3 },
          backgroundColor: theme.palette.mode === 'dark' ? '#1E1E1E' : '#fafafa'
        }}>
          {/* Flexbox container for all widgets */}
          <Box sx={{ 
            display: 'flex',
            flexDirection: 'column',
            gap: { xs: 2, sm: 3 },
            width: '100%'
          }}>
            {/* Top Row: Work Hours and Travel Miles */}
            <Box sx={{ 
              display: 'flex',
              flexDirection: { xs: 'column', lg: 'row' },
              gap: { xs: 2, sm: 3 },
              width: '100%'
            }}>
              {/* Work Hours Section */}
              <Card sx={{ 
                flex: 1,
                boxShadow: 2,
                display: 'flex',
                flexDirection: 'column',
                '@media print': { boxShadow: 'none' }
              }}>
                <CardContent sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <TimeIcon sx={{ color: 'primary.main', fontSize: 28 }} />
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  Work Hours
                </Typography>
              </Box>

              <Table size="small" sx={{ mb: 4, width: '100%' }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5' }}>
                    <TableCell sx={{ fontWeight: 700, width: '20%' }}>Day</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: '20%' }}>In</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: '20%' }}>Out</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: '20%' }} align="center">Hours</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: '20%' }} align="center">Breaks (min)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {workHours.map((day, index) => {
                    const hours = calculateHours(day.in, day.out, day.breaks);
                    return (
                      <TableRow key={day.day} hover>
                        <TableCell sx={{ fontWeight: 600, width: '20%' }}>{day.day}</TableCell>
                        <TableCell sx={{ width: '20%' }}>
                          <TextField
                            value={day.in}
                            onChange={(e) => handleWorkHoursChange(index, 'in', e.target.value)}
                            size="small"
                            placeholder="600"
                            fullWidth
                            inputProps={{ 
                              style: { textAlign: 'center', padding: '8px' },
                              maxLength: 4
                            }}
                            sx={{ 
                              '@media print': { '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ width: '20%' }}>
                          <TextField
                            value={day.out}
                            onChange={(e) => handleWorkHoursChange(index, 'out', e.target.value)}
                            size="small"
                            placeholder="1430"
                            fullWidth
                            inputProps={{ 
                              style: { textAlign: 'center', padding: '8px' },
                              maxLength: 4
                            }}
                            sx={{ 
                              '@media print': { '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }
                            }}
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600, color: hours > 0 ? 'primary.main' : 'text.secondary', width: '20%' }}>
                          {hours.toFixed(2)} hrs
                        </TableCell>
                        <TableCell sx={{ width: '20%' }}>
                          <TextField
                            value={day.breaks}
                            onChange={(e) => handleWorkHoursChange(index, 'breaks', e.target.value)}
                            size="small"
                            placeholder="30"
                            fullWidth
                            inputProps={{ 
                              style: { textAlign: 'center', padding: '8px' },
                              maxLength: 3
                            }}
                            sx={{ 
                              '@media print': { '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow sx={{ backgroundColor: theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.16)' : '#e3f2fd', '& td': { fontWeight: 700, borderTop: `2px solid ${theme.palette.primary.main}` } }}>
                    <TableCell sx={{ width: '20%' }}>Total</TableCell>
                    <TableCell sx={{ width: '20%' }}></TableCell>
                    <TableCell sx={{ width: '20%' }}></TableCell>
                    <TableCell align="center" sx={{ color: 'primary.main', fontSize: '1.1rem', width: '20%' }}>
                      {totalHours.toFixed(2)} hrs
                    </TableCell>
                    <TableCell sx={{ width: '20%' }}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              {/* Total and Weighted Hours */}
              <Box sx={{ mt: 3, pt: 3, borderTop: '2px solid #e0e0e0' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="body1" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
                    Total Hours:
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main', fontSize: '1.2rem' }}>
                    {totalHours.toFixed(2)} hrs
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body1" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
                    Weighted Hours:
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#f57c00', fontSize: '1.2rem' }}>
                    {weightedHoursData.weighted.toFixed(2)} hrs
                  </Typography>
                </Box>
                {weightedHoursData.overtime > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'right' }}>
                    ({weightedHoursData.regular.toFixed(2)} reg + {weightedHoursData.overtime.toFixed(2)} OT × 1.5)
                  </Typography>
                )}
              </Box>
                </CardContent>
              </Card>

              {/* Travel Miles Section */}
              <Card sx={{ 
                flex: 1,
                boxShadow: 2,
                display: 'flex',
                flexDirection: 'column'
              }}>
                <CardContent sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <CarIcon sx={{ color: 'primary.main', fontSize: 28 }} />
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  Travel Miles
                </Typography>
              </Box>

              <Table size="small" sx={{ mb: 3, width: '100%' }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5' }}>
                    <TableCell sx={{ fontWeight: 700, width: '50%' }}>Day</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: '50%' }} align="right">Miles</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {travelMiles.map((day, index) => (
                    <TableRow key={day.day} hover>
                      <TableCell sx={{ fontWeight: 600, width: '50%' }}>{day.day}</TableCell>
                      <TableCell align="right" sx={{ width: '50%' }}>
                        <TextField
                          value={day.miles}
                          onChange={(e) => handleTravelMilesChange(index, e.target.value)}
                          size="small"
                          type="text"
                          placeholder="0"
                          fullWidth
                          inputProps={{ 
                            style: { textAlign: 'right', padding: '8px' },
                            inputMode: 'numeric',
                            pattern: '[0-9]*'
                          }}
                          sx={{ 
                            '& input[type=number]': {
                              MozAppearance: 'textfield',
                            },
                            '& input[type=number]::-webkit-outer-spin-button': {
                              WebkitAppearance: 'none',
                              margin: 0,
                            },
                            '& input[type=number]::-webkit-inner-spin-button': {
                              WebkitAppearance: 'none',
                              margin: 0,
                            },
                            '@media print': { '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ backgroundColor: theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.16)' : '#e3f2fd', '& td': { fontWeight: 700, borderTop: `2px solid ${theme.palette.primary.main}` } }}>
                    <TableCell sx={{ width: '50%' }}>Total</TableCell>
                    <TableCell align="right" sx={{ color: 'primary.main', fontSize: '1.1rem', width: '50%' }}>
                      {totalMiles.toFixed(0)} miles
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <Box sx={{ mt: 3 }}>
                <Paper sx={{ p: 2.5, backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.95rem' }}>
                      Price per mile
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      ${pricePerMile.toFixed(4)}
                    </Typography>
                  </Box>
                  <Divider sx={{ my: 1.5 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body1" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
                      Travel Cost
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main', fontSize: '1.2rem' }}>
                      ${travelCost.toFixed(2)}
                    </Typography>
                  </Box>
                </Paper>
              </Box>
                </CardContent>
              </Card>
            </Box>

            {/* Bottom Row: Receipts and Paycheck Summary */}
            <Box sx={{ 
              display: 'flex',
              flexDirection: { xs: 'column', lg: 'row' },
              gap: { xs: 2, sm: 3 },
              width: '100%'
            }}>
              {/* Receipts Section */}
              <Card sx={{ 
                flex: 1,
                boxShadow: 2,
                display: 'flex',
                flexDirection: 'column'
              }}>
                <CardContent sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ReceiptIcon sx={{ color: 'primary.main', fontSize: 28 }} />
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>
                    Receipts
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={handleAddReceipt}
                  sx={{ textTransform: 'none', '@media print': { display: 'none' } }}
                >
                  Add Receipt
                </Button>
              </Box>

              {receipts.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 5 }}>
                  <Typography variant="body2" color="text.secondary">
                    No receipts added. Click "Add Receipt" to add one.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  {receipts.map((receipt, index) => (
                    <Box key={index} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                      <TextField
                        label="Description"
                        value={receipt.description || ''}
                        onChange={(e) => handleReceiptsChange(index, 'description', e.target.value)}
                        size="small"
                        placeholder="Receipt description"
                        sx={{ flex: 1, '@media print': { '& .MuiOutlinedInput-notchedOutline': { border: 'none' } } }}
                      />
                      <TextField
                        label="Amount"
                        value={receipt.amount || ''}
                        onChange={(e) => handleReceiptsChange(index, 'amount', e.target.value)}
                        size="small"
                        type="number"
                        placeholder="0.00"
                        InputProps={{
                          startAdornment: <Typography sx={{ mr: 1, color: 'text.secondary' }}>$</Typography>
                        }}
                        sx={{ 
                          width: 150,
                          '@media print': { '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }
                        }}
                      />
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={() => handleRemoveReceipt(index)}
                        sx={{ 
                          minWidth: 'auto',
                          px: 1.5,
                          '@media print': { display: 'none' }
                        }}
                      >
                        Remove
                      </Button>
                    </Box>
                  ))}
                </Box>
              )}

              {receipts.length > 0 && (
                <Box sx={{ mt: 4 }}>
                  <Paper sx={{ p: 2.5, backgroundColor: '#f5f5f5', textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, fontSize: '0.95rem' }}>
                      Total Receipts
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main', fontSize: '1.2rem' }}>
                      ${totalReceipts.toFixed(2)}
                    </Typography>
                  </Paper>
                </Box>
              )}
                </CardContent>
              </Card>

              {/* Paycheck Summary */}
              <Card sx={{ 
                flex: 1,
                boxShadow: 3,
                backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f8f9fa',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <CardContent sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <PaycheckIcon sx={{ color: 'primary.main', fontSize: 28 }} />
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  Paycheck Summary
                </Typography>
              </Box>

              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, pb: 2, borderBottom: '1px solid #e0e0e0' }}>
                  <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.05rem' }}>
                    Pay Hours
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.2rem' }}>
                    ${payHours.toFixed(2)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, pb: 2, borderBottom: '1px solid #e0e0e0' }}>
                  <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.05rem' }}>
                    Travel Cost
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.2rem' }}>
                    ${travelCost.toFixed(2)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.05rem' }}>
                    Receipts
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.2rem' }}>
                    ${totalReceipts.toFixed(2)}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 3 }} />

              <Paper sx={{ p: 3.5, backgroundColor: '#1976d2', color: 'white', textAlign: 'center' }}>
                <Typography variant="body2" sx={{ mb: 1.5, opacity: 0.9, fontSize: '1rem' }}>
                  Overall Total
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 700, fontSize: '2rem' }}>
                  ${overallTotal.toFixed(2)}
                </Typography>
              </Paper>
                </CardContent>
              </Card>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Save Preset Dialog */}
      <Dialog open={saveDialogOpen} onClose={() => {
        setSaveDialogOpen(false);
        setPresetName('');
      }} maxWidth="sm" fullWidth>
        <DialogTitle>Save Current Hours as Preset</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Preset Name"
            fullWidth
            variant="outlined"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="e.g., Week 1 Schedule, Overtime Week"
            sx={{ mt: 2 }}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && presetName.trim()) {
                handleSavePreset();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setSaveDialogOpen(false);
            setPresetName('');
          }}>
            Cancel
          </Button>
          <Button 
            onClick={handleSavePreset} 
            variant="contained"
            disabled={!presetName.trim()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
    </>
  );
}

export default PayrollPage;
