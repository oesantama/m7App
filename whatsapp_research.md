# Investigación: Automatización de WhatsApp (Modo Gratuito)

He analizado las opciones para enviar mensajes de WhatsApp de forma automática sin incurrir en costos de APIs externas (como Twilio o Meta Oficial).

## Opción Recomendada: `whatsapp-web.js`

Esta es una librería de Node.js que emula una sesión de **WhatsApp Web** en segundo plano (headless).

### Ventajas

- **100% Gratuita**: No requiere pagos por mensaje ni suscripciones.
- **Automática**: Permite disparar mensajes desde el backend de Milla 7 ante eventos específicos.
- **Sin Links**: El mensaje llega directamente al usuario sin que este tenga que hacer clic en una URL de "whatsapp.me".

### Desafíos Técnicos (Consideraciones)

1.  **Escaneo de QR**: Al iniciar el servidor por primera vez, el sistema generará un código QR en los logs (o una URL temporal). Debes escanearlo con un teléfono desde la opción "Vincular dispositivo".
2.  **Sesión**: La sesión debe persistir en el servidor. En entornos Docker (Cloud), se requiere configurar un volumen para no perder la sesión al reiniciar.
3.  **Riesgo de Bloqueo**: Si envías cientos de mensajes a números que no te tienen guardado, WhatsApp podría identificarlo como SPAM. Para uso logístico moderado, es seguro.

### Alternativa Profesional: Meta Cloud API (1k mensajes gratis/mes)

Meta ofrece los primeros 1,000 "conversations" gratis al mes. Es oficial y más estable, pero requiere un proceso de validación de negocio y configuración de una App en su portal de desarrolladores.

---

**Propuesta de Implementación en Milla 7:**
Podemos instalar un módulo que cada vez que el servidor arranque, genere un QR en la consola de Coolify/Docker. Una vez vinculado, la función `sendWhatsApp(number, text)` estará disponible.

¿Deseas que proceda con la instalación de `whatsapp-web.js` para esta funcionalidad?
