const express = require('express');

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.send('GARAGE cloud работает!');
});

app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    app: 'GARAGE cloud test'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('GARAGE running ' + PORT);
});
