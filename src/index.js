import express from 'express';
import { iniciarCron } from './cron.js';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import ejerciciosRoutes from './routes/ejercicios.js';
import rutinasRoutes from './routes/rutinas.js';
import iaRoutes from './routes/ia.js';
import asistenciaRoutes from './routes/asistencia.js';
import entrenosRoutes from './routes/entrenos.js';
import pushRoutes from './routes/push.js';
import socioRoutes from './routes/socios.js';
import pagosRoutes from './routes/pagos.js';
import gimnasioRoutes from './routes/gimnasio.js';
const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/ia', iaRoutes);
app.use('/api/asistencia', asistenciaRoutes);
app.use('/api/entrenos', entrenosRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/socios', socioRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/gimnasio', gimnasioRoutes);
// Ruta de estado
app.get('/', (req, res) => {
  res.send('✅ API Energym funcionando correctamente');
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/ejercicios', ejerciciosRoutes);
app.use('/api/rutinas', rutinasRoutes);

const PORT = process.env.PORT || 3000;
iniciarCron();
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
