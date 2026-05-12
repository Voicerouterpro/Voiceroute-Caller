// server.js — MEDUSA IVR System
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const store = require('./config/store');

const ivrRoutes = require('./routes/ivr');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/ivr', ivrRoutes);
app.use('/api', apiRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Boot
(async () => {
  await store.seedSuperAdmin();
  app.listen(PORT, () => {
    console.log(`
███╗   ███╗███████╗██████╗ ██╗   ██╗███████╗ █████╗
████╗ ████║██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗
██╔████╔██║█████╗  ██║  ██║██║   ██║███████╗███████║
██║╚██╔╝██║██╔══╝  ██║  ██║██║   ██║╚════██║██╔══██║
██║ ╚═╝ ██║███████╗██████╔╝╚██████╔╝███████║██║  ██║
╚═╝     ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝╚═╝  ╚═╝

  IVR System v1.0  |  http://localhost:${PORT}
  SignalWire Webhook → POST /ivr/welcome
    `);
  });
})();

module.exports = app;
