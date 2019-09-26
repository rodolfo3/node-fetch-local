const { createNamespace } = require('continuation-local-storage');

const session = createNamespace('requests');


const getHandler = (pathname, router) => {
  const [layer] = router.stack.filter(
    s => (
      s.route
      &&
      s.route.methods.get
      &&
      s.regexp.exec(pathname)
    ),
  );

  if (!layer) {
    throw new Error(`GET not allowed for ${url}`);
  }

  const [{ handle }] = layer.route.stack.filter(i => i.method === 'get');

  return handle;
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
  const handler = getHandler(url, app._router);

  return new Promise((resolve, reject) => {
    const res = buildResponse(resolve, reject);
    const req = {
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
