/**
 * Herramienta para simular datos de sensores (activar con F2)
 */
(function() {
  let simulationRunning = false;
  let simulationInterval = null;
  
  // Crear panel de pruebas
  function createTestPanel() {
    const panel = document.createElement('div');
    panel.id = 'test-panel';
    panel.style.cssText = `
      position: fixed;
      top: 70px;
      right: 20px;
      width: 220px;
      background: rgba(0, 0, 0, 0.8);
      border-radius: 8px;
      padding: 15px;
      color: white;
      z-index: 9999;
      font-size: 12px;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
      display: none;
    `;
    
    panel.innerHTML = `
      <h6 class="text-white">Panel de pruebas</h6>
      <hr style="margin: 8px 0; border-color: #666;">
      
      <div class="mb-2">
        <button id="sim-temp" class="btn btn-sm btn-info w-100 mb-2">
          Simular temperatura
        </button>
        <button id="sim-intensity" class="btn btn-sm btn-danger w-100">
          Simular intensidad
        </button>
      </div>
      
      <div class="form-check form-switch ps-0 mt-3">
        <input class="form-check-input ms-auto" type="checkbox" id="auto-sim">
        <label class="form-check-label text-white ms-3 text-sm" for="auto-sim">
          Simulación automática
        </label>
      </div>
      
      <div class="mt-3">
        <label class="text-white d-block text-sm mb-1">Intervalo (ms)</label>
        <input type="range" class="form-range" id="sim-interval" min="500" max="5000" step="100" value="1000">
        <div class="d-flex justify-content-between">
          <span class="text-xs">500ms</span>
          <span id="interval-value" class="text-xs">1000ms</span>
          <span class="text-xs">5s</span>
        </div>
      </div>
      
      <div class="mt-3">
        <label class="text-white d-block text-sm mb-1">Comandos</label>
        <div class="input-group input-group-sm">
          <input type="text" id="test-command" class="form-control" placeholder="Comando">
          <button id="send-cmd" class="btn btn-sm btn-primary">Enviar</button>
        </div>
      </div>
      
      <hr style="margin: 10px 0; border-color: #666;">
      <small class="text-white-50">Presione F2 para ocultar</small>
    `;
    
    document.body.appendChild(panel);
    return panel;
  }
  
  // Configurar eventos del panel de prueba
  function setupTestPanel(panel) {
    // Botón simular temperatura
    document.getElementById('sim-temp').addEventListener('click', () => {
      if (!window.sensorMonitor) return;
      
      const value = Math.random() * 10 + 25; // 25-35°C
      window.sensorMonitor.processTemperatureData({
        type: 'temperature',
        value: value
      });
      console.log(`[Test] Temperatura simulada: ${value.toFixed(2)}°C`);
    });
    
    // Botón simular intensidad
    document.getElementById('sim-intensity').addEventListener('click', () => {
      if (!window.sensorMonitor) return;
      
      const value = Math.random() * 100; // 0-100%
      window.sensorMonitor.processWeightData({
        type: 'weight',
        value: value
      });
      console.log(`[Test] Intensidad simulada: ${value.toFixed(2)}%`);
    });
    
    // Control de simulación automática
    document.getElementById('auto-sim').addEventListener('change', (e) => {
      if (e.target.checked) {
        startSimulation();
      } else {
        stopSimulation();
      }
    });
    
    // Control de intervalo
    const intervalSlider = document.getElementById('sim-interval');
    const intervalValue = document.getElementById('interval-value');
    
    intervalSlider.addEventListener('input', (e) => {
      intervalValue.textContent = `${e.target.value}ms`;
      
      if (simulationRunning) {
        // Actualizar intervalo en tiempo real
        stopSimulation();
        startSimulation();
      }
    });
    
    // Enviar comando personalizado
    document.getElementById('send-cmd').addEventListener('click', () => {
      const cmd = document.getElementById('test-command').value.trim();
      if (cmd && window.sensorMonitor) {
        window.sensorMonitor.sendCommand(cmd);
        console.log(`[Test] Comando enviado: ${cmd}`);
        document.getElementById('test-command').value = '';
      }
    });
    
    // También permitir enviar con Enter
    document.getElementById('test-command').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('send-cmd').click();
      }
    });
  }
  
  // Iniciar simulación automática
  function startSimulation() {
    if (simulationRunning) return;
    
    const interval = parseInt(document.getElementById('sim-interval').value);
    simulationRunning = true;
    
    console.log(`[Test] Iniciando simulación automática cada ${interval}ms`);
    
    simulationInterval = setInterval(() => {
      if (!window.sensorMonitor) return;
      
      // Simular temperatura
      const tempValue = Math.random() * 10 + 25; // 25-35°C
      window.sensorMonitor.processTemperatureData({
        type: 'temperature',
        value: tempValue
      });
      
      // Simular intensidad
      const intensityValue = Math.random() * 100; // 0-100%
      window.sensorMonitor.processWeightData({
        type: 'weight',
        value: intensityValue
      });
    }, interval);
  }
  
  // Detener simulación
  function stopSimulation() {
    if (!simulationRunning) return;
    
    clearInterval(simulationInterval);
    simulationInterval = null;
    simulationRunning = false;
    
    console.log('[Test] Simulación automática detenida');
  }
  
  // Alternar visibilidad del panel con F2
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      const panel = document.getElementById('test-panel') || createTestPanel();
      
      if (panel.style.display === 'none') {
        panel.style.display = 'block';
        if (!panel.initialized) {
          setupTestPanel(panel);
          panel.initialized = true;
        }
      } else {
        panel.style.display = 'none';
        // Detener simulación al ocultar
        if (simulationRunning) {
          document.getElementById('auto-sim').checked = false;
          stopSimulation();
        }
      }
    }
  });
  
  // Mensaje de ayuda en consola
  console.log('[Test] Presione F2 para mostrar el panel de pruebas');
})();
