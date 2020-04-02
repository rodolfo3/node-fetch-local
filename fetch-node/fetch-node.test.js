const express = require('express');
const supertest = require('supertest');
const nock = require('nock');


const { init, remove } = require('./fetch-node');


afterEach(() => {
  remove();
});

describe('internal app requests', () => {
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
});


describe('external requests', () => {
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
});


describe('cookie support', () => {
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
});


describe('cached requests', () => {
  beforeEach(() => {
    nock('https://api.github.com')
      .get('/users/rodolfo3')
      .reply(200, {ok: 1});

    nock('https://api.github.com')
      .get('/users/rodolfo3')
      .reply(200, {ok: 2});

    nock('https://api.github.com')
      .post('/users/rodolfo3')
      .reply(200, {ok: 3});

    nock('https://api.github.com')
      .post('/users/rodolfo3')
      .reply(200, {ok: 4});
  });

  test('GET cache requests respects TTL', async () => {
    const app = express();
    init(
      app,
      {
        cache: [
          [
            new RegExp('^https://api.github.com/'), 1000 * 1, // 1 second
          ]
        ],
      }
    )

    app.get('/test', async (req, res) => {
      const response = await fetch('https://api.github.com/users/rodolfo3');
      const data = await response.text();

      setTimeout(async () => {
        const response2 = await fetch('https://api.github.com/users/rodolfo3');
        const data2 = await response2.text();

        res.send(data2);
      }, 1500); // 1.5 seconds
    });

    await supertest(app)
      .get('/test')
      .expect(200)
      .then(response => {
        expect(response.text).toEqual('{"ok":2}');
      });
  });

  test('GET cache requests only once', async () => {
    const app = express();
    init(
      app,
      {
        cache: [
          [
            new RegExp('^https://api.github.com/'), 1000 * 2, // 2 seconds
          ]
        ],
      }
    )

    app.get('/test', async (req, res) => {
      const response1 = await fetch('https://api.github.com/users/rodolfo3');
      const data1 = await response1.json();

      const response2 = await fetch('https://api.github.com/users/rodolfo3');
      const data2 = await response2.json();

      res.send([data1, data2]);
    });

    await supertest(app)
      .get('/test')
      .expect(200)
      .then(response => {
        expect(response.text).toEqual('[{"ok":1},{"ok":1}]');
      });
  });

  test('POST never caches', async () => {
    const app = express();
    init(
      app,
      {
        cache: [
          [
            new RegExp('^https://api.github.com/'), 1000 * 2, // 2 seconds
          ]
        ],
      }
    )

    app.get('/test', async (req, res) => {
      const response1 = await fetch('https://api.github.com/users/rodolfo3', { method: 'POST' });
      const data1 = await response1.json();

      const response2 = await fetch('https://api.github.com/users/rodolfo3', { method: 'POST' });
      const data2 = await response2.json();

      res.send([data1, data2]);
    });

    await supertest(app)
      .get('/test')
      .expect(200)
      .then(response => {
        expect(response.text).toEqual('[{"ok":3},{"ok":4}]');
      });
  });

  test('GET cache requests only once even if requested in paralell', async () => {
    nock.cleanAll();

    nock('https://api.github.com')
      .get('/users/rodolfo3')
      .reply((uri, requestBody, cb) => {
        setTimeout(
          () => cb(null, [200, {ok: 1}]),
          1000
        );
      });

    nock('https://api.github.com')
      .get('/users/rodolfo3')
      .reply(200, {ok: 2});

    const app = express();
    init(
      app,
      {
        cache: [
          [
            new RegExp('^https://api.github.com/'), 1000 * 2, // 2 seconds
          ]
        ],
      }
    )

    app.get('/test', async (req, res) => {
      const request1 = fetch('https://api.github.com/users/rodolfo3');
      const request2 = fetch('https://api.github.com/users/rodolfo3');

      const response1 = await request1;
      const response2 = await request2;

      const data1 = await response1.json();
      const data2 = await response2.json();

      res.send([data1, data2]);
    });

    await supertest(app)
      .get('/test')
      .expect(200)
      .then(response => {
        expect(response.text).toEqual('[{"ok":1},{"ok":1}]');
      });
  });

});


describe('using middlewares', () => {
  test('GET througth async middleware', async () => {
    const app = express();

    init(app);

    app.use(
      '*',
      (req, res, next) => {
        Promise.resolve().finally(() => next());
      },
    );
    app.get('/ok', (req, res) => res.send('from-view'));

    app.get('/test', async (req, res) => {
      const response = await fetch('/ok');
      const text = await response.text();
      res.send(text);
    });

    await supertest(app)
      .get('/test')
      .expect(200)
      .then(response => {
        expect(response.text).toBe('from-view');
      });
  });

  test('GET response from middleware', async () => {
    const app = express();

    init(app);

    app.use(
      '*',
      (req, res, next) => {
        res.send('middleware!');
      },
    );
    app.get('/ok', (req, res) => res.send('from-view'));

    app.get('/test', async (req, res) => {
      const response = await fetch('/ok');
      const text = await response.text();
      res.send(text);
    });

    await supertest(app)
      .get('/test')
      .expect(200)
      .then(response => {
        expect(response.text).toBe('middleware!');
      });
  });
});

describe('raise if access undefined property', () => {
  test('on req', async () => {
    const app = express();

    init(app, { restrictAttrs: true });

    app.get('/ok', (req, res) => {
      const b = req.nonExistant;
      res.json({ prop: true });
    })

    app.get('/test', async (req, res) => {
      try {
        await fetch('/ok');
        res.send('message from view');
      } catch({ message }) {
        res.send(message);
      }
    });

    await supertest(app)
      .get('/test')
      .expect(200)
      .then(response => {
        expect(response.text).toBe('Object req does not have the property "nonExistant"');
      });
  });

  test('on res', async () => {
    const app = express();

    init(app, { restrictAttrs: true });

    app.get('/ok', (req, res) => {
      const b = res.nonExistant;
      res.json({ prop: true });
    })

    app.get('/test', async (req, res) => {
      try {
        await fetch('/ok');
        res.send('message from view');
      } catch({ message }) {
        res.send(message);
      }
    });

    await supertest(app)
      .get('/test')
      .expect(200)
      .then(response => {
        expect(response.text).toBe('Object res does not have the property "nonExistant"');
      });
  });
});

// TODO check `headers` to be an object (not a function)

// TODO allow res.status(500).end('Internal server error')

// TODO allow read "headers" from response (headers.get("something"))
//
// TODO handler app.use(router);
