const { Schema, model } = require('mongoose');

const campaignSchema = new Schema({
  name: { type: String, required: true },
  text: { type: String, required: true },
  imagePath: String,
}, { timestamps: true });

module.exports = model('Campaign', campaignSchema);
