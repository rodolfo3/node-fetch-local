const express = require('express');
const supertest = require('supertest');


const { fetch, init } = require('./fetch-node');


test('GET text request', async () => {
  const app = express();

  init(app);

  app.post('/ok', (req, res) => res.send('ERROR'));
  app.get('/ok', (req, res) => res.send('ok'));

  app.get('/test', async (req, res) => {
    const response = await fetch('/ok');
    const text = await response.text();
    res.send(text);
  });


  await supertest(app)
    .get('/test')
    .expect(200)
    .then(response => {
      expect(response.text).toBe('ok');
    });
});


test('GET json request', async () => {
  const app = express();

  init(app);

  app.get('/ok', (req, res) => res.json({ok: 1}));

  app.get('/test', async (req, res) => {
    const response = await fetch('/ok');
    const data = await response.json();
    res.json(data);
  });


  await supertest(app)
    .get('/test')
    .expect(200)
    .then(response => {
      expect(response.body.ok).toBe(1);
    });
});


test('GET json ok=false', async () => {
  const app = express();

  init(app);

  app.get('/ok', (req, res) => res.status(400).json({ok: 0}));

  app.get('/test', async (req, res) => {
    const response = await fetch('/ok');
    const data = await response.json();
    console.log({ response });
    res.json({ ok: response.ok, status: response.statusCode, data });
  });


  await supertest(app)
    .get('/test')
    .expect(200)
    .then(response => {
      expect(response.body.data).toEqual({ok: 0});
      expect(response.body.status).toBe(400);
      expect(response.body.ok).toBe(false);
    });
});


// TODO
// external request(google)
// query-string
// cookies (read) (req -> API)
// cookies (write) (API -> res)
//
