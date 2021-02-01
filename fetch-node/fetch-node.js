const nodeFetch = require('node-fetch');
const urlParser = require('url');
const http = require('http');
// const { createNamespace } = require('continuation-local-storage');
const { createNamespace } = require('cls-hooked');

const session = createNamespace('requests');


const parseRes = (res) => {
  if (res.output) {
    const [headers, body] = res.output;
    return {
      headers,
      body: body.toString(),
    };
  }

  if (res.outputData) {
      const [headers, body] = res.outputData;
      return {
        headers: headers.data.toString(headers.encoding),
        body: body.data.toString(body.encoding),
      };
  }
};


const getRouteLayer = (pathname, router) => {
  const layers = router.stack.filter(
    s => (
      s.regexp.exec(pathname)
      &&
      (
        typeof s.route === 'undefined'
        ||
        s.route.stack.filter(i => i.method === 'get').length
      )
    ),
  );

  if (layers.length != 1) {
    throw new Error(`GET not allowed for ${pathname}: ${layers.length}`);
  }

  return layers[0];
};

const getHandler = (pathname, router) => {
  const layer = getRouteLayer(pathname, router);
  const [stack] = layer.route.stack.filter(i => i.method === 'get');
  const { handle } = stack;
  return handle;
};


const extractParamsFromUrl = (pathname, router) => {
  const { regexp, keys } = getRouteLayer(pathname, router);
  const data = regexp.exec(pathname);
  return keys.map(
    ({ name }, idx) => ({[name]: data[idx + 1]})
  ).reduce((i, j) => ({...i, ...j}), {});
};


const buildResponse = (resolve, reject, parentReq, parentRes) => {

  const status = (statusCode) => {
    const send = (data) => resolve({
      statusCode,
      ok: statusCode < 400,
      text: () => Promise.resolve(data),
      json: () => Promise.resolve(JSON.parse(data)),
      headers: new nodeFetch.Headers(),
    });
    return ({
      end: send,
      send,
      json: (data) => resolve({
        statusCode,
        ok: statusCode < 400,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(JSON.sringify(data)),
        headers: new nodeFetch.Headers({
          'content-type': 'application/json',
        }),
      }),
    });
  };

  return {
    status,
    send: status(200).send,
    json: status(200).json,
    cookie: (name, value, ...args) => {
      parentReq.cookies[name] = value;
      parentRes.cookie(name, value, ...args);
    },

    _parentRes: parentRes,
  }
};


let CACHE = {};
let ALLOWED_CACHE_REGEX = [];


const cacheCleanup = () => {
  const now = Date.now();
  Object.keys(CACHE).forEach((k) => {
    const cached = CACHE[k];
    if (cached.validUntil < now) {
      delete CACHE[k];
    }
  });
};


const getFromCache = (url) => {
  const cached = CACHE[url];
  if (cached && cached.validUntil > Date.now()) {
    return cached.data.clone();
  }
  setTimeout(cacheCleanup, 0);
  return null;
};


const setCache = (url, ttl, response) => {
  CACHE[url] = {
    data: response.clone(),
    validUntil: Date.now() + ttl,
  };
};


const isAllowedToCache = (url, props = {}) => {
  const { method } = props;

  if (method && method !== 'GET') {
    return 0;
  }

  for (const i in ALLOWED_CACHE_REGEX) {
    const [re, ttl] = ALLOWED_CACHE_REGEX[i];
    if (re.test(url)) return ttl;
  }

  return 0;
};


const fetchAndCache = (url, props) => {
  const ttl = isAllowedToCache(url, props)

  // if (Object.keys(props.headers).length < 1) {
  //   props.headers = null;
  // }

  if (ttl > 0) {
    const cached = getFromCache(url);
    if (cached) return cached;

    return nodeFetch.default(url, props).then(response => {
      setCache(url, ttl, response);
      return response;
    });
  }

  return nodeFetch.default(url, props);
};


const raiseIfUndefinedPropHandler = (name) => ({
  get: (obj, prop) => {
    const value = obj[prop];

    if (typeof value === 'undefined') {
      throw new Error(`Object ${name} does not have the property "${prop}"`);
    }

    return value;
  },
});


const buildFetch = ({ app, router = app._router, restrictAttrs }) => {

  const wrapRes = restrictAttrs ? (
    res => new Proxy(res, raiseIfUndefinedPropHandler('res'))
  ) : res => res;

  const fetch = async (url, init) => {
    if (url.startsWith('http')) {
      return fetchAndCache(url, init);
    }

    if (init && init.headers && typeof init.headers !== 'object') {
      throw new Error(`Headers should be an object (it is ${typeof init.headers})`);
    }

    return new Promise((resolve, reject) => {
      try {
        const parentReq = session.get('req');
        const parentRes = session.get('res');

        const req = Object.create(app.request, {
          _parentReq: { value: parentReq },
          url: { value: url, writable: true },
          method: { value: 'GET' },
          cookies: { value: parentReq.cookies },
          headers: {
            value: {
              'cookies': parentReq.headers.cookies
            },
          },
        });

        const res = new http.ServerResponse(req);

        const cb = (...args) => {
          const output = res.outputData || res.output;
          const { headers, body } = parseRes(res);

          setCookies = headers.split('\r\n').filter(i => i.startsWith('Set-Cookie:'));
          setCookies.forEach(
            header => {
              const [k, v] = header.split(': ');
              parentRes.append(k, v);
              // make available to subsequent requests
              // TODO use cookie-parser?
              const [name, value] = v.split(';')[0].split('=');
              parentReq.cookies[name] = value;
            }
          );

          resolve({
            status: res.status,
            statusCode: res.statusCode,
            ok: res.statusCode < 400, // why there is no res.ok?
            text: async () => body,
            json: async () => JSON.parse(body),
          });
        };

        req.res = res;
        res.req = req;
        app.handle(req, res, cb);

        // This will work on express 5 (that calls the `next()` automatically
        req.next(); // is this required?
      } catch(e) {
        reject(e);
      }
    });
  };

  return fetch;
};


const perAppFetch = (...args) => {
  const { app } = session.get('req');
  return app.fetch(...args);
};


const init = (app, { router, cache, restrictAttrs = false } = {}) => {
  CACHE = {};
  ALLOWED_CACHE_REGEX = cache || [];

  app.use((req, res, next) => {
    session.run(() => {
      session.set('req', req._parentReq || req);
      session.set('res', res._parentRes || res);
      next();
    })
  });

  app.fetch = buildFetch({ app, router, restrictAttrs });
  global.fetch = perAppFetch;

  return app;
};


module.exports = {
  init,
  remove: () => delete global.fetch,
};
