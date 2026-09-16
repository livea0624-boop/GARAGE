const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    app: 'GARAGE',
    port: PORT
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('================================');
  console.log('GARAGE SERVER STARTED');
  console.log('PORT:', PORT);
  console.log('================================');
});
