// Script para monitoreo de la conexión WebSocket
(function() {
  // Variables de control
  let connectionAttempts = 0;
  const MAX_RETRY = 5;
  let reconnectTimer = null;
  
  // Función para verificar el estado de la conexión
  function checkConnection() {
    if (window.sensorMonitor && window.sensorMonitor.ws) {
      if (window.sensorMonitor.ws.readyState === WebSocket.CLOSED || 
          window.sensorMonitor.ws.readyState === WebSocket.CLOSING) {
        
        console.log("[Connectivity] Detectada conexión cerrada");
        connectionAttempts++;
        
        if (connectionAttempts <= MAX_RETRY) {
          console.log(`[Connectivity] Reiniciando conexión (intento ${connectionAttempts})`);
          window.sensorMonitor.initWebSocket();
        } else {
          console.log("[Connectivity] Máximo de intentos alcanzado");
          
          // Reiniciar después de un tiempo más largo
          setTimeout(() => {
            connectionAttempts = 0;
            window.sensorMonitor.initWebSocket();
          }, 10000);
        }
      } else if (window.sensorMonitor.ws.readyState === WebSocket.OPEN) {
        connectionAttempts = 0; // Resetear contador cuando hay conexión
        console.log("[Connectivity] Conexión activa");
      }
    }
  }
  
  // Verificar periódicamente
  window.addEventListener('load', () => {
    // Comenzar verificación después de 5 segundos
    setTimeout(() => {
      reconnectTimer = setInterval(checkConnection, 5000);
    }, 5000);
  });
  
  // Cuando la red vuelve después de estar desconectada
  window.addEventListener('online', () => {
    console.log("[Connectivity] Red disponible, intentando reconexión");
    if (window.sensorMonitor) {
      window.sensorMonitor.initWebSocket();
    }
  });
  
  // Limpiar al cerrar
  window.addEventListener('beforeunload', () => {
    if (reconnectTimer) clearInterval(reconnectTimer);
  });
})();
