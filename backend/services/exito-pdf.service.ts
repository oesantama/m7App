/**
 * exito-pdf.service.ts
 * Generador en memoria (pdf-lib + qrcode) de Rótulos 4x6" y Remisiones Oficiales para Éxito Mensajería.
 * Todos los documentos se generan en RAM (< 80ms) y se suben directamente a Google Drive vía ExitoDriveService.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { ExitoDriveService, DriveUploadResult } from './exito-drive.service.js';
import { nowColombiaDateTimeStr } from '../utils/date.util.js';

function cleanPdfText(input: any): string {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();
}

/**
 * Tabla oficial ISO/IEC 15417 para Código de Barras Lineal CODE-128 (Valores 0 a 106).
 * Cada cadena representa anchos alternados de [Barra, Espacio, Barra, Espacio, Barra, Espacio]
 * (y barra final de cierre en el símbolo Stop 106).
 * Garantiza lectura instantánea con cualquier pistola láser 1D, lector CCD/2D o cámara de celular.
 */
const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

function buildCode128BPattern(rawText: string): string {
  const clean = cleanPdfText(rawText);
  const START_B = 104;
  const STOP = 106;
  const codes: number[] = [START_B];
  let checksum = START_B;

  for (let i = 0; i < clean.length; i++) {
    const ascii = clean.charCodeAt(i);
    const val = ascii >= 32 && ascii <= 126 ? ascii - 32 : 0;
    codes.push(val);
    checksum += val * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(STOP);

  return codes.map((c) => CODE128_PATTERNS[c] || '').join('');
}

export class ExitoPdfService {
  /**
   * Genera el PDF del Rótulo / Etiqueta (formato 4x6 pulgadas = 288x432 pts) 100% EN MEMORIA (On-Demand)
   * cuando se solicita por la API de Grupo Éxito o para imprimir/visualizar en el Frontend,
   * SIN almacenar archivos PDF de rótulos en Google Drive ni en el disco local.
   */
  static async generateGuideLabelOnDemand(guia: {
    numero_guia: string;
    codigo_remision: string;
    numero_pedido: string;
    contenedor?: string | null;
    modalidad_pedido?: string;
    tipo_operacion: 'SAME_DAY' | 'NEXT_DAY';
    codigo_dependencia?: string | null;
    nombre_remitente?: string | null;
    direccion_remitente?: string | null;
    ciudad_remitente_nombre?: string | null;
    nombre_destinatario: string;
    nit_destinatario?: string | null;
    direccion_destinatario: string;
    barrio_destinatario?: string | null;
    ciudad_destinatario_nombre?: string | null;
    telefono_destinatario?: string | null;
    celular_destinatario?: string | null;
    cant_cajas?: number;
    peso_kg?: number;
    alto_cm?: number;
    ancho_cm?: number;
    largo_cm?: number;
    contenido?: string | null;
    observaciones?: string | null;
    created_at?: string | Date | null;
    is_sandbox?: boolean;
  }): Promise<{
    pdfBuffer: Buffer;
    pdfBase64: string;
    dynamicLabelUrl: string;
  }> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([288, 432]); // 4x6 pulgadas
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const black = rgb(0, 0, 0);

    // Marco exterior en blanco y negro puro (0 relleno de color para ahorro total de tinta)
    page.drawRectangle({
      x: 8,
      y: 8,
      width: 272,
      height: 416,
      borderColor: black,
      borderWidth: 1.5,
    });

    // Encabezado en blanco y negro (sin fondo sólido de color y sin mención a Go Éxito)
    page.drawLine({
      start: { x: 8, y: 382 },
      end: { x: 280, y: 382 },
      thickness: 1.5,
      color: black,
    });

    page.drawText('MILLA 7 LOGISTICS', {
      x: 16,
      y: 406,
      size: 11.5,
      font: fontBold,
      color: black,
    });

    const opText =
      guia.tipo_operacion === 'SAME_DAY'
        ? 'ENTREGA MISMO DIA (SAME DAY) - URBANO'
        : 'ENTREGA DIA SIGUIENTE (NEXT DAY) - URBANO';
    page.drawText(opText, {
      x: 16,
      y: 390,
      size: 8,
      font: fontBold,
      color: black,
    });

    if (guia.is_sandbox) {
      page.drawText('[PRUEBA QA]', {
        x: 210,
        y: 406,
        size: 8,
        font: fontBold,
        color: black,
      });
    }

    // Código QR con el número de guía limpio para lectura directa con celular o lector 2D
    const qrPayload = cleanPdfText(guia.numero_guia);
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 140,
    });
    const qrPngBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    const qrImage = await pdfDoc.embedPng(qrPngBytes);

    page.drawImage(qrImage, {
      x: 196,
      y: 298,
      width: 76,
      height: 76,
    });

    // Datos principales de Guía y Pedido
    page.drawText('GUIA DE TRANSPORTE MILLA 7:', {
      x: 16,
      y: 366,
      size: 7.5,
      font: fontBold,
      color: black,
    });
    page.drawText(cleanPdfText(guia.numero_guia), {
      x: 16,
      y: 350,
      size: 14.5,
      font: fontBold,
      color: black,
    });

    page.drawText(`PEDIDO: ${cleanPdfText(guia.numero_pedido)}`, {
      x: 16,
      y: 334,
      size: 9,
      font: fontBold,
      color: black,
    });

    page.drawText(`CONTENEDOR: ${cleanPdfText(guia.contenedor || 'N/A')}`, {
      x: 16,
      y: 321,
      size: 8,
      font: fontReg,
      color: black,
    });

    page.drawText(
      `MODALIDAD: ${cleanPdfText(guia.modalidad_pedido || 'FIRME')}  |  REM: ${cleanPdfText(guia.codigo_remision)}`,
      {
        x: 16,
        y: 308,
        size: 7.5,
        font: fontReg,
        color: black,
      }
    );

    // Línea divisoria
    page.drawLine({
      start: { x: 8, y: 292 },
      end: { x: 280, y: 292 },
      thickness: 1,
      color: black,
    });

    // Sección Nodo Origen
    page.drawText('ORIGEN (NODO REMITENTE - MISMA CIUDAD):', {
      x: 16,
      y: 278,
      size: 7.5,
      font: fontBold,
      color: black,
    });
    page.drawText(
      cleanPdfText(`NODO ${guia.codigo_dependencia || '0054'} - ${guia.nombre_remitente || 'CENTRO DE DESPACHO'}`).slice(0, 46),
      {
        x: 16,
        y: 266,
        size: 8.5,
        font: fontBold,
        color: black,
      }
    );
    page.drawText(
      cleanPdfText(`${guia.direccion_remitente || ''} (${guia.ciudad_remitente_nombre || 'LOCAL'})`).slice(0, 52),
      {
        x: 16,
        y: 254,
        size: 7.5,
        font: fontReg,
        color: black,
      }
    );

    // Recuadro Destinatario en Blanco y Negro (Sin fondo de color, solo borde negro nítido)
    page.drawRectangle({
      x: 12,
      y: 138,
      width: 264,
      height: 104,
      borderColor: black,
      borderWidth: 1.2,
    });

    page.drawText('ENTREGAR A (DESTINATARIO):', {
      x: 18,
      y: 228,
      size: 8,
      font: fontBold,
      color: black,
    });

    page.drawText(cleanPdfText(guia.nombre_destinatario).slice(0, 36), {
      x: 18,
      y: 211,
      size: 11.5,
      font: fontBold,
      color: black,
    });

    page.drawText(`DIRECCION: ${cleanPdfText(guia.direccion_destinatario).slice(0, 38)}`, {
      x: 18,
      y: 193,
      size: 9.5,
      font: fontBold,
      color: black,
    });

    page.drawText(
      `BARRIO: ${cleanPdfText(guia.barrio_destinatario || 'URBANO').slice(0, 22)} | CIUDAD: ${cleanPdfText(guia.ciudad_destinatario_nombre || 'LOCAL').slice(0, 15)}`,
      {
        x: 18,
        y: 177,
        size: 8.5,
        font: fontBold,
        color: black,
      }
    );

    const tel = cleanPdfText(guia.celular_destinatario || guia.telefono_destinatario || 'SIN TELEFONO');
    page.drawText(`TEL / CELULAR: ${tel}   |   DOC: ${cleanPdfText(guia.nit_destinatario || 'N/A')}`, {
      x: 18,
      y: 161,
      size: 8.5,
      font: fontBold,
      color: black,
    });

    page.drawText(
      `CAJAS: ${guia.cant_cajas || 1}   |   PESO: ${guia.peso_kg || 1} KG   |   DIM: ${guia.alto_cm || 0}x${guia.ancho_cm || 0}x${guia.largo_cm || 0} cm`,
      {
        x: 18,
        y: 145,
        size: 7.5,
        font: fontReg,
        color: black,
      }
    );

    // Contenido y Observaciones
    page.drawText(`CONTENIDO: ${cleanPdfText(guia.contenido || 'MERCANCIA GENERAL').slice(0, 48)}`, {
      x: 16,
      y: 122,
      size: 7.5,
      font: fontReg,
      color: black,
    });

    if (guia.observaciones) {
      page.drawText(`OBS: ${cleanPdfText(guia.observaciones).slice(0, 52)}`, {
        x: 16,
        y: 109,
        size: 7,
        font: fontReg,
        color: black,
      });
    }

    // Código de barras estándar ISO/IEC 15417 CODE-128B real (100% escaneable por cualquier pistola láser o celular)
    const code128Pattern = buildCode128BPattern(guia.numero_guia);
    let totalModules = 0;
    for (let i = 0; i < code128Pattern.length; i++) {
      totalModules += Number(code128Pattern[i]);
    }
    // Dejar zona silenciosa (Quiet Zone) amplia a ambos lados para lectura óptica inmediata
    const maxBarcodeWidth = 236;
    const moduleWidth = Math.min(1.45, maxBarcodeWidth / Math.max(1, totalModules));
    const actualBarcodeWidth = totalModules * moduleWidth;
    let cursorX = (288 - actualBarcodeWidth) / 2;

    for (let i = 0; i < code128Pattern.length; i++) {
      const modCount = Number(code128Pattern[i]);
      const elemWidth = modCount * moduleWidth;
      if (i % 2 === 0) {
        // Índices pares son barras negras sólidas; impares son espacios blancos
        page.drawRectangle({
          x: cursorX,
          y: 42,
          width: elemWidth,
          height: 52,
          color: black,
        });
      }
      cursorX += elemWidth;
    }

    const guiaLabelText = cleanPdfText(guia.numero_guia);
    const guiaLabelWidth = fontBold.widthOfTextAtSize(guiaLabelText, 10.5);
    page.drawText(guiaLabelText, {
      x: Math.max(16, (288 - guiaLabelWidth) / 2),
      y: 27,
      size: 10.5,
      font: fontBold,
      color: black,
    });

    const fechaCreacionCol = guia.created_at
      ? nowColombiaDateTimeStr(new Date(guia.created_at))
      : nowColombiaDateTimeStr();

    page.drawText(`Fecha Guia (COL): ${fechaCreacionCol} — MILLA 7 LOGISTICS`, {
      x: 16,
      y: 13,
      size: 6.5,
      font: fontReg,
      color: black,
    });

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);
    const pdfBase64 = pdfBuffer.toString('base64');
    const dynamicLabelUrl = `/api/exito-mensajeria/guias/por-numero/${encodeURIComponent(guia.numero_guia)}/rotulo.pdf`;

    return {
      pdfBuffer,
      pdfBase64,
      dynamicLabelUrl,
    };
  }

  /**
   * Genera la Remisión y Planilla Operativa A4 en memoria RAM (On-Demand) lista para imprimir o visualizar,
   * sin consumir espacio en Google Drive con PDFs generados.
   */
  static async generateRemissionPdfInMemory(params: {
    codigoDocumento: string;
    titulo: string;
    subtitulo: string;
    tipoOperacion: 'SAME_DAY' | 'NEXT_DAY';
    nodoNombre: string;
    placaVehiculo: string;
    nombreConductor: string;
    cedulaConductor?: string;
    responsableTienda?: string;
    observaciones?: string;
    createdAt?: string | Date | null;
    guias: Array<{
      numero_guia: string;
      numero_pedido: string;
      nombre_destinatario: string;
      direccion_destinatario: string;
      barrio_destinatario?: string | null;
      celular_destinatario?: string | null;
      telefono_destinatario?: string | null;
      cant_cajas: number;
      peso_kg?: number;
    }>;
  }): Promise<{ pdfBuffer: Buffer; pdfBase64: string; dynamicUrl: string }> {
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const rowsPerPage = 24;
    const totalPages = Math.max(1, Math.ceil(params.guias.length / rowsPerPage));
    const totalCajas = params.guias.reduce((acc, g) => acc + Number(g.cant_cajas || 1), 0);
    const totalPeso = params.guias.reduce((acc, g) => acc + Number(g.peso_kg || 1), 0);
    const fechaCol = params.createdAt
      ? nowColombiaDateTimeStr(new Date(params.createdAt))
      : nowColombiaDateTimeStr();

    for (let p = 0; p < totalPages; p++) {
      const page = pdfDoc.addPage([595, 842]); // A4 Vertical
      const slice = params.guias.slice(p * rowsPerPage, (p + 1) * rowsPerPage);

      const black = rgb(0, 0, 0);

      // Header en Blanco y Negro puro (0 relleno sólido para ahorro de tinta/tóner)
      page.drawRectangle({
        x: 24,
        y: 760,
        width: 547,
        height: 58,
        borderColor: black,
        borderWidth: 1.5,
      });

      page.drawText(cleanPdfText(params.titulo), {
        x: 34,
        y: 794,
        size: 13,
        font: fontBold,
        color: black,
      });

      page.drawText(
        cleanPdfText(
          `${params.subtitulo}  |  REMISION / PLANILLA: ${params.codigoDocumento}  |  PAG ${p + 1}/${totalPages}`
        ),
        {
          x: 34,
          y: 774,
          size: 8.5,
          font: fontBold,
          color: black,
        }
      );

      // Metadatos del Vehículo, Conductor y Origen
      const metaY = 738;
      page.drawText(`Origen / Nodo: ${cleanPdfText(params.nodoNombre)}`, {
        x: 30,
        y: metaY,
        size: 9,
        font: fontBold,
        color: black,
      });
      page.drawText(`Fecha / Hora (COL): ${fechaCol}`, {
        x: 360,
        y: metaY,
        size: 8.5,
        font: fontBold,
        color: black,
      });
      page.drawText(
        `PLACA VEHICULO: ${cleanPdfText(params.placaVehiculo)}   |   CONDUCTOR: ${cleanPdfText(params.nombreConductor)} ${params.cedulaConductor ? `(CC ${cleanPdfText(params.cedulaConductor)})` : ''}`,
        {
          x: 30,
          y: metaY - 15,
          size: 9.5,
          font: fontBold,
          color: black,
        }
      );
      page.drawText(
        `Total Guias: ${params.guias.length}   |   Total Cajas: ${totalCajas}   |   Peso Total: ${totalPeso.toFixed(1)} kg   |   Operacion: ${params.tipoOperacion}`,
        {
          x: 30,
          y: metaY - 30,
          size: 8.5,
          font: fontReg,
          color: black,
        }
      );

      // Encabezado de tabla en Blanco y Negro (sin relleno gris)
      let y = metaY - 54;
      page.drawRectangle({
        x: 24,
        y: y - 4,
        width: 547,
        height: 19,
        borderColor: black,
        borderWidth: 1,
      });
      page.drawText('#', { x: 28, y: y + 2, size: 7.5, font: fontBold });
      page.drawText('GUIA / PEDIDO', { x: 46, y: y + 2, size: 7.5, font: fontBold });
      page.drawText('DESTINATARIO / TEL', { x: 155, y: y + 2, size: 7.5, font: fontBold });
      page.drawText('BARRIO', { x: 285, y: y + 2, size: 7.5, font: fontBold });
      page.drawText('DIRECCION ENTREGA', { x: 365, y: y + 2, size: 7.5, font: fontBold });
      page.drawText('CJ', { x: 505, y: y + 2, size: 7.5, font: fontBold });
      page.drawText('FIRMA/OK', { x: 528, y: y + 2, size: 7, font: fontBold });

      y -= 18;
      for (let i = 0; i < slice.length; i++) {
        const g = slice[i];
        const idxGlobal = p * rowsPerPage + i + 1;
        const tel = cleanPdfText(g.celular_destinatario || g.telefono_destinatario || '');

        page.drawText(String(idxGlobal), { x: 28, y, size: 7.5, font: fontReg });
        page.drawText(cleanPdfText(`${g.numero_guia} / ${g.numero_pedido}`).slice(0, 24), {
          x: 46,
          y,
          size: 7.5,
          font: fontBold,
        });
        page.drawText(cleanPdfText(`${g.nombre_destinatario} ${tel ? `(${tel})` : ''}`).slice(0, 26), {
          x: 155,
          y,
          size: 7.2,
          font: fontReg,
        });
        page.drawText(cleanPdfText(g.barrio_destinatario || 'URBANO').slice(0, 15), {
          x: 285,
          y,
          size: 7.2,
          font: fontBold,
        });
        page.drawText(cleanPdfText(g.direccion_destinatario).slice(0, 28), {
          x: 365,
          y,
          size: 7.2,
          font: fontReg,
        });
        page.drawText(String(g.cant_cajas || 1), { x: 508, y, size: 7.5, font: fontBold });
        page.drawRectangle({
          x: 530,
          y: y - 2,
          width: 34,
          height: 11,
          borderColor: rgb(0.65, 0.7, 0.78),
          borderWidth: 0.7,
        });

        page.drawLine({
          start: { x: 24, y: y - 4 },
          end: { x: 571, y: y - 4 },
          thickness: 0.4,
          color: rgb(0.88, 0.9, 0.94),
        });
        y -= 22;
      }

      if (params.observaciones && p === totalPages - 1) {
        page.drawText(`Observaciones: ${cleanPdfText(params.observaciones).slice(0, 100)}`, {
          x: 30,
          y: 105,
          size: 8,
          font: fontReg,
        });
      }

      // Firmas pie de página
      page.drawLine({ start: { x: 45, y: 68 }, end: { x: 245, y: 68 }, thickness: 1 });
      page.drawText(`Firma Conductor (${cleanPdfText(params.placaVehiculo)})`, {
        x: 65,
        y: 54,
        size: 8,
        font: fontBold,
      });

      page.drawLine({ start: { x: 335, y: 68 }, end: { x: 535, y: 68 }, thickness: 1 });
      page.drawText('Firma Despachador / Responsable Nodo', {
        x: 350,
        y: 54,
        size: 8,
        font: fontBold,
      });

      page.drawText(`Planilla generada en Hora Oficial de Colombia: ${fechaCol} — MILLA 7 LOGISTICS`, {
        x: 30,
        y: 26,
        size: 6.5,
        font: fontReg,
        color: black,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);
    const pdfBase64 = pdfBuffer.toString('base64');
    const dynamicUrl = `/api/exito-mensajeria/planillas/${encodeURIComponent(params.codigoDocumento)}/pdf`;

    return { pdfBuffer, pdfBase64, dynamicUrl };
  }

  /**
   * Compatibilidad con el flujo de creación de Remisión/Planilla (retorna referencia dinámica On-Demand sin subir PDF a Drive).
   */
  static async generateAndUploadRemissionPdf(params: {
    codigoDocumento: string;
    titulo: string;
    subtitulo: string;
    tipoOperacion: 'SAME_DAY' | 'NEXT_DAY';
    etapaDrive: 'Recogidas' | 'Entregas' | 'Devoluciones';
    tipoEvidencia: 'remision_recogida' | 'remision_ruta' | 'remision_devolucion';
    nodoNombre: string;
    placaVehiculo: string;
    nombreConductor: string;
    responsableTienda?: string;
    observaciones?: string;
    guias: Array<{
      numero_guia: string;
      numero_pedido: string;
      nombre_destinatario: string;
      direccion_destinatario: string;
      barrio_destinatario?: string | null;
      celular_destinatario?: string | null;
      telefono_destinatario?: string | null;
      cant_cajas: number;
      peso_kg?: number;
    }>;
    isSandbox?: boolean;
  }): Promise<DriveUploadResult> {
    const dynamicUrl = `/api/exito-mensajeria/planillas/${encodeURIComponent(params.codigoDocumento)}/pdf`;
    return {
      driveFileId: `ONDEMAND_${params.codigoDocumento}`,
      driveUrl: dynamicUrl,
      drivePath: dynamicUrl,
      mimeType: 'application/pdf',
      extension: 'pdf',
      sizeBytes: 0,
      sha256: '',
    };
  }
}

