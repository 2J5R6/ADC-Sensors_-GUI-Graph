/**
 * Script para verificar la conexión con el servidor WebSocket
 */
(function() {
  // Función para comprobar la conexión WebSocket
  function checkServerConnection() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = 3000; // Puerto fijo del servidor
    const wsUrl = `${protocol}//${host}:${port}`;
    
    console.log(`[ServerCheck] Verificando conexión a ${wsUrl}`);
    
    try {
      const testWs = new WebSocket(wsUrl);
      
      // Timeout para cerrar si no se establece la conexión
      const connectionTimeout = setTimeout(() => {
        testWs.close();
        showConnectionError(`Timeout al conectar a ${wsUrl}`);
      }, 5000);
      
      testWs.onopen = () => {
        console.log(`[ServerCheck] Conexión exitosa a ${wsUrl}`);
        clearTimeout(connectionTimeout);
        testWs.close();
      };
      
      testWs.onerror = () => {
        clearTimeout(connectionTimeout);
        showConnectionError(`No se puede conectar a ${wsUrl}`);
      };
    } catch (err) {
      console.error('[ServerCheck] Error al verificar servidor:', err);
      showConnectionError(err.message);
    }
  }
  
  // Mostrar error de conexión con indicaciones
  function showConnectionError(errorMsg) {
    console.error(`[ServerCheck] Error de conexión: ${errorMsg}`);
    
    // Solo mostrar el mensaje si no está ya visible
    if (!document.getElementById('server-connection-error')) {
      const errorDiv = document.createElement('div');
      errorDiv.id = 'server-connection-error';
      errorDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background-color: #f5365c;
        color: white;
        text-align: center;
        padding: 10px;
        font-size: 14px;
        z-index: 9999;
      `;
      
      errorDiv.innerHTML = `
        <strong>Error de conexión al servidor WebSocket:</strong>
        <div>${errorMsg}</div>
        <div style="margin-top: 5px">
          Asegúrese de que el servidor esté en ejecución en el puerto 3000 y 
          <button onclick="window.location.reload()" class="btn btn-sm btn-light mt-2">
            Intente recargar la página
          </button>
        </div>
      `;
      
      document.body.insertBefore(errorDiv, document.body.firstChild);
    }
  }
  
  // Ejecutar la verificación cuando se carge la página
  window.addEventListener('load', () => {
    setTimeout(checkServerConnection, 1000);
  });
})();
