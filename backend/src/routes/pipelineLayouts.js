const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  listPipelineLayouts,
  createPipelineLayout,
  updatePipelineLayout,
  deletePipelineLayout,
} = require('../controllers/pipelineLayoutController');

router.use(requireAuth);

router.get('/', listPipelineLayouts);
router.post('/', createPipelineLayout);
router.patch('/:id', updatePipelineLayout);
router.delete('/:id', deletePipelineLayout);

module.exports = router;
