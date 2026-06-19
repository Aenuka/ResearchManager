const express = require('express');
const {
  addResource,
  createSection,
  deleteResource,
  deleteSection,
  getSections,
  updateResource,
} = require('../controllers/sectionController');
const upload = require('../middleware/upload');

const router = express.Router();

router.get('/', getSections);
router.post('/', createSection);
router.delete('/:sectionId', deleteSection);
router.post(
  '/:sectionId/resources',
  upload.fields([
    { name: 'pdf', maxCount: 1 },
    { name: 'pdfs', maxCount: 10 },
    { name: 'audio', maxCount: 1 },
    { name: 'audios', maxCount: 10 },
    { name: 'image', maxCount: 1 },
    { name: 'images', maxCount: 10 },
  ]),
  addResource
);
router.put(
  '/:sectionId/resources/:resourceId',
  upload.fields([
    { name: 'pdf', maxCount: 1 },
    { name: 'pdfs', maxCount: 10 },
    { name: 'audio', maxCount: 1 },
    { name: 'audios', maxCount: 10 },
    { name: 'image', maxCount: 1 },
    { name: 'images', maxCount: 10 },
  ]),
  updateResource
);
router.delete('/:sectionId/resources/:resourceId', deleteResource);

module.exports = router;
