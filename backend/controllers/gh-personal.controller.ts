import { Request, Response } from 'express';
import pool from '../config/database.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const initTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gh_personal (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        cedula VARCHAR(50) UNIQUE NOT NULL,
        cargo VARCHAR(255),
        eps VARCHAR(255),
        afp VARCHAR(255),
        celular_personal VARCHAR(50),
        correo_personal VARCHAR(255),
        celular_corporativo VARCHAR(50),
        correo_corporativo VARCHAR(255),
        jefe_inmediato_id INTEGER,
        area_trabajo_id INTEGER,
        es_jefe BOOLEAN DEFAULT FALSE,
        fecha_ingreso DATE,
        estado VARCHAR(50) DEFAULT 'ACTIVO',
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gh_encuestas_activas (
        id SERIAL PRIMARY KEY,
        cedula VARCHAR(50) NOT NULL,
        fecha_activacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        estado VARCHAR(50) DEFAULT 'ACTIVO',
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gh_encuestas_sociodemograficas (
        id SERIAL PRIMARY KEY,
        cedula VARCHAR(50) NOT NULL,
        fecha_ingreso DATE,
        cargo_id INTEGER,
        municipio_nacimiento_id INTEGER,
        fecha_nacimiento DATE,
        tipo_sangre_id INTEGER,
        estado_civil_id INTEGER,
        nivel_educativo_id INTEGER,
        tipo_contrato_id INTEGER,
        ingresos_mensuales_id INTEGER,
        afp_id INTEGER,
        eps_id INTEGER,
        turno_laboral VARCHAR(100),
        tipo_vivienda_id INTEGER,
        estrato INTEGER,
        municipio_residencia_id INTEGER,
        barrio VARCHAR(255),
        direccion TEXT,
        sufre_enfermedad VARCHAR(10),
        viven_conmigo INTEGER,
        principal_sustentador VARCHAR(10),
        personas_a_cargo_id INTEGER,
        discapacidad_familia VARCHAR(10),
        con_quien_vive_id INTEGER,
        cuantos_hijos INTEGER,
        bebe_alcohol VARCHAR(50),
        fuma VARCHAR(10),
        practica_deporte VARCHAR(50),
        tipo_deporte VARCHAR(255),
        uso_tiempo_libre_id INTEGER,
        uso_tiempo_libre_otros TEXT,
        contacto_emergencia_nombre VARCHAR(255),
        contacto_emergencia_telefono VARCHAR(50),
        consentimiento BOOLEAN,
        fecha_realizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        usuario_control VARCHAR(255) DEFAULT 'PUBLIC_USER'
      );

      CREATE TABLE IF NOT EXISTS gh_encuesta_familia (
        id SERIAL PRIMARY KEY,
        encuesta_id INTEGER REFERENCES gh_encuestas_sociodemograficas(id) ON DELETE CASCADE,
        nombre VARCHAR(255),
        parentesco_id INTEGER,
        fecha_nacimiento DATE,
        ocupacion VARCHAR(255)
      );

      -- Registrar Pagina Personal si no existe
      INSERT INTO pages (id, parent_id, name, route, status_id)
      SELECT 'PAG-43', 'MOD-09', 'Personal', 'gestion-humana-personal', 'EST-01'
      WHERE NOT EXISTS (SELECT 1 FROM pages WHERE id = 'PAG-43');
    `);
  } catch (err) {
    console.error('[GH-PERSONAL-INIT] Error:', err);
  }
};

initTables();

export const getPersonal = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT p.*, a.nombre as area_nombre, j.nombre as jefe_nombre
      FROM gh_personal p
      LEFT JOIN gh_areas a ON a.id = p.area_trabajo_id
      LEFT JOIN gh_jefes_inmediatos j ON j.id = p.jefe_inmediato_id
      ORDER BY p.nombre ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const savePersonal = async (req: Request, res: Response) => {
  const {
    id, nombre, cedula, cargo, eps, afp, celular_personal, correo_personal,
    celular_corporativo, correo_corporativo, jefe_inmediato_id, area_trabajo_id,
    es_jefe, fecha_ingreso, estado, usuarioControl
  } = req.body;

  try {
    if (id) {
      await pool.query(`
        UPDATE gh_personal SET
          nombre=$1, cedula=$2, cargo=$3, eps=$4, afp=$5, celular_personal=$6, 
          correo_personal=$7, celular_corporativo=$8, correo_corporativo=$9,
          jefe_inmediato_id=$10, area_trabajo_id=$11, es_jefe=$12, 
          fecha_ingreso=$13, estado=$14, usuario_control=$15, fecha_control=CURRENT_TIMESTAMP
        WHERE id=$16
      `, [
        nombre, cedula, cargo, eps, afp, celular_personal, correo_personal,
        celular_corporativo, correo_corporativo, jefe_inmediato_id, area_trabajo_id,
        es_jefe, fecha_ingreso, estado, usuarioControl || 'System', id
      ]);
    } else {
      await pool.query(`
        INSERT INTO gh_personal (
          nombre, cedula, cargo, eps, afp, celular_personal, correo_personal,
          celular_corporativo, correo_corporativo, jefe_inmediato_id, area_trabajo_id,
          es_jefe, fecha_ingreso, estado, usuario_control
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `, [
        nombre, cedula, cargo, eps, afp, celular_personal, correo_personal,
        celular_corporativo, correo_corporativo, jefe_inmediato_id, area_trabajo_id,
        es_jefe, fecha_ingreso, estado || 'ACTIVO', usuarioControl || 'System'
      ]);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deletePersonal = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM gh_personal WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// --- ENCUESTAS ---

export const getPersonalEncuestas = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM gh_encuestas_activas ORDER BY fecha_activacion DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const activateEncuesta = async (req: Request, res: Response) => {
  const { cedula, usuarioControl } = req.body;
  try {
    // Inactivar previas
    await pool.query("UPDATE gh_encuestas_activas SET estado = 'INACTIVO' WHERE cedula = $1", [cedula]);
    
    await pool.query(`
      INSERT INTO gh_encuestas_activas (cedula, usuario_control)
      VALUES ($1, $2)
    `, [cedula, usuarioControl || 'System']);
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deactivateEncuesta = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await pool.query("UPDATE gh_encuestas_activas SET estado = 'INACTIVO' WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const validateSurveyAccess = async (req: Request, res: Response) => {
  const { cedula } = req.query;
  try {
    const r = await pool.query(`
      SELECT p.nombre, p.cedula, p.cargo, p.fecha_ingreso
      FROM gh_personal p
      JOIN gh_encuestas_activas a ON a.cedula = p.cedula
      WHERE p.cedula = $1 AND a.estado = 'ACTIVO'
      LIMIT 1
    `, [cedula]);

    if (r.rows.length === 0) {
      return res.status(403).json({ error: 'No está autorizado para realizar la encuesta o ya expiró.' });
    }

    res.json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const savePublicSurvey = async (req: Request, res: Response) => {
  const { cedula, data, familia } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const surveyRes = await client.query(`
      INSERT INTO gh_encuestas_sociodemograficas (
        cedula, fecha_ingreso, cargo_id, municipio_nacimiento_id, fecha_nacimiento,
        tipo_sangre_id, estado_civil_id, nivel_educativo_id, tipo_contrato_id,
        ingresos_mensuales_id, afp_id, eps_id, turno_laboral, tipo_vivienda_id,
        estrato, municipio_residencia_id, barrio, direccion, sufre_enfermedad,
        viven_conmigo, principal_sustentador, personas_a_cargo_id, discapacidad_familia,
        con_quien_vive_id, cuantos_hijos, bebe_alcohol, fuma, practica_deporte,
        tipo_deporte, uso_tiempo_libre_id, uso_tiempo_libre_otros,
        contacto_emergencia_nombre, contacto_emergencia_telefono, consentimiento,
        usuario_control
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, 'PUBLIC_USER'
      ) RETURNING id
    `, [
      cedula, data.fecha_ingreso, data.cargo_id, data.municipio_nacimiento_id, data.fecha_nacimiento,
      data.tipo_sangre_id, data.estado_civil_id, data.nivel_educativo_id, data.tipo_contrato_id,
      data.ingresos_mensuales_id, data.afp_id, data.eps_id, data.turno_laboral, data.tipo_vivienda_id,
      data.estrato, data.municipio_residencia_id, data.barrio, data.direccion, data.sufre_enfermedad,
      data.viven_conmigo, data.principal_sustentador, data.personas_a_cargo_id, data.discapacidad_familia,
      data.con_quien_vive_id, data.cuantos_hijos, data.bebe_alcohol, data.fuma, data.practica_deporte,
      data.tipo_deporte, data.uso_tiempo_libre_id, data.uso_tiempo_libre_otros,
      data.contacto_emergencia_nombre, data.contacto_emergencia_telefono, data.consentimiento
    ]);

    const encuestaId = surveyRes.rows[0].id;

    if (familia && Array.isArray(familia)) {
      for (const fam of familia) {
        await client.query(`
          INSERT INTO gh_encuesta_familia (encuesta_id, nombre, fecha_nacimiento)
          VALUES ($1, $2, $3)
        `, [encuestaId, fam.nombre, fam.fecha_nacimiento]);
      }
    }

    await client.query("UPDATE gh_encuestas_activas SET estado = 'COMPLETADO' WHERE cedula = $1 AND estado = 'ACTIVO'", [cedula]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Encuesta guardada exitosamente.' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[GH-SAVE] Error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

export const getEncuestasResultados = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT r.*, p.nombre, p.cargo 
      FROM gh_encuestas_sociodemograficas r
      JOIN gh_personal p ON p.cedula = r.cedula
      ORDER BY r.fecha_realizacion DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const generateEncuestaPDF = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT r.*, p.nombre, p.cargo as cargo_original, p.fecha_ingreso as fi_original,
             mn.nombre as mun_nac_nombre, dn.nombre as dep_nac_nombre,
             mr.nombre as mun_res_nombre, dr.nombre as dep_res_nombre,
             ts.nombre as sangre_nombre, ec.nombre as civil_nombre,
             ne.nombre as edu_nombre, tv.nombre as vivienda_nombre,
             utl.nombre as tiempo_libre_nombre,
             tc.nombre as contrato_nombre, im.nombre as ingresos_nombre,
             afp.nombre as afp_nombre, eps.nombre as eps_nombre,
             pac.nombre as pcargo_nombre, cvv.nombre as conviviente_nombre,
             cg.nombre as cargo_enc_nombre
      FROM gh_encuestas_sociodemograficas r
      JOIN gh_personal p ON p.cedula = r.cedula
      LEFT JOIN cfg_ciudades mn ON mn.id = r.municipio_nacimiento_id
      LEFT JOIN cfg_departamentos dn ON dn.id = mn.id_departamento
      LEFT JOIN cfg_ciudades mr ON mr.id = r.municipio_residencia_id
      LEFT JOIN cfg_departamentos dr ON dr.id = mr.id_departamento
      LEFT JOIN gh_miscelaneos ts ON ts.id = r.tipo_sangre_id
      LEFT JOIN gh_miscelaneos ec ON ec.id = r.estado_civil_id
      LEFT JOIN gh_miscelaneos ne ON ne.id = r.nivel_educativo_id
      LEFT JOIN gh_miscelaneos tv ON tv.id = r.tipo_vivienda_id
      LEFT JOIN gh_miscelaneos utl ON utl.id = r.uso_tiempo_libre_id
      LEFT JOIN gh_miscelaneos tc ON tc.id = r.tipo_contrato_id
      LEFT JOIN gh_miscelaneos im ON im.id = r.ingresos_mensuales_id
      LEFT JOIN gh_miscelaneos afp ON afp.id = r.afp_id
      LEFT JOIN gh_miscelaneos eps ON eps.id = r.eps_id
      LEFT JOIN gh_miscelaneos pac ON pac.id = r.personas_a_cargo_id
      LEFT JOIN gh_miscelaneos cvv ON cvv.id = r.con_quien_vive_id
      LEFT JOIN gh_miscelaneos cg ON cg.id = r.cargo_id
      WHERE r.id = $1
    `, [id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Encuesta no encontrada' });

    const enc = result.rows[0];
    const famResult = await pool.query(`SELECT * FROM gh_encuesta_familia WHERE encuesta_id = $1`, [id]);
    const familia = famResult.rows;

    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("REPORTE SOCIODEMOGRÁFICO", 14, 15);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`COLABORADOR: ${enc.nombre} | CC: ${enc.cedula}`, 14, 25);
    doc.text(`REALIZADA: ${new Date(enc.fecha_realizacion).toLocaleString()}`, pageWidth - 14, 25, { align: 'right' });

    let y = 45;

    const addSection = (title: string, data: any[]) => {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(title, 14, y);
      y += 4;
      autoTable(doc, {
        startY: y, body: data, theme: 'striped',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [15, 23, 42] },
        margin: { left: 14, right: 14 }
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    };

    addSection("1. PERFIL CORPORATIVO", [
      ["Cargo", enc.cargo_enc_nombre || enc.cargo_original, "Fecha Ingreso", enc.fecha_ingreso ? new Date(enc.fecha_ingreso).toLocaleDateString() : 'N/A'],
      ["Tipo Contrato", enc.contrato_nombre, "Turno", enc.turno_laboral],
      ["Ingresos", enc.ingresos_nombre, "AFP / EPS", `${enc.afp_nombre} / ${enc.eps_nombre}`]
    ]);

    addSection("2. DATOS PERSONALES Y RESIDENCIA", [
      ["Lugar Nac.", `${enc.mun_nac_nombre}, ${enc.dep_nac_nombre}`, "Fecha Nac.", enc.fecha_nacimiento ? new Date(enc.fecha_nacimiento).toLocaleDateString() : 'N/A'],
      ["Sangre", enc.sangre_nombre, "Estado Civil", enc.civil_nombre],
      ["Nivel Educativo", enc.edu_nombre, "Estrato", enc.estrato],
      ["Tipo Vivienda", enc.vivienda_nombre, "Ciudad Res.", `${enc.mun_res_nombre}, ${enc.dep_res_nombre}`],
      ["Barrio", enc.barrio, "Dirección", enc.direccion]
    ]);

    addSection("3. ENTORNO FAMILIAR Y SOCIAL", [
      ["Personas Hogar", enc.viven_conmigo, "Sustentador", enc.principal_sustentador],
      ["Pers. a Cargo", enc.pcargo_nombre, "Discapacidad Fam.", enc.discapacidad_familia],
      ["Vive con", enc.conviviente_nombre, "Hijos", enc.cuantos_hijos]
    ]);

    addSection("4. SALUD Y ESTILO DE VIDA", [
      ["Enfermedad Crónica", enc.sufre_enfermedad, "Bebe Alcohol", enc.bebe_alcohol],
      ["Fuma", enc.fuma, "Deporte", enc.practica_deporte],
      ["Actividad Física", enc.tipo_deporte, "Tiempo Libre", enc.tiempo_libre_nombre || enc.uso_tiempo_libre_otros]
    ]);

    addSection("5. CONTACTO DE EMERGENCIA", [
      ["Nombre", enc.contacto_emergencia_nombre, "Teléfono", enc.contacto_emergencia_telefono]
    ]);

    if (familia.length > 0) {
      addSection("6. COMPOSICIÓN FAMILIAR (HIJOS/OTROS)", familia.map(f => [
        f.nombre, f.fecha_nacimiento ? new Date(f.fecha_nacimiento).toLocaleDateString() : '—'
      ]));
    }

    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    doc.text("Información confidencial (Ley 1581 de 2012). Consentimiento aceptado: " + (enc.consentimiento ? 'SÍ' : 'NO'), 14, y);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Perfil_${enc.cedula}.pdf`);
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
