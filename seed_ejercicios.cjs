const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Limpiando ejercicios previos...');
  await prisma.ejercicio.deleteMany();

  const ejercicios = [
    {
      nombre: 'Press de Banca Plano',
      grupoMuscular: 'PECHO',
      descripcion: 'Empuje horizontal en banco plano.',
      imagenUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=500'
    },
    {
      nombre: 'Aperturas con Mancuernas',
      grupoMuscular: 'PECHO',
      descripcion: 'Aislamiento de pectoral.',
      imagenUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=500'
    },
    {
      nombre: 'Dominadas',
      grupoMuscular: 'ESPALDA',
      descripcion: 'Tracción vertical con peso corporal.',
      imagenUrl: 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=500'
    },
    {
      nombre: 'Remo con Barra',
      grupoMuscular: 'ESPALDA',
      descripcion: 'Tracción horizontal inclinada.',
      imagenUrl: 'https://images.unsplash.com/photo-1605296867304-46d5465a13f1?w=500'
    },
    {
      nombre: 'Sentadilla Trasera',
      grupoMuscular: 'PIERNAS',
      descripcion: 'Flexo-extensión de rodillas y cadera.',
      imagenUrl: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=500'
    },
    {
      nombre: 'Prensa 45°',
      grupoMuscular: 'PIERNAS',
      descripcion: 'Empuje inclinado en máquina.',
      imagenUrl: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=500'
    },
    {
      nombre: 'Press Militar',
      grupoMuscular: 'HOMBRO',
      descripcion: 'Empuje vertical por encima de la cabeza.',
      imagenUrl: 'https://images.unsplash.com/photo-1532029837206-abbe2b7620e3?w=500'
    },
    {
      nombre: 'Vuelos Laterales',
      grupoMuscular: 'HOMBRO',
      descripcion: 'Abducción de hombros con mancuernas.',
      imagenUrl: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=500'
    },
    {
      nombre: 'Curl de Bíceps',
      grupoMuscular: 'BICEPS',
      descripcion: 'Flexión de codo con barra.',
      imagenUrl: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=500'
    },
    {
      nombre: 'Extensión en Polea',
      grupoMuscular: 'TRICEPS',
      descripcion: 'Extensión de codo en polea alta.',
      imagenUrl: 'https://images.unsplash.com/photo-1530822847156-5df6846166a3?w=500'
    },
    {
      nombre: 'Crunch Abdominal',
      grupoMuscular: 'ABDOMINALES',
      descripcion: 'Flexión de tronco en suelo.',
      imagenUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=500'
    }
  ];

  for (const ej of ejercicios) {
    await prisma.ejercicio.create({ data: ej });
  }

  console.log(`✅ ${ejercicios.length} ejercicios cargados correctamente.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
