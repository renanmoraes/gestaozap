const { Schema, model } = require('mongoose');

const contactSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  tags: [String],
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = model('Contact', contactSchema);
