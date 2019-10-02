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


test('GET with set cookies', async () => {
  const app = express();

  const cookieParser = require('cookie-parser');

  init(app);

  app.use(cookieParser());

  app.get('/ok', (req, res) => {
    res.cookie('i', '42', { domain: 'local.com', path: '/' });
    res.send('ok');
  });

  app.get('/test', async (req, res) => {
    const response = await fetch('/ok');
    const data = await response.text();
    res.json(data);
  });

  await supertest(app)
    .get('/test')
    .expect(200)
    .expect('set-cookie', 'i=42; Domain=local.com; Path=/');
});


test('multiple GET pass throuth cookies (promises)', async () => {
  const app = express();

  const cookieParser = require('cookie-parser');

  init(app);

  app.use(cookieParser());

  app.get('/step1', (req, res) => {
    res.cookie('j', '21', { domain: 'local.com', path: '/' });
    res.send('ok');
  });

  app.get('/step2', (req, res) => {
    res.cookie('j', parseInt(req.cookies.j) * 2, { domain: 'local.com', path: '/' });
    res.send('ok');
  });

  app.get('/test', async (req, res) => {
    return fetch('/step1').then(() => {
      fetch('/step2').then((response) => {
        response.text().then(data => res.json(data));
      });
    });
  });

  const bothCookies = [
    'j=21; Domain=local.com; Path=/',
    'j=42; Domain=local.com; Path=/'
  ].join(',');

  await supertest(app)
    .get('/test')
    .expect(200)
    .expect('set-cookie', bothCookies);
});


test('multiple GET pass throuth cookies (async/await)', async () => {
  const app = express();

  const cookieParser = require('cookie-parser');

  init(app);

  app.use(cookieParser());

  app.get('/step1', (req, res) => {
    res.cookie('i', '21', { domain: 'local.com', path: '/' });
    res.send('ok');
  });

  app.get('/step2', (req, res) => {
    res.cookie('i', parseInt(req.cookies.i) * 2, { domain: 'local.com', path: '/' });
    res.send('ok');
  });

  app.get('/test', async (req, res) => {
    await fetch('/step1');
    const response = await fetch('/step2');

    res.send(await response.text());
  });

  const bothCookies = [
    'i=21; Domain=local.com; Path=/',
    'i=42; Domain=local.com; Path=/'
  ].join(',');

  await supertest(app)
    .get('/test')
    .expect(200)
    .expect('set-cookie', bothCookies);
});


test('options parameters on route', async () => {
  const app = express();

  const cookieParser = require('cookie-parser');

  init(app);

  app.use(cookieParser());

  app.get('/ok/:id?', (req, res) => {
    res.json(req.params.id || 'NOT SET');
  });

  app.get('/test', async (req, res) => {
    const notSet = (await (await fetch('/ok')).json())
    const set = (await (await fetch('/ok/42')).json())
    res.json({ set, notSet });
  });

  await supertest(app)
    .get('/test')
    .expect(200)
    .then(response => {
      expect(response.body.notSet).toBe('NOT SET');
      expect(response.body.set).toBe('42');
    });
});


// TODO raise if access undefined prop
