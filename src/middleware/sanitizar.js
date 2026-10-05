const SECRETAS = ['kioscoToken', 'mpAccessToken', 'mpRefreshToken'];

function limpiar(v) {
  if (Array.isArray(v)) return v.map(limpiar);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = {};
    Object.keys(v).forEach((k) => {
      if (SECRETAS.indexOf(k) < 0) o[k] = limpiar(v[k]);
    });
    return o;
  }
  return v;
}

export function sanitizar(req, res, next) {
  const original = res.json.bind(res);
  res.json = (cuerpo) => original(limpiar(cuerpo));
  next();
}
