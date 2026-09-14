const fetch = require('node-fetch');

async function test() {
  try {
    const URL_BASE = 'https://energym-production-7371.up.railway.app';

    console.log('📡 Intentando conectar a:', URL_BASE);

    // 1. Probar Login
    const resLogin = await fetch(`${URL_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni: '12345678', password: 'socio1234' })
    });
    
    const dataLogin = await resLogin.json();
    console.log('🔑 Status Login:', resLogin.status);

    if (!dataLogin.token) {
      console.log('❌ Error en login:', dataLogin);
      return;
    }

    // 2. Probar Obtención de Ejercicios
    const resEj = await fetch(`${URL_BASE}/api/ejercicios`, {
      headers: { 'Authorization': `Bearer ${dataLogin.token}` }
    });
    
    const ejercicios = await resEj.json();
    console.log('💪 Ejercicios recibidos desde Railway:', Array.isArray(ejercicios) ? ejercicios.length : ejercicios);

  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
  }
}

test();
