const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  completeAppointment,
  cancelAppointment,
  getCompletedAppointments,
  deleteAppointment
} = require('../controllers/appointmentController');

//router.use(requireAuth);

router.get('/', getAppointments);
router.get('/completed', getCompletedAppointments);
router.post('/', createAppointment);
router.get('/:id', getAppointment);
router.patch('/:id', updateAppointment);
router.post('/:id/complete', completeAppointment);
router.post('/:id/cancel', cancelAppointment);
router.delete('/:id', deleteAppointment);

module.exports = router;

