const nodeFetch = require('node-fetch');
const urlParser = require('url');
// const { createNamespace } = require('continuation-local-storage');
const { createNamespace } = require('cls-hooked');

const session = createNamespace('requests');


const getRouteLayer = (pathname, router) => {
  const [layer] = router.stack.filter(
    s => (
      s.route
      &&
      s.route.methods.get
      &&
      s.regexp.exec(pathname)
      &&
      s.route.stack.filter(i => i.method === 'get').length
    ),
  );

  if (!layer) {
    throw new Error(`GET not allowed for ${pathname}`);
  }

  return layer;
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

  const status = (statusCode) => ({
    send: (data) => resolve({
      statusCode,
      ok: statusCode < 400,
      text: () => Promise.resolve(data),
      json: () => Promise.resolve(JSON.parse(data)),
    }),
    json: (data) => resolve({
      statusCode,
      ok: statusCode < 400,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.sringify(data)),
    }),
  });

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


const isAllowedToCache = (url, params) => {
  const [{ method } = {}] = params;

  if (method && method !== 'GET') {
    return 0;
  }

  for (const i in ALLOWED_CACHE_REGEX) {
    const [re, ttl] = ALLOWED_CACHE_REGEX[i];
    if (re.test(url)) return ttl;
  }

  return 0;
};


const fetchAndCache = (url, ...params) => {
  const ttl = isAllowedToCache(url, params)
  if (ttl > 0) {
    const cached = getFromCache(url);
    if (cached) return cached;

    return nodeFetch(url, ...params).then(response => {
      setCache(url, ttl, response);
      return response;
    });
  }
  return nodeFetch(url, ...params);
};


const fetch = async (url, ...params) => {
  if (url.startsWith('http')) {
    return fetchAndCache(url, ...params);
  }

  return new Promise((resolve, reject) => {
    try {
      const parentReq = session.get('req');
      const parentRes = session.get('res');
      const app = session.get('app');

      const { pathname, query } = urlParser.parse(url, true);
      const handler = getHandler(pathname, app._router);

      const res = buildResponse(resolve, reject, parentReq, parentRes);
      const req = {
        _parentReq: parentReq,
        params: extractParamsFromUrl(pathname, app._router),
        cookies: parentReq.cookies,
        query,
        // TODO
      };

      handler(req, res);
    } catch(e) {
      reject(e);
    }
  });
};


const init = (app, { cache } = {}) => {
  CACHE = {};
  ALLOWED_CACHE_REGEX = cache || [];

  app.use((req, res, next) => {
    session.run(() => {
      session.set('req', req._parentReq || req);
      session.set('res', res._parentRes || res);
      session.set('app', app);
      next();
    })
  });
};


module.exports = { init, fetch };
