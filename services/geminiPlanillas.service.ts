import { GoogleGenerativeAI } from '@google/generative-ai';

class GeminiPlanillasService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;
  private apiKeys: string[] = [];
  private currentKeyIndex = 0;

  init(apiKeysInput: string) {
    if (!apiKeysInput) throw new Error("API Key no proporcionada");

    this.apiKeys = apiKeysInput
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k);
    this.currentKeyIndex = 0;

    if (this.apiKeys.length === 0) throw new Error("No hay claves válidas");

    this._initClient();
  }

  private _initClient() {
    const key = this.apiKeys[this.currentKeyIndex];
    console.log(`[Gemini] Usando API Key índice ${this.currentKeyIndex + 1}/${this.apiKeys.length}`);

    this.genAI = new GoogleGenerativeAI(key);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });
  }

  private _rotateKey() {
    if (this.apiKeys.length <= 1) return false;

    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    console.warn(`[Gemini] Rotando a API Key #${this.currentKeyIndex + 1}...`);
    this._initClient();
    return true;
  }

  async analyzeDocument(fileBuffer: ArrayBuffer, mimeType: string): Promise<any[]> {
    if (!this.genAI) this._initClient();
    
    const prompt = `
      Analiza este DOCUMENTO LOGÍSTICO (planilla de despacho/entrega) y extrae TODOS y CADA UNO de los registros individuales como un JSON.
      
      REGLAS CRÍTICAS DE EXTRACCIÓN (LEER CON CUIDADO):
      1. CADA FILA en la tabla del PDF debe ser un objeto independiente en el arreglo.
      2. IMPORTANTE: La imagen puede estar rotada 90 o 180 grados. Identifica la orientación real del texto para no mezclar columnas con filas.
      3. PROHIBIDO REPETIR VALORES: Cada fila tiene su propio número de Pedido y Cédula. NUNCA copies el pedido o la cédula de la fila anterior a menos que en la imagen sean visualmente idénticos.
      4. Los números de "Pedido" en el Éxito suelen empezar por 16 o 26 (ej. 265793870, 16330320...). Lee dígito por dígito con extrema precisión.
      
      EJEMPLO DE LECTURA (Fíjate cómo cambia cada fila):
      Fila 1: Pedido 1633032041116, Cédula 39268715, Cliente ALBA TERESA
      Fila 2: Pedido 265793871, Cédula 8373907, Cliente ROBERTO BENAVIDES
      Fila 3: Pedido 265793870, Cédula 1045142382, Cliente ORIANA MARIA
      Fila 4: Pedido 265793778, Cédula 1038102053, Cliente Nilton Cesar
      
      Formato OBLIGATORIO: { "matches": [ {objeto} ] }
      
      Campos exactos por cada fila (usa "N/A" si falta):
      - pedido (Número de Factura, Pedido u Orden de Compra específico de ESA FILA)
      - cedula (Documento o NIT del cliente específico de ESA FILA)
      - cliente (Nombre completo del cliente de ESA FILA)
      - plu (Código del producto, PLU, EAN o Material de ESA FILA)
      - articulo (Descripción del artículo de ESA FILA)
      - direccion (Dirección de entrega de ESA FILA)
      - fecha1 (Primera fecha que aparezca en la cabecera o fila)
      - fecha2 (Segunda fecha si existe)
      - ciudad_barrio (Ciudad o barrio)
      - placa (Placa del vehículo asignado a toda la planilla)
      - notas (Observaciones)
    `;

    const base64Data = await this._arrayBufferToBase64(fileBuffer);
    
    const configurations = [
        { model: "gemini-2.5-flash", version: "v1beta" },
        { model: "gemini-2.0-flash", version: "v1beta" },
        { model: "gemini-1.5-pro", version: "v1beta" },
        { model: "gemini-1.5-flash", version: "v1beta" }
    ];

    let retries = 10;
    
    while (retries > 0) {
        if (this.apiKeys.length === 0) throw new Error("No hay API Keys disponibles.");

        const currentKey = this.apiKeys[this.currentKeyIndex];

        for (const config of configurations) {
            try {
                const genAI = new GoogleGenerativeAI(currentKey);
                const modelParams: any = { model: config.model };
                
                if (config.version === 'v1beta') {
                    modelParams.generationConfig = { responseMimeType: "application/json" };
                }

                const activeModel = genAI.getGenerativeModel(modelParams, { 
                    apiVersion: config.version 
                });

                const resultWithTimeout = await Promise.race([
                    activeModel.generateContent([
                        prompt,
                        { inlineData: { data: base64Data, mimeType: mimeType } }
                    ]),
                    new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Timeout de solicitud")), 60000))
                ]);

                const response = await resultWithTimeout.response;
                const text = response.text();
                
                if (!text) throw new Error("Respuesta vacía de Gemini");

                const parsed = JSON.parse(text);
                return parsed.matches || [];

            } catch (error: any) {
                const errorMsg = error.toString().toLowerCase();
                console.warn(`[Gemini] Falló config ${config.model}: ${errorMsg}`);

                if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("limit")) {
                    break; 
                }
                continue;
            }
        }
        
        if (this._rotateKey()) {
            await this._sleep(1000);
            continue;
        } else {
            await this._sleep(10000);
            retries--;
        }
    }

    throw new Error("Se agotaron los intentos. Verifique su API Key o conexión.");
  }

  private _sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async _arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
    // In browser
    if (typeof window !== 'undefined') {
        const blob = new Blob([buffer]);
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = (reader.result as string).split(",")[1];
                resolve(base64);
            };
            reader.readAsDataURL(blob);
        });
    }
    // Fallback if needed
    throw new Error("Not implemented for non-browser");
  }
}

export default new GeminiPlanillasService();
