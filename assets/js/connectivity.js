// Monitor de conectividad WebSocket
(() => {
  // Variables de control
  let connectionAttempts = 0;
  const MAX_RETRY = 5;
  let reconnectTimer = null;

  // Función para verificar el estado de la conexión
  function checkConnection() {
    if (window.sensorMonitor && window.sensorMonitor.ws) {
      const ws = window.sensorMonitor.ws;
      
      if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        console.log("[Connectivity] WebSocket cerrado o cerrándose");
        connectionAttempts++;
        
        if (connectionAttempts <= MAX_RETRY) {
          console.log(`[Connectivity] Reiniciando conexión (intento ${connectionAttempts})`);
          
          // Inicializar de nuevo el WebSocket
          try {
            window.sensorMonitor.initWebSocket();
          } catch (err) {
            console.error("[Connectivity] Error al reconectar:", err);
          }
        } else {
          console.log("[Connectivity] Máximo de intentos alcanzado, esperando...");
          
          // Resetear contador y esperar más tiempo
          connectionAttempts = 0;
          
          // Realizar un nuevo intento después de un tiempo más largo
          setTimeout(() => {
            if (window.sensorMonitor) {
              window.sensorMonitor.initWebSocket();
            }
          }, 10000); // 10 segundos
        }
      } else if (ws.readyState === WebSocket.OPEN) {
        // Resetear contador si la conexión está activa
        connectionAttempts = 0;
      }
    }
  }

  // Iniciar monitoreo cuando el DOM esté listo
  window.addEventListener('load', () => {
    console.log("[Connectivity] Iniciando monitor de conectividad");
    
    // Iniciar verificación periódica
    reconnectTimer = setInterval(checkConnection, 5000); // Verificar cada 5 segundos
    
    // Escuchar evento de recuperación de red
    window.addEventListener('online', () => {
      console.log("[Connectivity] Conexión a Internet recuperada");
      
      // Intentar reconectar si hay un sensor monitor
      if (window.sensorMonitor) {
        window.sensorMonitor.initWebSocket();
      }
    });
  });

  // Limpiar al cerrar la página
  window.addEventListener('beforeunload', () => {
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
    }
  });
})();
