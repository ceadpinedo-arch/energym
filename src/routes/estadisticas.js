import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const uid = (req) => req.usuario.id ?? req.usuario.sub ?? req.usuario.usuarioId;

const MODELO = process.env.GEMINI_MODEL_PANEL || 'gemini-3.5-flash-lite';
const LIMITE_DIARIO = 30;
const usos = new Map();

// === CALCULO ===
const DIA_MS = 24 * 3600 * 1000;
const FRANJAS = [['0 a 6', 0, 6], ['6 a 9', 6, 9], ['9 a 12', 9, 12], ['12 a 15', 12, 15], ['15 a 18', 15, 18], ['18 a 21', 18, 21], ['21 a 24', 21, 24]];
const NOMBRES_DIA = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

// Argentina no usa horario de verano: UTC-3 fijo.
const local = (d) => new Date(d.getTime() - 3 * 3600 * 1000);
const mesKey = (d) => local(d).toISOString().slice(0, 7);

function ultimosMeses(n, ahora) {
  const l = local(ahora);
  let y = l.getUTCFullYear();
  let m = l.getUTCMonth();
  const out = [];
  for (let i = 0; i < n; i++) {
    out.unshift(y + '-' + String(m + 1).padStart(2, '0'));
    m--;
    if (m < 0) { m = 11; y--; }
  }
  return out;
}

const variacion = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

function construirEstadisticas({ socios, asistencias, pagos, gimnasio, gastosFijos, ahora }) {
  const meses = ultimosMeses(12, ahora);
  const idx = {};
  meses.forEach((m, i) => { idx[m] = i; });
  const filas = meses.map((m) => ({ mes: m, altas: 0, activos: 0, visitas: 0, ingresos: 0, pagos: 0 }));
  const activosSet = meses.map(() => new Set());

  for (const s of socios) {
    const k = mesKey(s.creadoEn);
    if (k in idx) filas[idx[k]].altas++;
  }

  const ultima = {};
  const porDia = [0, 0, 0, 0, 0, 0, 0];
  const porFranja = FRANJAS.map(() => 0);
  const corte90 = ahora.getTime() - 90 * DIA_MS;
  for (const a of asistencias) {
    const k = mesKey(a.creadoEn);
    if (k in idx) {
      filas[idx[k]].visitas++;
      activosSet[idx[k]].add(a.usuarioId);
    }
    const t = a.creadoEn.getTime();
    if (!ultima[a.usuarioId] || t > ultima[a.usuarioId]) ultima[a.usuarioId] = t;
    if (t >= corte90) {
      const l = local(a.creadoEn);
      porDia[(l.getUTCDay() + 6) % 7]++;
      const h = l.getUTCHours();
      const f = FRANJAS.findIndex((fr) => h >= fr[1] && h < fr[2]);
      if (f >= 0) porFranja[f]++;
    }
  }
  filas.forEach((f, i) => { f.activos = activosSet[i].size; });

  let total90 = 0;
  let n90 = 0;
  for (const p of pagos) {
    const k = mesKey(p.pagadoEn);
    if (k in idx) {
      filas[idx[k]].ingresos += p.monto;
      filas[idx[k]].pagos++;
    }
    if (p.pagadoEn.getTime() >= corte90) { total90 += p.monto; n90++; }
  }

  const sinVisita = (dias) => {
    const corte = ahora.getTime() - dias * DIA_MS;
    return socios.filter((s) => s.creadoEn.getTime() < corte && !(ultima[s.id] && ultima[s.id] >= corte)).length;
  };

  const conteoPlanes = {};
  for (const s of socios) {
    const nombre = s.plan && s.plan.nombre ? s.plan.nombre : 'Sin plan';
    if (!conteoPlanes[nombre]) conteoPlanes[nombre] = { plan: nombre, socios: 0, precio: s.plan ? s.plan.precio : null };
    conteoPlanes[nombre].socios++;
  }

  const actual = filas[filas.length - 1];
  const anterior = filas[filas.length - 2];
  const l = local(ahora);
  const diaDelMes = l.getUTCDate();
  const diasDelMes = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + 1, 0)).getUTCDate();

  const ticket = n90 ? total90 / n90 : (gimnasio && gimnasio.cuota) || 0;
  const gastos = Number(gastosFijos) || 0;
  let balance = null;
  if (gastos > 0) {
    balance = {
      gastosFijosMensuales: Math.round(gastos),
      ingresosMesAnterior: Math.round(anterior.ingresos),
      balanceMesAnterior: Math.round(anterior.ingresos - gastos),
      margenMesAnteriorPct: anterior.ingresos > 0 ? Math.round(((anterior.ingresos - gastos) / anterior.ingresos) * 100) : null,
      ingresosMesActual: Math.round(actual.ingresos),
      balanceMesActual: Math.round(actual.ingresos - gastos),
      pagosNecesariosPorMesParaEquilibrio: ticket > 0 ? Math.ceil(gastos / ticket) : null,
    };
  }

  const total = socios.length;
  const al = socios.filter((s) => s.estadoPago === 'AL_DIA').length;
  const ven = socios.filter((s) => s.estadoPago === 'VENCIDO').length;
  const sv14 = sinVisita(14);
  const sv30 = sinVisita(30);

  return {
    gimnasio: gimnasio ? gimnasio.nombre : '',
    cuotaBase: gimnasio ? gimnasio.cuota : null,
    hoy: { diaDelMes, diasDelMes },
    socios: { total, alDia: al, vencidos: ven, sinVenir14dias: sv14, sinVenir30dias: sv30, tasaActividad30dias: total ? Math.round(((total - sv30) / total) * 100) : null },
    meses: filas,
    mesActualVsAnterior: {
      ingresosPct: variacion(actual.ingresos, anterior.ingresos),
      visitasPct: variacion(actual.visitas, anterior.visitas),
      sociosActivosPct: variacion(actual.activos, anterior.activos),
      altas: { actual: actual.altas, anterior: anterior.altas },
    },
    ticketPromedioPago90dias: Math.round(ticket),
    visitasPorDiaSemana90dias: NOMBRES_DIA.map((n, i) => ({ dia: n, visitas: porDia[i] })),
    visitasPorFranja90dias: FRANJAS.map((fr, i) => ({ franja: fr[0] + ' hs', visitas: porFranja[i] })),
    planes: Object.values(conteoPlanes).sort((a, b) => b.socios - a.socios),
    balance,
    notas: [
      'El mes en curso esta incompleto (dia ' + diaDelMes + ' de ' + diasDelMes + '); comparar con el anterior con cuidado.',
      'Los ingresos se cuentan en el mes en que se registro el pago, sin repartir planes de varios meses.',
      'No hay registro de bajas: la fuga se estima con socios que dejaron de venir.',
      'Horarios en hora de Argentina, ultimos 90 dias. Socios activos = con al menos una visita en el mes.',
    ],
  };
}
// === FIN CALCULO ===

