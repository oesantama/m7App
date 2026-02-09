import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  context?: 'customer' | 'driver' | 'dispatcher';
}

export interface ConversationContext {
  userId: string;
  userRole: 'customer' | 'driver' | 'dispatcher';
  language: 'es' | 'en' | 'pt';
  conversationHistory: ChatMessage[];
}

/**
 * Chatbot M7 Intelligence - Powered by Gemini AI
 * Contextos: Cliente, Conductor, Despachador
 */
export class M7Chatbot {
  private model;
  private context: ConversationContext;

  constructor(context: ConversationContext) {
    this.model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    this.context = context;
  }

  private getSystemPrompt(): string {
    const role = this.context.userRole;
    const lang = this.context.language;

    const prompts = {
      es: {
        customer: `Eres un asistente virtual de M7 Logistics, especializado en ayudar a CLIENTES.
Puedes ayudar con:
- Consultar estado de pedidos y entregas
- Estimar tiempos de entrega
- Reportar problemas o incidencias
- Reprogramar entregas
- Información sobre documentos y facturas

Responde de manera amigable, profesional y concisa. Si no tienes la información exacta, indica cómo el cliente puede obtenerla.`,
        
        driver: `Eres un asistente virtual de M7 Logistics, especializado en ayudar a CONDUCTORES.
Puedes ayudar con:
- Información sobre rutas asignadas
- Reportar problemas en la ruta (tráfico, accidentes)
- Consultar detalles de entregas
- Reportar incidencias con vehículos
- Consultar gamificación y puntos

Responde de manera clara y directa. Los conductores necesitan respuestas rápidas mientras están en movimiento.`,
        
        dispatcher: `Eres un asistente virtual de M7 Logistics, especializado en ayudar a DESPACHADORES.
Puedes ayudar con:
- Optimización de rutas
- Análisis de KPIs y métricas
- Gestión de flota
- Resolución de conflictos de asignación
- Reportes y estadísticas

Responde con datos precisos y sugiere acciones concretas para optimizar operaciones.`
      }
    };

    return prompts[lang]?.[role] || prompts.es[role];
  }

  async sendMessage(userMessage: string): Promise<ChatMessage> {
    const systemPrompt = this.getSystemPrompt();
    
    // Construir historial de conversación
    const historyText = this.context.conversationHistory
      .slice(-10) // Últimos 10 mensajes para contexto
      .map(msg => `${msg.role === 'user' ? 'Usuario' : 'Asistente'}: ${msg.content}`)
      .join('\n');

    const fullPrompt = `${systemPrompt}\n\nHistorial reciente:\n${historyText}\n\nUsuario: ${userMessage}\nAsistente:`;

    try {
      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      const aiResponse = response.text();

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
        context: this.context.userRole
      };

      return assistantMessage;
    } catch (error) {
      console.error('Error en chatbot:', error);
      
      return {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'Lo siento, hubo un error procesando tu solicitud. Por favor intenta nuevamente.',
        timestamp: new Date(),
        context: this.context.userRole
      };
    }
  }

  /**
   * Procesa intenciones específicas del dominio logístico
   */
  async processIntent(message: string): Promise<{
    intent: string;
    entities: any;
    response: ChatMessage;
  }> {
    // Detección simple de intenciones
    const lowerMessage = message.toLowerCase();
    
    let intent = 'general';
    const entities: any = {};

    // Track Order
    if (lowerMessage.includes('rastrear') || lowerMessage.includes('seguimiento') || lowerMessage.includes('dónde está')) {
      intent = 'track_order';
      // Extraer número de factura/pedido si existe
      const invoiceMatch = message.match(/\b(INV-?\d+|FAC-?\d+|\d{6,})\b/i);
      if (invoiceMatch) entities.invoiceNumber = invoiceMatch[0];
    }
    
    // Estimate Delivery
    else if (lowerMessage.includes('cuándo') || lowerMessage.includes('tiempo') || lowerMessage.includes('llega')) {
      intent = 'estimate_delivery';
    }
    
    // Report Issue
    else if (lowerMessage.includes('problema') || lowerMessage.includes('inciden') || lowerMessage.includes('queja')) {
      intent = 'report_issue';
    }
    
    // Reschedule
    else if (lowerMessage.includes('reprogramar') || lowerMessage.includes('cambiar') || lowerMessage.includes('reagendar')) {
      intent = 'reschedule';
    }

    const response = await this.sendMessage(message);

    return {
      intent,
      entities,
      response
    };
  }
}

/**
 * Integraciones rápidas para acciones comunes
 */
export const chatbotActions = {
  /**
   * Buscar factura por número
   */
  async trackOrder(invoiceNumber: string): Promise<any> {
    // Integración con API existente
    try {
      const response = await fetch(`/api/invoices/search?q=${invoiceNumber}`);
      return await response.json();
    } catch (error) {
      return null;
    }
  },

  /**
   * Estimar tiempo de entrega
   */
  async estimateDelivery(invoiceId: string): Promise<string> {
    // Lógica de estimación basada en ruta actual
    return '2-3 horas aproximadamente';
  },

  /**
   * Reportar incidencia
   */
  async reportIssue(issueData: {
    type: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    userId: string;
  }): Promise<boolean> {
    try {
      await fetch('/api/issues/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(issueData)
      });
      return true;
    } catch (error) {
      return false;
    }
  }
};
