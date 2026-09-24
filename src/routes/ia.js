import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const uid = (req) => req.usuario.id ?? req.usuario.sub ?? req.usuario.usuarioId;

const mensajeSchema = z.object({
  mensaje: z.string().min(1),
  historial: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .optional()
    .default([]),
});

const SYSTEM_PROMPT_BASE = `Sos el asistente de Energym, un gimnasio de pesas. Ayudás a los socios con dudas de entrenamiento, técnica de ejercicios, nutrición básica y ajustes de rutina. Respondés en español, de forma clara y motivadora, sin dar diagnósticos médicos. Si algo requiere un profesional (lesión, condición médica), sugerís consultar a un médico o nutricionista.`;

const MODELO = 'gemini-3.5-flash-lite';

async function construirContexto(usuarioId) {
  try {
    const [rutina, registros, asistencias] = await Promise.all([
      prisma.rutina.findUnique({
        where: { usuarioId },
        include: { ejercicios: { include: { ejercicio: true }, orderBy: { orden: 'asc' } } },
      }),
      prisma.registro.findMany({
        where: { usuarioId },
        orderBy: [{ dia: 'desc' }, { creadoEn: 'desc' }],
        take: 30,
        include: { },
      }),
      prisma.asistencia.findMany({
        where: { usuarioId },
        select: { dia: true },
        orderBy: { dia: 'desc' },
        take: 60,
      }),
    ]);

    const partes = [];

    if (rutina && rutina.ejercicios.length > 0) {
      const porDia = {};
      for (const re of rutina.ejercicios) {
        const dia = re.dia || 'Sin día asignado';
        if (!porDia[dia]) porDia[dia] = [];
        porDia[dia].push(`${re.ejercicio.nombre} (${re.series} series x ${re.repeticiones})`);
      }
      const lineas = Object.entries(porDia).map(([dia, ejs]) => `- ${dia}: ${ejs.join(', ')}`);
      partes.push(`Rutina actual del socio:\n${lineas.join('\n')}`);
    } else {
      partes.push('El socio todavía no armó una rutina guardada.');
    }

    if (registros.length > 0) {
      const ultimosPorEjercicio = {};
      for (const r of registros) {
        if (!ultimosPorEjercicio[r.ejercicioId]) ultimosPorEjercicio[r.ejercicioId] = r;
      }
      const nombresEj = rutina
        ? Object.fromEntries(rutina.ejercicios.map((re) => [re.ejercicioId, re.ejercicio.nombre]))
        : {};
      const lineas = Object.values(ultimosPorEjercicio)
        .slice(0, 8)
        .map((r) => `- ${nombresEj[r.ejercicioId] || 'Ejercicio'}: ${r.series}x${r.repeticiones} con ${r.peso}kg (${r.dia})`);
      partes.push(`Últimas marcas registradas:\n${lineas.join('\n')}`);
    }

    if (asistencias.length > 0) {
      const dias = new Set(asistencias.map((a) => a.dia));
      const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
      const mes = hoy.slice(0, 7);
      const visitasMes = asistencias.filter((a) => a.dia.startsWith(mes)).length;
      let cursor = hoy;
      let racha = 0;
      while (dias.has(cursor)) {
        racha++;
        const d = new Date(cursor + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() - 1);
        cursor = d.toISOString().slice(0, 10);
      }
      partes.push(`Asistencia: ${visitasMes} visitas este mes, racha actual de ${racha} días seguidos.`);
    } else {
      partes.push('Todavía no registró asistencias.');
    }

    return partes.join('\n\n');
  } catch (e) {
    console.error('Error al construir contexto del socio:', e);
    return '';
  }
}

router.post('/chat', requireAuth, async (req, res) => {
  const parsed = mensajeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Mensaje inválido' });

  const { mensaje, historial } = parsed.data;

  try {
    const contexto = await construirContexto(uid(req));
    const systemPrompt = contexto
      ? `${SYSTEM_PROMPT_BASE}\n\nInformación real de este socio (usala para responder de forma concreta y personalizada, sin inventar datos que no estén acá):\n\n${contexto}`
      : SYSTEM_PROMPT_BASE;

    const contents = [
      ...historial.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: mensaje }] },
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: 500 },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) console.error('Gemini error:', response.status, JSON.stringify(data));
    const texto = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
    res.json({ respuesta: texto });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'No se pudo contactar al asistente' });
  }
});

export default router;