async function soloAdmin(req, res, next) {
  try {
    const u = await prisma.usuario.findUnique({ where: { id: uid(req) }, select: { rol: true, gimnasioId: true } });
    if (!u || u.rol !== 'ADMIN' || !u.gimnasioId) return res.status(403).json({ error: 'Solo para administradores de un gimnasio' });
    req.gimnasioId = u.gimnasioId;
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error de permisos' });
  }
}

async function cargarEstadisticas(gimnasioId) {
  const ahora = new Date();
  const meses = ultimosMeses(12, ahora);
  const inicio = new Date(meses[0] + '-01T03:00:00.000Z');
  const [socios, asistencias, pagos, gimnasio, fin] = await Promise.all([
    prisma.usuario.findMany({
      where: { gimnasioId, rol: 'SOCIO' },
      select: { id: true, creadoEn: true, estadoPago: true, plan: { select: { nombre: true, precio: true } } },
    }),
    prisma.asistencia.findMany({
      where: { usuario: { gimnasioId, rol: 'SOCIO' }, creadoEn: { gte: inicio } },
      select: { usuarioId: true, creadoEn: true },
    }),
    prisma.pago.findMany({
      where: { usuario: { gimnasioId }, pagadoEn: { gte: inicio } },
      select: { monto: true, pagadoEn: true },
    }),
    prisma.gimnasio.findUnique({ where: { id: gimnasioId }, select: { nombre: true, cuota: true } }),
    prisma.gimnasioFinanzas.findUnique({ where: { gimnasioId } }),
  ]);
  const datos = construirEstadisticas({ socios, asistencias, pagos, gimnasio, gastosFijos: fin ? fin.gastosFijos : 0, ahora });
  datos.gastosFijosCargados = fin ? fin.gastosFijos : 0;
  return datos;
}

