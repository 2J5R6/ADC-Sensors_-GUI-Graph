/**
 * Diagnóstico para sensores y configuración
 * Se puede activar presionando F3
 */
(function() {
  let diagnosticsVisible = false;
  
  // Crear panel de diagnóstico
  function createDiagnosticsPanel() {
    const panel = document.createElement('div');
    panel.id = 'sensor-diagnostics';
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: rgba(52, 58, 64, 0.9);
      color: white;
      padding: 15px;
      border-radius: 8px;
      z-index: 9999;
      font-family: monospace;
      width: 500px;
      max-height: 70vh;
      overflow-y: auto;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      display: none;
    `;
    
    panel.innerHTML = `
      <h5>Diagnóstico de Sensores</h5>
      <div class="mb-2 d-flex justify-content-between">
        <button id="diag-stop" class="btn btn-sm btn-danger">Detener</button>
        <button id="diag-start" class="btn btn-sm btn-success">Iniciar</button>
        <button id="diag-status" class="btn btn-sm btn-info">Status</button>
        <button id="diag-reset" class="btn btn-sm btn-warning">Reset</button>
      </div>
      
      <div class="mb-3">
        <h6>Comandos directos:</h6>
        <div class="input-group input-group-sm">
          <input type="text" id="diag-command" class="form-control" placeholder="Comando">
          <button id="diag-send" class="btn btn-sm btn-primary">Enviar</button>
        </div>
      </div>
      
      <div>
        <h6>Estado del sistema:</h6>
        <div id="diag-state" style="background:#212529;padding:8px;font-size:11px;border-radius:4px;"></div>
      </div>
      
      <div class="mt-3">
        <h6>Actividad de sensores:</h6>
        <div class="row">
          <div class="col-6">
            <div><strong>Temperatura</strong></div>
            <div id="diag-temp-activity">-</div>
          </div>
          <div class="col-6">
            <div><strong>Intensidad</strong></div>
            <div id="diag-weight-activity">-</div>
          </div>
        </div>
      </div>
      
      <div class="mt-3">
        <h6>Log:</h6>
        <div id="diag-log" style="background:#212529;height:100px;overflow-y:auto;padding:8px;font-size:11px;border-radius:4px;"></div>
      </div>
    `;
    
    document.body.appendChild(panel);
    return panel;
  }
  
  // Configurar eventos para el panel
  function setupDiagnosticsPanelEvents() {
    // Botón de detener
    document.getElementById('diag-stop').addEventListener('click', () => {
      if (window.sensorMonitor) {
        window.sensorMonitor.sendCommand('b');
        logDiag('Enviado comando: DETENER');
      }
    });
    
    // Botón de iniciar
    document.getElementById('diag-start').addEventListener('click', () => {
      if (window.sensorMonitor) {
        window.sensorMonitor.sendCommand('a');
        logDiag('Enviado comando: INICIAR');
      }
    });
    
    // Botón de status
    document.getElementById('diag-status').addEventListener('click', () => {
      if (window.sensorMonitor) {
        window.sensorMonitor.sendCommand('STATUS');
        logDiag('Enviado comando: STATUS');
      }
    });
    
    // Botón de reset (secuencia de configuración por defecto)
    document.getElementById('diag-reset').addEventListener('click', () => {
      if (window.sensorMonitor) {
        // Primero detener
        window.sensorMonitor.sendCommand('b');
        logDiag('⏹️ Deteniendo adquisición...');
        
        // Luego enviar comandos de reset en secuencia
        setTimeout(() => {
          window.sensorMonitor.sendCommand('T1:1');
          logDiag('🔄 Reseteando tiempo de temperatura...');
        }, 1000);
        
        setTimeout(() => {
          window.sensorMonitor.sendCommand('T2:1');
          logDiag('🔄 Reseteando tiempo de intensidad...');
        }, 2000);
        
        setTimeout(() => {
          window.sensorMonitor.sendCommand('TU:s');
          logDiag('🔄 Reseteando unidad de tiempo...');
        }, 3000);
        
        setTimeout(() => {
          window.sensorMonitor.sendCommand('FT:0');
          logDiag('🔄 Desactivando filtro de temperatura...');
        }, 4000);
        
        setTimeout(() => {
          window.sensorMonitor.sendCommand('FP:0');
          logDiag('🔄 Desactivando filtro de intensidad...');
        }, 5000);
        
        setTimeout(() => {
          window.sensorMonitor.sendCommand('a');
          logDiag('▶️ Reiniciando adquisición...');
        }, 6000);
      }
    });
    
    // Enviar comando personalizado
    document.getElementById('diag-send').addEventListener('click', () => {
      const cmd = document.getElementById('diag-command').value.trim();
      if (cmd && window.sensorMonitor) {
        window.sensorMonitor.sendCommand(cmd);
        logDiag(`Enviado comando personalizado: ${cmd}`);
        document.getElementById('diag-command').value = '';
      }
    });
    
    // También permitir enviar con Enter
    document.getElementById('diag-command').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('diag-send').click();
      }
    });
  }
  
  // Registrar información en el log
  function logDiag(message) {
    const logEl = document.getElementById('diag-log');
    if (logEl) {
      const now = new Date().toLocaleTimeString();
      logEl.innerHTML += `<div>[${now}] ${message}</div>`;
      logEl.scrollTop = logEl.scrollHeight;
    }
  }
  
  // Actualizar información del estado
  function updateDiagnosticsState() {
    if (!diagnosticsVisible) return;
    
    // Actualizar estado del sistema
    if (window.sensorMonitor) {
      const stateEl = document.getElementById('diag-state');
      const state = {
        isRunning: window.sensorMonitor.isRunning,
        tempFilter: document.getElementById('temp-filter').checked,
        weightFilter: document.getElementById('weight-filter').checked,
        tempSampleTime: document.getElementById('temp-sample-time').value,
        weightSampleTime: document.getElementById('weight-sample-time').value,
        timeUnit: document.getElementById('time-unit').value,
        tempSamples: document.getElementById('temp-filter-samples').value,
        weightSamples: document.getElementById('weight-filter-samples').value
      };
      
      stateEl.innerHTML = `<pre>${JSON.stringify(state, null, 2)}</pre>`;
      
      // Actualizar actividad de sensores
      const tempVal = document.getElementById('temp-value').textContent;
      const weightVal = document.getElementById('weight-value').textContent;
      
      document.getElementById('diag-temp-activity').textContent = tempVal;
      document.getElementById('diag-weight-activity').textContent = weightVal;
    }
  }
  
  // Función para mostrar/ocultar el panel
  function toggleDiagnosticsPanel() {
    const panel = document.getElementById('sensor-diagnostics') || createDiagnosticsPanel();
    
    diagnosticsVisible = !diagnosticsVisible;
    panel.style.display = diagnosticsVisible ? 'block' : 'none';
    
    if (diagnosticsVisible && !panel.eventsConfigured) {
      setupDiagnosticsPanelEvents();
      panel.eventsConfigured = true;
      
      // Iniciar actualización periódica
      setInterval(updateDiagnosticsState, 1000);
    }
  }
  
  // Activar con tecla F3
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F3') {
      toggleDiagnosticsPanel();
    }
  });
  
  // Exponer función globalmente
  window.toggleSensorDiagnostics = toggleDiagnosticsPanel;
  
  // Mostrar instrucciones en consola
  console.log('📊 Presiona F3 para mostrar/ocultar diagnósticos de sensores');
})();
