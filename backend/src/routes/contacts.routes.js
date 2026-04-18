const router = require('express').Router();
const Contact = require('../models/contact.model');

router.get('/', async (req, res) => {
  const filter = { active: true };
  if (req.query.tag) filter.tags = req.query.tag;
  const contacts = await Contact.find(filter).sort({ createdAt: -1 });
  res.json(contacts);
});

router.post('/', async (req, res) => {
  const contact = await new Contact(req.body).save();
  res.status(201).json(contact);
});

router.post('/import', async (req, res) => {
  const { contacts } = req.body;
  const docs = await Contact.insertMany(contacts, { ordered: false }).catch(e => e.insertedDocs || []);
  res.status(201).json({ imported: docs.length });
});

router.put('/:id', async (req, res) => {
  const contact = await Contact.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(contact);
});

router.delete('/:id', async (req, res) => {
  const contact = await Contact.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  res.json(contact);
});

module.exports = router;
