const { Schema, model } = require('mongoose');

const logSchema = new Schema({
  campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
  phone: { type: String, required: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  sentAt: Date,
  error: String,
}, { timestamps: true });

module.exports = model('Log', logSchema);
