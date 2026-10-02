import { verificarActivo } from './middleware/activo.js';
import express from 'express';
import { iniciarCron } from './cron.js';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import ejerciciosRoutes from './routes/ejercicios.js';
import rutinasRoutes from './routes/rutinas.js';
import adminRoutes from './routes/admin.js';
import superRoutes from './routes/superadmin.js';
import iaRoutes from './routes/ia.js';
import entrenosRoutes from './routes/entrenos.js';
import pushRoutes from './routes/push.js';
import socioRoutes from './routes/socios.js';
import asistenciaRoutes from './routes/asistencias.js';
import asistenciaAppRoutes from './routes/asistencia.js';
import pagosRoutes from './routes/pagos.js';
import gimnasioRoutes from './routes/gimnasio.js';
const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', verificarActivo);
app.use('/api/entrenos', entrenosRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/socios', socioRoutes);
app.use('/api/asistencias', asistenciaRoutes);
app.use('/api/asistencia', asistenciaAppRoutes);
app.use('/api/ia', iaRoutes);
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
app.use('/api/admin', adminRoutes);
app.use('/api/superadmin', superRoutes);

const PORT = process.env.PORT || 3000;
iniciarCron();
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
