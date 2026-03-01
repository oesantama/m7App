import axios from 'axios';

const BACKEND_URL = 'http://localhost:8090/api';

async function test() {
  console.log('--- TEST INICIADO ---');
  try {
    // 1. Login
    console.log('Intentando Login...');
    const loginRes = await axios.post(`${BACKEND_URL}/auth/login`, {
      email: 'admin@millasiete.com',
      password: 'admin123'
    });
    
    console.log('Login OK. Token recibido.');
    const token = loginRes.data.token;

    // 2. Acceso a Admin Tables
    console.log('Consultando /admin/tables con token...');
    const tablesRes = await axios.post(`${BACKEND_URL}/admin/tables`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('Tablas recibidas:', tablesRes.data);
    console.log('--- TEST EXITOSO ---');
  } catch (err: any) {
    console.error('--- ERROR EN TEST ---');
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Body:', err.response.data);
    } else {
      console.error('Message:', err.message);
    }
  }
}

test();
