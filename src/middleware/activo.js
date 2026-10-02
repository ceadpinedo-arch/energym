import { prisma } from '../prisma.js';

const MSG = 'El servicio de este gimnasio est\u00e1 suspendido. Comunicate con el gimnasio.';
const cache = new Map();

export function limpiarCache() {
  cache.clear();
}

function claims(req) {
  const h = String(req.headers.authorization || '');
  if (h.indexOf('Bearer ') !== 0) return null;
  const partes = h.slice(7).split('.');
  if (partes.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
}

async function estaActivo(gimnasioId) {
  const c = cache.get(gimnasioId);
  if (c && Date.now() - c.t < 15000) return c.activo;
  const g = await prisma.gimnasio.findUnique({ where: { id: gimnasioId }, select: { activo: true } });
  const activo = !g || g.activo !== false;
  cache.set(gimnasioId, { activo, t: Date.now() });
  return activo;
}

export async function verificarActivo(req, res, next) {
  try {
    let gimnasioId = null;
    const c = claims(req);
    if (c) {
      gimnasioId = c.gimnasioId || null;
      if (!gimnasioId && c.id) {
        const u = await prisma.usuario.findUnique({ where: { id: c.id }, select: { gimnasioId: true } });
        gimnasioId = u ? u.gimnasioId : null;
      }
    } else if (req.method === 'POST' && req.body && req.body.dni) {
      const u = await prisma.usuario.findUnique({ where: { dni: String(req.body.dni) }, select: { gimnasioId: true } });
      gimnasioId = u ? u.gimnasioId : null;
    }
    if (gimnasioId && !(await estaActivo(gimnasioId))) {
      if (req.path.endsWith('/checkin')) return res.json({ permitido: false, motivo: MSG });
      return res.status(403).json({ error: MSG, suspendido: true });
    }
    next();
  } catch (e) {
    next();
  }
}
