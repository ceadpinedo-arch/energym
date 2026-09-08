import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import ejerciciosRoutes from './routes/ejercicios.js';
import rutinasRoutes from './routes/rutinas.js';

const app = express();

app.use(cors());
app.use(express.json());

// Ruta de estado
app.get('/', (req, res) => {
  res.send('✅ API Energym funcionando correctamente');
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/ejercicios', ejerciciosRoutes);
app.use('/api/rutinas', rutinasRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
