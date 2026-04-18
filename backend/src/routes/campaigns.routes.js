const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const Campaign = require('../models/campaign.model');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

router.get('/', async (req, res) => {
  const campaigns = await Campaign.find().sort({ createdAt: -1 });
  res.json(campaigns);
});

router.post('/', upload.single('image'), async (req, res) => {
  const data = { ...req.body };
  if (req.file) data.imagePath = `uploads/${req.file.filename}`;
  const campaign = await new Campaign(data).save();
  res.status(201).json(campaign);
});

router.put('/:id', upload.single('image'), async (req, res) => {
  const data = { ...req.body };
  if (req.file) data.imagePath = `uploads/${req.file.filename}`;
  const campaign = await Campaign.findByIdAndUpdate(req.params.id, data, { new: true });
  res.json(campaign);
});

router.delete('/:id', async (req, res) => {
  await Campaign.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
});

module.exports = router;
