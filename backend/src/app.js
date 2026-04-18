require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { connectDB } = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/session', require('./routes/session.routes'));
app.use('/api/contacts', require('./routes/contacts.routes'));
app.use('/api/campaigns', require('./routes/campaigns.routes'));
app.use('/api/send', require('./routes/send.routes'));
app.use('/api/logs', require('./routes/logs.routes'));

app.set('io', io);

const PORT = process.env.PORT || 3001;

connectDB().then(() => {
  server.listen(PORT, () => console.log(`Backend running on :${PORT}`));
});

module.exports = { app, server, io };