router.get('/', requireAuth, soloAdmin, async (req, res) => {
  try {
    res.json(await cargarEstadisticas(req.gimnasioId));
  } catch (e) {
    console.error('Error estadisticas:', e);
    res.status(500).json({ error: 'No se pudieron calcular las estadisticas' });
  }
});

const gastosSchema = z.object({ gastosFijos: z.number().min(0).max(1000000000) });

router.put('/gastos', requireAuth, soloAdmin, async (req, res) => {
  const parsed = gastosSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Monto invalido' });
  try {
    const fin = await prisma.gimnasioFinanzas.upsert({
      where: { gimnasioId: req.gimnasioId },
      update: { gastosFijos: parsed.data.gastosFijos },
      create: { gimnasioId: req.gimnasioId, gastosFijos: parsed.data.gastosFijos },
    });
    res.json({ gastosFijos: fin.gastosFijos });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo guardar' });
  }
});

const consejeroSchema = z.object({
  pregunta: z.string().min(1).max(1000),
  historial: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(10)
    .optional()
    .default([]),
});

const PROMPT = `Sos el consejero de negocio de un gimnasio chico en Argentina. Hablas en español rioplatense (voseo), claro, directo y practico, sin tecnicismos. Ayudas al dueño a entender sus numeros, detectar donde esta fallando el gimnasio, pensar campañas publicitarias y decidir sobre cuotas, cantidad de alumnos y balance.

Reglas:
- Usa SOLO los numeros del JSON que sigue. No inventes cifras, porcentajes de mercado ni datos que no esten ahi. Si falta un dato (por ejemplo gastos fijos en 0 o sin cargar), decilo y pedile que lo cargue.
- Marca siempre que el mes en curso esta incompleto cuando compares con el anterior.
- Prioriza: primero lo mas importante y accionable. Da 3 a 5 acciones concretas, con numeros cuando se pueda (ej: cuantos socios hay que recuperar para cubrir X).
- Campañas: propone ideas concretas y, si te lo piden, redacta el texto listo para WhatsApp o Instagram. Segmenta con los datos (socios que dejaron de venir, horarios con poca asistencia, meses con pocas altas).
- Cuotas: razona con los numeros (ticket promedio, planes, cantidad de socios, gastos). Sugeri cambios graduales y probar de a poco; no prometas resultados.
- Son orientaciones basadas en pocos datos, no garantias. Si la pregunta se va de los datos, decilo.
- Respuestas breves (maximo 250 palabras salvo que pidan mas), con viñetas cortas. Moneda: pesos argentinos.`;

router.post('/consejero', requireAuth, soloAdmin, async (req, res) => {
  const parsed = consejeroSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Pregunta invalida' });

  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
  const clave = req.gimnasioId + '|' + hoy;
  const usadas = usos.get(clave) || 0;
  if (usadas >= LIMITE_DIARIO) {
    return res.status(429).json({ error: 'Llegaste al limite de ' + LIMITE_DIARIO + ' consultas por hoy. Manana se renueva.' });
  }

  try {
    const datos = await cargarEstadisticas(req.gimnasioId);
    const sistema = PROMPT + '\n\nDATOS REALES DEL GIMNASIO (resumen, sin nombres de socios):\n' + JSON.stringify(datos);
    const key = (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');

    const contents = [
      ...parsed.data.historial.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      { role: 'user', parts: [{ text: parsed.data.pregunta }] },
    ];

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODELO + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents,
        generationConfig: { maxOutputTokens: 1500, temperature: 0.4 },
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini error (consejero):', response.status, JSON.stringify(data));
      return res.status(502).json({ error: 'No se pudo contactar a la IA. Proba de nuevo en un momento.' });
    }
    usos.set(clave, usadas + 1);
    const texto = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
      ? data.candidates[0].content.parts.map((p) => p.text || '').join('')
      : '').trim();
    res.json({ respuesta: texto || 'No pude armar una respuesta. Proba reformular la pregunta.', restantes: LIMITE_DIARIO - usadas - 1 });
  } catch (e) {
    console.error('Error consejero:', e);
    res.status(502).json({ error: 'No se pudo contactar a la IA.' });
  }
});

export default router;
