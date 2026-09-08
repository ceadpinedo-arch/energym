const fetch = require('node-fetch')
async function test() {
  try {
    const resLogin = await fetch('https://energym-production.up.railway.app/api/auth/login', {
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

    const resEj = await fetch('https://energym-production.up.railway.app/api/ejercicios', {
      headers: { 'Authorization': `Bearer ${dataLogin.token}` }
    });
    const ejercicios = await resEj.json();
    console.log('💪 Ejercicios recibidos desde Railway:', Array.isArray(ejercicios) ? ejercicios.length : ejercicios);
  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
  }
}

test();
