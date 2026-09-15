const express = require('express');
const path = require('path');

const app = express();

// Abasthan сам передает порт через переменную PORT
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Отдаём файлы из текущей папки
app.use(express.static(__dirname));

// Главная проверка
app.get('/', (req, res) => {
  res.send('GARAGE cloud работает!');
});

// Проверка API
app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    app: 'GARAGE cloud test',
    port: PORT
  });
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
  console.log('================================');
  console.log('GARAGE SERVER STARTED');
  console.log('PORT:', PORT);
  console.log('================================');
});
