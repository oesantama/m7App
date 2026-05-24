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
      Analiza esta planilla de despacho y extrae TODOS los registros en formato JSON.
      Actúa exactamente igual que cuando te piden "extraer pedidos en una tabla".
      
      REGLAS DE EXTRACCIÓN:
      1. Extrae CADA FILA de la tabla como un objeto independiente. No omitas NINGÚN registro. Si hay 13 pedidos, deben haber 13 objetos.
      2. Mapea la información de forma lógica, asignando a cada cliente su PLU y Descripción correspondiente según el orden natural del documento.
      3. Si un cliente tiene la celda de PLU o Descripción vacía o con un error como "#¿NOMBRE?", deja el valor en la respuesta JSON como un string vacío (""). NO uses "N/A".
      4. Si el Pedido y la Cédula están pegados (ej. "163352206107970043502"), el Pedido son los primeros ~13 dígitos y la Cédula el resto.
      5. Limpia el número de pedido: quita prefijos como "E-com" o guiones. Solo devuelve los números.
      6. Los PLU son siempre números positivos. Ignora guiones iniciales (ej. "-3698640" es "3698640").
      
      Formato OBLIGATORIO de salida: { "matches": [ {objeto} ] }
      Fila 1 (E-com 1633032041116): Pedido 1633032041116, Cédula 39268715, Cliente ALBA TERESA
      Fila 2 (D 39107413): Pedido 39107413, Cédula 187311634, Cliente JUNEYLIS CONTRERAS
      Fila 3 (E-con1632842035073): Pedido 1632842035073, Cédula 39411102, Cliente diana piedrahita
      
      Formato OBLIGATORIO: { "matches": [ {objeto} ] }
      
      Campos exactos por cada fila (usa "N/A" si falta):
      - pedido (SOLO NÚMEROS, sin letras "E-com" ni guiones)
      - cedula (Documento o NIT del cliente específico de ESA FILA)
      - cliente (Nombre completo del cliente de ESA FILA)
      - plu (SOLO NÚMERO POSITIVO, sin signos negativos)
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

                let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(cleanText);
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
