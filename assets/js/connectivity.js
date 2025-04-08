/**
 * Monitoreo y recuperación de la conexión WebSocket
 */
(function() {
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const RECONNECT_INTERVAL = 3000; // 3 segundos
  
  // Verificar estado de conexión de forma periódica
  function startConnectionMonitor() {
    setInterval(() => {
      if (!window.sensorMonitor) return;
      
      const ws = window.sensorMonitor.ws;
      
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        handleDisconnection();
      } else if (ws.readyState === WebSocket.OPEN) {
        // Conexión activa, restablecer contador de intentos
        reconnectAttempts = 0;
      }
    }, RECONNECT_INTERVAL);
  }
  
  // Manejar desconexiones
  function handleDisconnection() {
    console.log(`[Connectivity] Detectada desconexión. Intento ${reconnectAttempts + 1} de ${MAX_RECONNECT_ATTEMPTS}`);
    
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      
      // Intentar reconectar
      if (window.sensorMonitor && typeof window.sensorMonitor.initWebSocket === 'function') {
        console.log('[Connectivity] Intentando reconexión...');
        window.sensorMonitor.initWebSocket();
      }
    } else {
      console.log('[Connectivity] Máximo de intentos alcanzado, se requiere intervención manual');
      showReconnectPrompt();
    }
  }
  
  // Mostrar opción para reconexión manual
  function showReconnectPrompt() {
    // Verificar si ya existe el prompt
    if (document.getElementById('reconnect-prompt')) return;
    
    const promptDiv = document.createElement('div');
    promptDiv.id = 'reconnect-prompt';
    promptDiv.style.cssText = `
      position: fixed;
      bottom: 15px;
      left: 15px;
      background-color: rgba(0,0,0,0.8);
      color: white;
      padding: 15px;
      border-radius: 5px;
      z-index: 9999;
      max-width: 300px;
    `;
    
    promptDiv.innerHTML = `
      <p><strong>Problemas de conexión</strong></p>
      <p>No se ha podido establecer la comunicación con el servidor.</p>
      <div class="d-flex justify-content-between">
        <button id="reconnect-btn" class="btn btn-sm btn-primary">Reconectar</button>
        <button id="dismiss-btn" class="btn btn-sm btn-outline-light ms-2">Cerrar</button>
      </div>
    `;
    
    document.body.appendChild(promptDiv);
    
    // Manejadores de eventos
    document.getElementById('reconnect-btn').addEventListener('click', () => {
      reconnectAttempts = 0; // Reiniciar contador
      if (window.sensorMonitor) {
        window.sensorMonitor.initWebSocket();
      }
      promptDiv.remove();
    });
    
    document.getElementById('dismiss-btn').addEventListener('click', () => {
      promptDiv.remove();
    });
  }
  
  // Detectar cambios en la conexión a Internet
  window.addEventListener('online', () => {
    console.log('[Connectivity] Conexión de red recuperada. Intentando reconexión...');
    reconnectAttempts = 0;
    if (window.sensorMonitor) {
      setTimeout(() => {
        window.sensorMonitor.initWebSocket();
      }, 1000);
    }
  });
  
  // Iniciar monitoreo cuando se cargue la página
  window.addEventListener('load', startConnectionMonitor);
})();
