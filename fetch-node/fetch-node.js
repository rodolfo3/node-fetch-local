const urlParser = require('url');
const { createNamespace } = require('continuation-local-storage');

const session = createNamespace('requests');


const getRouteLayer = (pathname, router) => {

  console.log('>>', router.stack.filter(
    s => (
      s.route
    )
  ));

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


const buildResponse = (resolve) => {

  const status = (statusCode) => ({
    send: (data) => resolve({
      statusCode,
      ok: statusCode < 400,
      text: () => Promise.resolve(data),
    }),
    json: (data) => resolve({
      statusCode,
      ok: statusCode < 400,
      json: () => Promise.resolve(data),
    }),
  });

  return {
    status,
    send: status(200).send,
    json: status(200).json,
  }
};


const fetch = async (url) => {
  const app = session.get('app');
  const { pathname, query } = urlParser.parse(url, true);
  const handler = getHandler(pathname, app._router);

  return new Promise((resolve, reject) => {
    const res = buildResponse(resolve, reject);
    const req = {
      params: extractParamsFromUrl(pathname, app._router),
      query,
      // TODO
    };

    handler(req, res);
  });
};


const init = (app) => {
  app.use((req, res, next) => {
    session.run(() => {
      session.set('app', app);
      next();
    })
  });
};


module.exports = { init, fetch };
