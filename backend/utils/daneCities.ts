// ─── Catálogo oficial de municipios de Antioquia (código DANE → nombre) ────────
// Fuente: DANE/DIVIPOLA vía datos.gov.co (dataset gdxc-w37w). Los archivos de
// Plan R / Plan Normal a veces traen la ciudad como el código DANE numérico
// (ej. "5001") en vez del nombre — resolveDaneCity() lo convierte al nombre real
// antes de guardarlo, para que Consulta/Exportación no muestren el código crudo.
const DANE_ANTIOQUIA: [string, string][] = [
  ['05001', 'MEDELLÍN'], ['05002', 'ABEJORRAL'], ['05004', 'ABRIAQUÍ'], ['05021', 'ALEJANDRÍA'],
  ['05030', 'AMAGÁ'], ['05031', 'AMALFI'], ['05034', 'ANDES'], ['05036', 'ANGELÓPOLIS'],
  ['05038', 'ANGOSTURA'], ['05040', 'ANORÍ'], ['05042', 'SANTA FE DE ANTIOQUIA'], ['05044', 'ANZÁ'],
  ['05045', 'APARTADÓ'], ['05051', 'ARBOLETES'], ['05055', 'ARGELIA'], ['05059', 'ARMENIA'],
  ['05079', 'BARBOSA'], ['05086', 'BELMIRA'], ['05088', 'BELLO'], ['05091', 'BETANIA'],
  ['05093', 'BETULIA'], ['05101', 'CIUDAD BOLÍVAR'], ['05107', 'BRICEÑO'], ['05113', 'BURITICÁ'],
  ['05120', 'CÁCERES'], ['05125', 'CAICEDO'], ['05129', 'CALDAS'], ['05134', 'CAMPAMENTO'],
  ['05138', 'CAÑASGORDAS'], ['05142', 'CARACOLÍ'], ['05145', 'CARAMANTA'], ['05147', 'CAREPA'],
  ['05148', 'EL CARMEN DE VIBORAL'], ['05150', 'CAROLINA'], ['05154', 'CAUCASIA'], ['05172', 'CHIGORODÓ'],
  ['05190', 'CISNEROS'], ['05197', 'COCORNÁ'], ['05206', 'CONCEPCIÓN'], ['05209', 'CONCORDIA'],
  ['05212', 'COPACABANA'], ['05234', 'DABEIBA'], ['05237', 'DON MATÍAS'], ['05240', 'EBÉJICO'],
  ['05250', 'EL BAGRE'], ['05264', 'ENTRERRÍOS'], ['05266', 'ENVIGADO'], ['05282', 'FREDONIA'],
  ['05284', 'FRONTINO'], ['05306', 'GIRALDO'], ['05308', 'GIRARDOTA'], ['05310', 'GÓMEZ PLATA'],
  ['05313', 'GRANADA'], ['05315', 'GUADALUPE'], ['05318', 'GUARNE'], ['05321', 'GUATAPÉ'],
  ['05347', 'HELICONIA'], ['05353', 'HISPANIA'], ['05360', 'ITAGÜÍ'], ['05361', 'ITUANGO'],
  ['05364', 'JARDÍN'], ['05368', 'JERICÓ'], ['05376', 'LA CEJA'], ['05380', 'LA ESTRELLA'],
  ['05390', 'LA PINTADA'], ['05400', 'LA UNIÓN'], ['05411', 'LIBORINA'], ['05425', 'MACEO'],
  ['05440', 'MARINILLA'], ['05467', 'MONTEBELLO'], ['05475', 'MURINDÓ'], ['05480', 'MUTATÁ'],
  ['05483', 'NARIÑO'], ['05490', 'NECOCLÍ'], ['05495', 'NECHÍ'], ['05501', 'OLAYA'],
  ['05541', 'PEÑOL'], ['05543', 'PEQUE'], ['05576', 'PUEBLORRICO'], ['05579', 'PUERTO BERRÍO'],
  ['05585', 'PUERTO NARE'], ['05591', 'PUERTO TRIUNFO'], ['05604', 'REMEDIOS'], ['05607', 'EL RETIRO'],
  ['05615', 'RIONEGRO'], ['05628', 'SABANALARGA'], ['05631', 'SABANETA'], ['05642', 'SALGAR'],
  ['05647', 'SAN ANDRÉS DE CUERQUÍA'], ['05649', 'SAN CARLOS'], ['05652', 'SAN FRANCISCO'], ['05656', 'SAN JERÓNIMO'],
  ['05658', 'SAN JOSÉ DE LA MONTAÑA'], ['05659', 'SAN JUAN DE URABÁ'], ['05660', 'SAN LUIS'], ['05664', 'SAN PEDRO DE LOS MILAGROS'],
  ['05665', 'SAN PEDRO DE URABÁ'], ['05667', 'SAN RAFAEL'], ['05670', 'SAN ROQUE'], ['05674', 'SAN VICENTE FERRER'],
  ['05679', 'SANTA BÁRBARA'], ['05686', 'SANTA ROSA DE OSOS'], ['05690', 'SANTO DOMINGO'], ['05697', 'EL SANTUARIO'],
  ['05736', 'SEGOVIA'], ['05756', 'SONSÓN'], ['05761', 'SOPETRÁN'], ['05789', 'TÁMESIS'],
  ['05790', 'TARAZÁ'], ['05792', 'TARSO'], ['05809', 'TITIRIBÍ'], ['05819', 'TOLEDO'],
  ['05837', 'TURBO'], ['05842', 'URAMITA'], ['05847', 'URRAO'], ['05854', 'VALDIVIA'],
  ['05856', 'VALPARAÍSO'], ['05858', 'VEGACHÍ'], ['05861', 'VENECIA'], ['05873', 'VIGÍA DEL FUERTE'],
  ['05885', 'YALÍ'], ['05887', 'YARUMAL'], ['05890', 'YOLOMBÓ'], ['05893', 'YONDÓ'],
  ['05895', 'ZARAGOZA'],
];

const DANE_CODE_TO_NAME: Record<string, string> = {};
for (const [code, name] of DANE_ANTIOQUIA) {
  DANE_CODE_TO_NAME[code] = name;
  DANE_CODE_TO_NAME[String(Number(code))] = name; // también sin cero a la izquierda ("5001")
}

/**
 * Si `raw` es un código DANE numérico conocido (con o sin cero a la izquierda),
 * devuelve el nombre real del municipio. Si no es un código reconocido, devuelve
 * `raw` tal cual (recortado), para no alterar ciudades que ya llegan con su nombre.
 */
export function resolveDaneCity(raw: any): string {
  const str = String(raw ?? '').trim();
  if (!str) return str;
  if (/^\d{3,5}$/.test(str)) {
    const resolved = DANE_CODE_TO_NAME[str] || DANE_CODE_TO_NAME[str.padStart(5, '0')];
    if (resolved) return resolved;
  }
  return str;
}
