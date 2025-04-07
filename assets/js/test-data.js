/**
 * Script para simular datos de sensores y probar la interfaz
 */

// Esperar a que el DOM esté listo y el monitor de sensores inicializado
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    // Verificar que el monitor de sensores esté disponible
    if (!window.sensorMonitor) {
      console.error('No se pudo encontrar el monitor de sensores');
      return;
    }
    
    console.log('Herramienta de prueba de datos inicializada');
    
    // Crear botones de prueba
    const testDiv = document.createElement('div');
    testDiv.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 9999;
      background-color: rgba(0,0,0,0.7);
      border-radius: 5px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    `;
    
    // Botón para simular dato de temperatura
    const tempButton = document.createElement('button');
    tempButton.textContent = 'Simular Temperatura';
    tempButton.classList.add('btn', 'btn-sm', 'btn-info');
    tempButton.addEventListener('click', () => {
      const value = 25 + Math.random() * 10 - 5; // 20-30°C
      window.sensorMonitor.processTemperatureData({
        type: 'temperature', 
        value: value
      });
      console.log(`Temperatura simulada: ${value.toFixed(2)}°C`);
    });
    
    // Botón para simular dato de intensidad
    const intensityButton = document.createElement('button');
    intensityButton.textContent = 'Simular Intensidad';
    intensityButton.classList.add('btn', 'btn-sm', 'btn-danger');
    intensityButton.addEventListener('click', () => {
      const value = Math.random() * 100; // 0-100%
      window.sensorMonitor.processWeightData({
        type: 'weight', 
        value: value
      });
      console.log(`Intensidad simulada: ${value.toFixed(2)}%`);
    });
    
    // Botón para alternar adquisición
    const toggleButton = document.createElement('button');
    toggleButton.textContent = 'Alternar Adquisición';
    toggleButton.classList.add('btn', 'btn-sm', 'btn-success');
    toggleButton.addEventListener('click', () => {
      const cmd = window.sensorMonitor.isRunning ? 'b' : 'a';
      window.sensorMonitor.sendCommand(cmd);
      console.log(`Comando enviado: ${cmd}`);
    });
    
    // Botón para verificar estado
    const statusButton = document.createElement('button');
    statusButton.textContent = 'Verificar Estado';
    statusButton.classList.add('btn', 'btn-sm', 'btn-secondary');
    statusButton.addEventListener('click', () => {
      window.sensorMonitor.sendCommand('STATUS');
      console.log('Comando STATUS enviado');
    });
    
    // Añadir botones al div
    testDiv.appendChild(tempButton);
    testDiv.appendChild(intensityButton);
    testDiv.appendChild(toggleButton);
    testDiv.appendChild(statusButton);
    
    // Añadir div al documento
    document.body.appendChild(testDiv);
    
    // Exponer funciones de prueba globalmente
    window.simTemp = () => {
      const value = 25 + Math.random() * 10 - 5;
      window.sensorMonitor.processTemperatureData({
        type: 'temperature', 
        value: value
      });
      return value.toFixed(2);
    };
    
    window.simIntensity = () => {
      const value = Math.random() * 100;
      window.sensorMonitor.processWeightData({
        type: 'weight', 
        value: value
      });
      return value.toFixed(2);
    };
    
    // Opcionalmente, iniciar simulación automática
    let simInterval = null;
    
    // Función para iniciar/detener simulación automática
    window.toggleSimulation = (interval = 2000) => {
      if (simInterval) {
        clearInterval(simInterval);
        simInterval = null;
        console.log('Simulación automática detenida');
        return false;
      } else {
        simInterval = setInterval(() => {
          window.simTemp();
          window.simIntensity();
        }, interval);
        console.log(`Simulación automática iniciada (${interval}ms)`);
        return true;
      }
    };
    
  }, 1000); // Esperar 1 segundo para asegurar que todo está cargado
});
