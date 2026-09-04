import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import sociosRoutes from './routes/socios.js';
import pagosRoutes from './routes/pagos.js';
import ejerciciosRoutes from './routes/ejercicios.js';
import rutinasRoutes from './routes/rutinas.js';
import iaRoutes from './routes/ia.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/socios', sociosRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/ejercicios', ejerciciosRoutes);
app.use('/api/rutinas', rutinasRoutes);
app.use('/api/ia', iaRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Energym API escuchando en :${PORT}`));
