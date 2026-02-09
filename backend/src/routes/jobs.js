const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getJobs,
  getJob,
  createJob,
  updateJob,
  moveJobStage,
  deleteJob,
  getPipelineSummary,
  getDeadEstimates,
  getArchivedJobs,
  getCompletedJobs,
  moveToDeadEstimates,
  autoMoveDeadEstimates,
  archiveJob,
  unarchiveJob
} = require('../controllers/jobController');

//router.use(requireAuth);

router.get('/', getJobs);
router.post('/', createJob);
router.get('/pipeline/summary', getPipelineSummary);
router.get('/dead-estimates', getDeadEstimates); // Backward compatibility
router.get('/archive', getArchivedJobs);
router.get('/completed', getCompletedJobs);
router.get('/dead-estimates/debug', require('../controllers/jobController').debugDeadEstimates);
router.post('/dead-estimates/auto-move', autoMoveDeadEstimates);
router.post('/:id/move-to-dead-estimates', moveToDeadEstimates);
router.post('/:id/archive', archiveJob);
router.post('/:id/unarchive', unarchiveJob);
router.get('/:id', getJob);
router.patch('/:id', updateJob);
router.post('/:id/move-stage', moveJobStage);
router.delete('/:id', deleteJob);

module.exports = router;
