/**
 * Script para verificar el estado del servidor WebSocket
 */

(function() {
  // Crear elemento de diagnóstico
  function createDiagnosticBar() {
    const diagnosticBar = document.createElement('div');
    diagnosticBar.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 10px;
      font-size: 12px;
      z-index: 9999;
      display: flex;
      justify-content: space-between;
    `;
    
    const statusInfo = document.createElement('div');
    statusInfo.id = 'server-status-info';
    statusInfo.textContent = 'Verificando servidor...';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'X';
    closeBtn.style.cssText = `
      background: transparent;
      border: 1px solid white;
      color: white;
      cursor: pointer;
      padding: 0 5px;
      margin-left: 10px;
    `;
    closeBtn.onclick = function() {
      document.body.removeChild(diagnosticBar);
    };
    
    diagnosticBar.appendChild(statusInfo);
    diagnosticBar.appendChild(closeBtn);
    
    document.body.appendChild(diagnosticBar);
    return statusInfo;
  }
  
  // Verificar que la página esté completamente cargada
  window.addEventListener('load', () => {
    const statusElement = createDiagnosticBar();
    
    // Verificar si el servidor está respondiendo
    async function checkServer() {
      statusElement.innerHTML = 'Verificando conexión al servidor...';
      
      try {
        // Intentar conectar al WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname || 'localhost';
        const wsUrl = `${protocol}//${host}:3000`;
        
        let testWs = new WebSocket(wsUrl);
        
        testWs.onopen = () => {
          statusElement.innerHTML = `
            <span style="color:#6fff6f">✅ Servidor disponible en ${wsUrl}</span>
            <span style="margin-left:15px">WebSocket abierto correctamente</span>
          `;
          
          // Cerrar la conexión de prueba
          setTimeout(() => {
            testWs.close();
          }, 1000);
        };
        
        testWs.onerror = (error) => {
          statusElement.innerHTML = `
            <span style="color:#ff6f6f">❌ Error al conectar al servidor (${wsUrl})</span>
            <span style="margin-left:15px">Verifica que el servidor esté en ejecución y el puerto 3000 esté disponible</span>
            <button id="retry-connection" style="margin-left:15px;background:#4CAF50;border:none;color:white;padding:5px;cursor:pointer;">Reintentar</button>
          `;
          
          document.getElementById('retry-connection').addEventListener('click', () => {
            // Intentar reiniciar la conexión en el monitor de sensores
            if (window.sensorMonitor) {
              window.sensorMonitor.initWebSocket();
              checkServer();
            }
          });
        };
        
      } catch (error) {
        statusElement.innerHTML = `
          <span style="color:#ff6f6f">❌ Error: ${error.message}</span>
          <span style="margin-left:15px">No se pudo verificar el servidor</span>
        `;
      }
    }
    
    // Ejecutar la verificación
    checkServer();
  });
})();
