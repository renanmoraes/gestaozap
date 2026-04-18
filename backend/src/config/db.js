const mongoose = require('mongoose');

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/wa-invites');
  console.log('MongoDB connected');
}

module.exports = { connectDB };
