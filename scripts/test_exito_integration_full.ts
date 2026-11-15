/**
 * test_exito_integration_full.ts
 * Suite Integral de Verificación Funcional B2B Go Éxito v2.0 & OrbitM7
 */

import fetch from 'node-fetch';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8081';
const API_KEY = 'm7-exito-sandbox-key-2026';
const CORRELATION_ID = 'test-audit-' + Date.now();

console.log(`\n======================================================`);
console.log(`🚀 INICIANDO AUDITORÍA INTEGRAL GO ÉXITO v2.0`);
console.log(`Target: ${BASE_URL}`);
console.log(`Correlation ID: ${CORRELATION_ID}`);
console.log(`======================================================\n`);

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error('     Detalles:', details);
    failed++;
  }
}

async function run() {
  const testOrderNum = `PED-AUDIT-${Date.now()}`;
  let createdGuideNumber = '';

  // ── TEST 1: Seguridad y Bloqueo de Query String ──
  console.log(`\n🔒 1. VALIDACIÓN DE SEGURIDAD Y CREDENCIALES:`);
  {
    const res = await fetch(`${BASE_URL}/api/v1/guides?api_key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true })
    });
    const body: any = await res.json().catch(() => ({}));
    assert(res.status === 401 && body.code === 'CREDENTIALS_IN_QUERY_FORBIDDEN',
      'Bloqueo estricto de credenciales en query string (HTTP 401)');
  }

  // ── TEST 2: Falta de Credencial ──
  {
    const res = await fetch(`${BASE_URL}/api/v1/guides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true })
    });
    const body: any = await res.json().catch(() => ({}));
    assert(res.status === 401 && body.code === 'MISSING_AUTHENTICATION',
      'Rechazo por falta de credencial (HTTP 401)');
  }

  // ── TEST 3: Credencial Inválida ──
  {
    const res = await fetch(`${BASE_URL}/api/v1/guides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'clave-falsa-12345'
      },
      body: JSON.stringify({ test: true })
    });
    const body: any = await res.json().catch(() => ({}));
    assert(res.status === 403 && body.code === 'INVALID_API_CREDENTIALS',
      'Rechazo de credencial no autorizada (HTTP 403 INVALID_API_CREDENTIALS)');
  }

  // ── TEST 4: Tolerancia a comillas y encabezados duplicados ──
  {
    const res = await fetch(`${BASE_URL}/api/v1/guides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': `"${API_KEY}", ${API_KEY}`,
        'x-correlation-id': CORRELATION_ID,
      },
      body: JSON.stringify({ test: true })
    });
    const body: any = await res.json().catch(() => ({}));
    assert(res.status === 422 && body.code === 'MISSING_REQUIRED_FIELDS',
      'Autenticación exitosa tolerando comillas y cabeceras duplicadas');
  }

  // ── TEST 5: Creación Exitosa de Guía y Generación de Rótulo On-Demand ──
  console.log(`\n📦 2. SERVICIO B2B 7.1: CREACIÓN DE GUÍA Y RÓTULO TÉRMICO:`);
  {
    const payload = {
      header: {
        transactionId: CORRELATION_ID,
        applicationId: 'GO_EXITO'
      },
      data: {
        conclusion: true,
        operationType: 'CREATE_GUIDE_REQUEST',
        resultType: 'OK',
        trace: '90889079555',
        traceType: 'OUT',
        transactionId: CORRELATION_ID,
        data: {
          pedido: testOrderNum,
          contenedor: 'CONT-AUDIT-01',
          modalidad_pedido: 'FIRME',
          tipo_servicio: '1',
          codigo_dependencia: '0054',
          nombre_remitente: 'ÉXITO WOW ENVIGADO',
          nit_remitente: '890900608-9',
          direccion_remitente: 'CR 48 # 34B SUR 29',
          ciudad_remitente: '05266000',
          nombre_destinatario: 'CARLOS ANDRÉS RESTREPO',
          nit_destinatario: '1037654321',
          direccion_destinatario: 'CL 37 SUR # 43A - 52 APTO 301',
          barrio_destinatario: 'EL DORADO',
          ciudad_destinatario: '05266000',
          celular_destinatario: '3001234567',
          cant_cajas: '1',
          peso: '2.5',
          alto: '25',
          ancho: '20',
          largo: '30',
          valor_declarado: '185000',
          contenido: 'MERCANCIA EXITO AUDITORIA'
        }
      }
    };

    const res = await fetch(`${BASE_URL}/api/v1/guides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'x-correlation-id': CORRELATION_ID,
        'Idempotency-Key': `idem-${testOrderNum}`
      },
      body: JSON.stringify(payload)
    });

    const body: any = await res.json().catch(() => ({}));
    assert(res.status === 201 && body.code === 'GUIDE_CREATED',
      'Creación exitosa de guía (HTTP 201 GUIDE_CREATED)', body);

    createdGuideNumber = body?.data?.guideNumber || '';
    assert(Boolean(createdGuideNumber), `Número de guía generado: ${createdGuideNumber}`);
    assert(body?.data?.status === '1', 'Estado inicial homologado: 1 (Guía generada)');
    assert(typeof body?.data?.PAQUETERA_GET_LABELS_RESPONSE?.rotulos === 'string' &&
           body?.data?.PAQUETERA_GET_LABELS_RESPONSE?.rotulos.startsWith('JVBERi0x'),
           'Rótulo térmico PDF generado en memoria RAM bajo demanda (Base64 válido)');

    // ── TEST 6: Idempotencia en Creación de Guía ──
    const replayRes = await fetch(`${BASE_URL}/api/v1/guides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'x-correlation-id': CORRELATION_ID,
        'Idempotency-Key': `idem-${testOrderNum}`
      },
      body: JSON.stringify(payload)
    });
    const replayBody: any = await replayRes.json().catch(() => ({}));
    assert(replayRes.status === 200 && replayBody.code === 'IDEMPOTENT_REPLAY',
      'Idempotencia: Reenvío con misma Idempotency-Key retorna respuesta exacta previa (HTTP 200 IDEMPOTENT_REPLAY)');
  }

  // ── TEST 7: Consulta de Rótulo PDF On-Demand ──
  console.log(`\n🖨️ 3. SERVICIO B2B 7.1: CONSULTA Y DESCARGA DE RÓTULO TÉRMICO PDF:`);
  if (createdGuideNumber) {
    // 7.a: Consulta en formato JSON (Base64)
    const resJson = await fetch(`${BASE_URL}/api/v1/guides/${createdGuideNumber}/label`, {
      headers: { 'x-api-key': API_KEY }
    });
    const bodyJson: any = await resJson.json().catch(() => ({}));
    assert(resJson.status === 200 && bodyJson.code === 'LABEL_READY',
      'Consulta de rótulo vía JSON (HTTP 200 LABEL_READY)');

    // 7.b: Descarga directa en flujo binario PDF
    const resPdf = await fetch(`${BASE_URL}/api/v1/guides/${createdGuideNumber}/label?format=pdf`, {
      headers: { 'x-api-key': API_KEY }
    });
    const contentType = resPdf.headers.get('content-type') || '';
    const buffer = await resPdf.buffer();
    assert(resPdf.status === 200 && contentType.includes('application/pdf') && buffer.length > 1000,
      `Descarga de rótulo binario PDF 4x6" (${buffer.length} bytes, application/pdf)`);
  }

  // ── TEST 8: Solicitud de Recogida en Nodo (COLLECT_GUIDE) ──
  console.log(`\n🏪 4. SERVICIO B2B 7.2: SOLICITUD DE RECOGIDA EN TIENDA (COLLECT_GUIDE):`);
  if (createdGuideNumber) {
    const pickupPayload = {
      COLLECT_GUIDE: {
        header: {
          transactionId: CORRELATION_ID,
          applicationId: 'GoExito'
        },
        data: {
          guias: [createdGuideNumber],
          codigoDependencia: '0054',
          fechaRecogida: new Date().toISOString().split('T')[0],
          franjaHoraria: '08:00-12:00',
          totalPaquetes: 1
        }
      }
    };

    const res = await fetch(`${BASE_URL}/api/v1/pickups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'x-correlation-id': CORRELATION_ID
      },
      body: JSON.stringify(pickupPayload)
    });
    const body: any = await res.json().catch(() => ({}));
    assert(res.status === 200 && (body.code === 'PICKUP_REQUESTED' || body.code === 'PICKUP_SCHEDULED'),
      'Programación exitosa de recogida en nodo (HTTP 200 PICKUP_SCHEDULED / PICKUP_REQUESTED)', body);
  }

  // ── TEST 9: Consulta Síncrona de Estado y Trazabilidad ──
  console.log(`\n🔍 5. SERVICIO B2B: CONSULTA DE ESTADO Y TRAZABILIDAD:`);
  if (createdGuideNumber) {
    const res = await fetch(`${BASE_URL}/api/v1/guides/${createdGuideNumber}`, {
      headers: { 'x-api-key': API_KEY }
    });
    const body: any = await res.json().catch(() => ({}));
    assert(res.status === 200 && body.code === 'STATUS_RETRIEVED',
      'Consulta síncrona de estado y eventos históricos (HTTP 200 STATUS_RETRIEVED)');
    assert(body?.data?.orderNumber === testOrderNum, 'Consistencia de datos: pedido coincide');
  }

  // ── TEST 10: Actualización de Guía (PATCH) ──
  console.log(`\n✏️ 6. SERVICIO B2B 7.5: ACTUALIZACIÓN DE GUÍA (PATCH):`);
  if (createdGuideNumber) {
    const res = await fetch(`${BASE_URL}/api/v1/guides/${createdGuideNumber}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'x-correlation-id': CORRELATION_ID
      },
      body: JSON.stringify({
        observaciones: 'Nueva indicación: Entregar con el conserje Carlos',
        celularDestinatario: '3109876543'
      })
    });
    const body: any = await res.json().catch(() => ({}));
    assert(res.status === 200 && body.code === 'GUIDE_UPDATED',
      'Actualización parcial de guía antes de reparto (HTTP 200 GUIDE_UPDATED)', body);
  }

  // ── TEST 11: Anulación Idempotente de Guía ──
  console.log(`\n🚫 7. SERVICIO B2B 7.3: ANULACIÓN IDEMPOTENTE DE GUÍA:`);
  if (createdGuideNumber) {
    const cancelPayload = {
      reasonCode: 'ORDER_CANCELLED_BY_CUSTOMER',
      reasonDescription: 'Cliente desistió de la compra antes del despacho físico',
      cancelledBy: 'GO_EXITO'
    };

    const res = await fetch(`${BASE_URL}/api/v1/guides/${createdGuideNumber}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'x-correlation-id': CORRELATION_ID
      },
      body: JSON.stringify(cancelPayload)
    });
    const body: any = await res.json().catch(() => ({}));
    assert(res.status === 200 && body.code === 'GUIDE_CANCELLED',
      'Anulación exitosa de guía (HTTP 200 GUIDE_CANCELLED)');
    assert(body?.data?.status === '7', 'Estado homologado actualizado a: 7 (Cancelado)');

    // Reintento idempotente de anulación: debe retornar 200 OK con GUIDE_ALREADY_CANCELLED
    const resReplay = await fetch(`${BASE_URL}/api/v1/guides/${createdGuideNumber}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'x-correlation-id': CORRELATION_ID
      },
      body: JSON.stringify(cancelPayload)
    });
    const bodyReplay: any = await resReplay.json().catch(() => ({}));
    assert(resReplay.status === 200 && bodyReplay.code === 'GUIDE_ALREADY_CANCELLED',
      'Idempotencia: Reanulación no falla y responde HTTP 200 GUIDE_ALREADY_CANCELLED');
  }

  // ── TEST 12: Contrato OpenAPI 3.0.3 en Vivo ──
  console.log(`\n📑 8. ESPECIFICACIÓN OPENAPI 3.0.3 EN VIVO:`);
  {
    const res = await fetch(`${BASE_URL}/api/exito-mensajeria/openapi.json`);
    const spec: any = await res.json().catch(() => ({}));
    assert(res.status === 200 && spec.openapi === '3.0.3',
      'Contrato OpenAPI 3.0.3 disponible públicamente en vivo (/api/exito-mensajeria/openapi.json)');
    assert(spec.paths['/api/v1/guides'] && spec.paths['/api/v1/pickups'],
      'Rutas canónicas /api/v1/* presentes en la especificación');
  }

  console.log(`\n======================================================`);
  console.log(`📊 RESULTADO DE LA AUDITORÍA:`);
  console.log(`   Pruebas Exitosas: ${passed}`);
  console.log(`   Pruebas Fallidas: ${failed}`);
  console.log(`   Tasa de Éxito:    ${Math.round((passed / (passed + failed)) * 100)}%`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Error fatal en ejecución de auditoría:', err);
  process.exit(1);
});
