import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const mensajeSchema = z.object({
  mensaje: z.string().min(1),
  historial: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .optional()
    .default([]),
});

const SYSTEM_PROMPT = `Sos el asistente de Energym, un gimnasio de pesas. Ayudás a los
socios con dudas de entrenamiento, técnica de ejercicios, nutrición básica y
ajustes de rutina. Respondés en español, de forma clara y motivadora, sin dar
diagnósticos médicos. Si algo requiere un profesional (lesión, condición
médica), sugerís consultar a un médico o nutricionista.`;

// Chat con el asistente de IA (requiere ANTHROPIC_API_KEY en el .env)
router.post('/chat', requireAuth, async (req, res) => {
  const parsed = mensajeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Mensaje inválido' });

  const { mensaje, historial } = parsed.data;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [...historial, { role: 'user', content: mensaje }],
      }),
    });

    const data = await response.json();
    const texto = data.content?.find((b) => b.type === 'text')?.text ?? '';
    res.json({ respuesta: texto });
  } catch (err) {
    res.status(502).json({ error: 'No se pudo contactar al asistente' });
  }
});

export default router;
