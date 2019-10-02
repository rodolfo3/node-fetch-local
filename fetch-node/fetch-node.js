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


const fetch = async (url, ...params) => {
  if (url.startsWith('http')) {
    return nodeFetch(url, ...params);
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


const init = (app) => {
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
