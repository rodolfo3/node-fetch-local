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


test('GET query params', async () => {
  const app = express();

  init(app);

  app.get('/ok', (req, res) => res.json(req.query));

  app.get('/test', async (req, res) => {
    const response = await fetch('/ok?page=2&limit=3');
    const data = await response.json();
    res.json(data);
  });


  await supertest(app)
    .get('/test')
    .expect(200)
    .then(response => {
      expect(response.body.page).toBe("2");
      expect(response.body.limit).toBe("3");
    });
});


test('GET data from URL', async () => {
  const app = express();

  init(app);

  app.get('/ok/:page/:limit', (req, res) => res.json(req.params));

  app.get('/test', async (req, res) => {
    const response = await fetch('/ok/2/3');
    const data = await response.json();
    res.json(data);
  });


  await supertest(app)
    .get('/test')
    .expect(200)
    .then(response => {
      expect(response.body.page).toBe("2");
      expect(response.body.limit).toBe("3");
    });
});

test('GET external request', async () => {
  const app = express();

  init(app);

  app.get('/test', async (req, res) => {
    const response = await fetch('https://google.com');
    const data = await response.text();
    res.send(data);
  });


  await supertest(app)
    .get('/test')
    .expect(200)
    .then(response => {
      expect(response.text).toEqual(expect.stringContaining('<title>Google</title>'))
    });
});


test('GET send with cookies', async () => {
  const app = express();

  const cookieParser = require('cookie-parser');

  init(app);

  app.use(cookieParser());

  app.get('/ok', (req, res) => res.json(req.cookies));

  app.get('/test', async (req, res) => {
    const response = await fetch('/ok');
    const data = await response.json();
    res.json(data);
  });

  await supertest(app)
    .get('/test')
    .set('Cookie', ['value=1'])
    .expect(200)
    .then(response => {
      expect(response.body.value).toEqual("1")
    });
});


// TODO
// cookies (write) (API -> res)
// cookies (read & write in sequence)
// optional params in URL
