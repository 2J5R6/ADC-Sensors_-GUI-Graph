// Configuración de gráficas y comunicación WebSocket para sensores
class SensorMonitor {
  constructor() {
    // Variables para datos de los sensores
    this.temperatureData = [];
    this.weightData = [];
    this.timeLabels = [];
    this.maxDataPoints = 100;
    
    // Referencias a los gráficos
    this.chart = null;
    
    // Conexión WebSocket
    this.ws = null;
    
    // Estado del sistema
    this.isRunning = false;
    this.isPaused = false;
    
    // Timestamps para calcular el tiempo real de muestreo
    this.lastTempTimestamp = 0;
    this.lastWeightTimestamp = 0;
    this.tempSamples = [];
    this.weightSamples = [];
    
    // Debug
    this.debug = true;
    
    // Pendiente: comandos a enviar después de detener adquisición
    this.pendingConfig = {};
    
    // Inicializar
    this.createChart();
    this.setupControls();
    this.initWebSocket();
    
    // Log de inicialización
    this.log("SensorMonitor inicializado");
  }
  
  // Función de logging
  log(message) {
    if (this.debug) {
      console.log(`[SensorMonitor] ${message}`);
    }
  }
  
  // Inicializar la conexión WebSocket
  initWebSocket() {
    // Limpiar cualquier conexión previa
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Determinar la URL WebSocket basada en la URL actual
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    // Usar puerto específico (3000) para el servidor WebSocket
    const port = 3000;
    const wsUrl = `${protocol}//${host}:${port}`;
    
    this.log(`Intentando conexión WebSocket a: ${wsUrl}`);
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        this.log('✅ Conexión WebSocket establecida correctamente');
        this.updateStatus('Conectado al servidor');
        document.getElementById('status-dot').classList.remove('status-disconnected');
        document.getElementById('status-dot').classList.add('status-connected');
        
        // Habilitar controles
        document.querySelectorAll('.sensor-control').forEach(el => el.disabled = false);
        
        // Solicitar estado actual al conectar
        this.sendCommand('STATUS');
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.log('Mensaje recibido:', data);
          
          // Manejar diferentes tipos de datos
          switch (data.type) {
            case 'temperature':
              this.processTemperatureData(data);
              break;
              
            case 'weight':
              this.processWeightData(data);
              break;
              
            case 'status':
              this.processSystemStatus(data);
              break;
              
            case 'confirmation':
              this.processConfirmation(data);
              break;
              
            default:
              this.log(`Mensaje de tipo desconocido: ${data.type}`);
          }
        } catch (e) {
          console.error('Error al procesar mensaje:', e);
        }
      };
      
      this.ws.onclose = () => {
        this.log('Conexión WebSocket cerrada');
        this.updateStatus('Desconectado del servidor. Intentando reconectar...');
        document.getElementById('status-dot').classList.remove('status-connected');
        document.getElementById('status-dot').classList.add('status-disconnected');
        
        // Deshabilitar controles
        document.querySelectorAll('.sensor-control').forEach(el => el.disabled = true);
        
        // Intentar reconectar
        setTimeout(() => {
          this.log('Intentando reconexión automática...');
          this.initWebSocket();
        }, 3000);
      };
      
      this.ws.onerror = (error) => {
        console.error('Error en WebSocket:', error);
        this.updateStatus('Error de conexión. Reintentando...');
      };
    } catch (e) {
      this.log(`❌ Error al crear conexión WebSocket: ${e.message}`);
      // Intentar reconexión automática después de un tiempo
      setTimeout(() => this.initWebSocket(), 5000);
    }
  }
  
  // Procesar datos de temperatura
  processTemperatureData(data) {
    // Calcular tiempo de muestreo real
    const now = Date.now();
    if (this.lastTempTimestamp > 0) {
      const interval = now - this.lastTempTimestamp;
      this.tempSamples.push(interval);
      
      // Mantener solo las últimas muestras para promedio
      if (this.tempSamples.length > 5) {
        this.tempSamples.shift();
      }
      
      // Calcular y mostrar promedio
      const avgSampleTime = this.tempSamples.reduce((a, b) => a + b, 0) / this.tempSamples.length;
      document.getElementById('temp-actual-time').textContent = `${Math.round(avgSampleTime)}ms`;
    }
    this.lastTempTimestamp = now;
    
    // Actualizar valor en pantalla
    document.getElementById('temp-value').textContent = `${data.value.toFixed(2)} °C`;
    
    // Añadir a gráfica solo si no está pausado y está en modo adquisición
    if (this.isRunning && !this.isPaused) {
      this.addSensorData('temperature', data.value);
    }
  }
  
  // Procesar datos de peso (ahora intensidad)
  processWeightData(data) {
    this.log(`Procesando dato de intensidad: ${data.value}`);
    
    // Calcular tiempo de muestreo real
    const now = Date.now();
    if (this.lastWeightTimestamp > 0) {
      const interval = now - this.lastWeightTimestamp;
      this.weightSamples.push(interval);
      
      // Mantener solo las últimas muestras para promedio
      if (this.weightSamples.length > 5) {
        this.weightSamples.shift();
      }
      
      // Calcular y mostrar promedio
      const avgSampleTime = this.weightSamples.reduce((a, b) => a + b, 0) / this.weightSamples.length;
      document.getElementById('weight-actual-time').textContent = `${Math.round(avgSampleTime)}ms`;
    }
    this.lastWeightTimestamp = now;
    
    // Asegurar que el valor es numérico y está en el rango adecuado
    let intensityValue = parseFloat(data.value);
    if (!isNaN(intensityValue)) {
      // Normalizar el valor como porcentaje si es necesario
      if (intensityValue > 100) intensityValue = 100;
      if (intensityValue < 0) intensityValue = 0;
      
      // Actualizar valor en pantalla (mostrar como porcentaje)
      document.getElementById('weight-value').textContent = `${intensityValue.toFixed(2)} %`;
      
      // Añadir al gráfico
      this.addSensorData('weight', intensityValue);
      
      this.log(`Valor de intensidad actualizado: ${intensityValue}`);
    }
  }
  
  // Procesar estado del sistema
  processSystemStatus(data) {
    const state = data.state;
    this.log('Estado del sistema recibido:', state);
    
    // Actualizar estado de adquisición
    this.isRunning = state.isRunning;
    this.updateAcquisitionButtonState();
    
    // Actualizar controles con valores actuales
    document.getElementById('time-unit').value = state.timeUnit || 's';
    document.getElementById('temp-sample-time').value = state.tempSampleTime || 1;
    document.getElementById('weight-sample-time').value = state.weightSampleTime || 1;
    
    // Filtros
    document.getElementById('temp-filter').checked = state.tempFilter;
    document.getElementById('weight-filter').checked = state.weightFilter;
    document.getElementById('temp-filter-samples').disabled = !state.tempFilter;
    document.getElementById('weight-filter-samples').disabled = !state.weightFilter;
    
    // Actualizar el número de muestras para filtros si está disponible
    if (state.tempSamples) {
      this.setSelectByValue('temp-filter-samples', state.tempSamples);
    }
    
    if (state.weightSamples) {
      this.setSelectByValue('weight-filter-samples', state.weightSamples);
    }
    
    // Actualizar etiquetas de tiempo real
    this.updateTimeLabels();
  }
  
  // Establecer valor en un select por valor
  setSelectByValue(selectId, value) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    for (let i = 0; i < select.options.length; i++) {
      if (parseInt(select.options[i].value) === parseInt(value)) {
        select.selectedIndex = i;
        break;
      }
    }
  }
  
  // Procesar mensaje de confirmación
  processConfirmation(data) {
    this.updateStatus(`Respuesta: ${data.message}`);
    this.log(`Confirmación recibida: ${data.message}`);
    
    if (data.message === 'OK:a') {
      this.isRunning = true;
      this.updateAcquisitionButtonState();
      this.log('Sistema de adquisición ACTIVADO');
    } 
    else if (data.message === 'OK:b') {
      this.isRunning = false;
      this.updateAcquisitionButtonState();
      this.log('Sistema de adquisición DETENIDO');
      
      // Si hay configuración pendiente, aplicarla
      if (Object.keys(this.pendingConfig).length > 0) {
        this.log('Aplicando configuración pendiente después de detener adquisición');
        setTimeout(() => {
          this.applyPendingConfig();
        }, 1500);
      }
    }
    else if (data.message === 'CONNECTION_OK') {
      // Al recibir confirmación de conexión, solicitar estado actual
      this.log('Conexión confirmada por el servidor');
      setTimeout(() => {
        this.sendCommand('STATUS');
      }, 500);
    }
  }
  
  // Actualizar estado del botón de adquisición
  updateAcquisitionButtonState() {
    const button = document.getElementById('toggle-acquisition');
    if (this.isRunning) {
      button.textContent = 'Detener Adquisición';
      button.classList.remove('btn-success');
      button.classList.add('btn-danger');
    } else {
      button.textContent = 'Iniciar Adquisición';
      button.classList.remove('btn-danger');
      button.classList.add('btn-success');
    }
  }
  
  // Configurar controles de la interfaz
  setupControls() {
    // Botón de iniciar/detener
    document.getElementById('toggle-acquisition').addEventListener('click', () => {
      if (this.isRunning) {
        this.log('Enviando comando STOP (b)');
        this.sendCommand('b');
        
        // Actualizar inmediatamente el estado del botón para feedback visual
        this.isRunning = false;
        this.updateAcquisitionButtonState();
        this.updateStatus('Deteniendo adquisición...');
        
        // Solicitar estado después de un breve retraso para confirmar que se detuvo
        setTimeout(() => {
          this.sendCommand('STATUS');
        }, 1000);
      } else {
        this.log('Enviando comando START (a)');
        // Solo limpiar gráfico si no está pausado
        if (!this.isPaused) {
          this.clearChartData();
        }
        this.sendCommand('a');
        
        // Actualizar inmediatamente el estado del botón para feedback visual
        this.isRunning = true;
        this.updateAcquisitionButtonState();
        this.updateStatus('Iniciando adquisición...');
      }
    });
    
    // Botón para pausar/continuar gráfica (solo afecta la visualización, no la adquisición)
    document.getElementById('chart-refresh').addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      const btn = document.getElementById('chart-refresh');
      
      if (this.isPaused) {
        btn.innerHTML = '<i class="fas fa-play me-1"></i> Continuar gráfica';
        btn.classList.remove('btn-outline-danger');
        btn.classList.add('btn-outline-success');
        this.log('Gráfica PAUSADA');
      } else {
        btn.innerHTML = '<i class="fas fa-pause me-1"></i> Detener gráfica';
        btn.classList.remove('btn-outline-success');
        btn.classList.add('btn-outline-danger');
        this.log('Gráfica CONTINUADA');
      }
    });
    
    // Controles para tiempos de muestreo
    document.getElementById('temp-sample-time').addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      if (isNaN(value) || value <= 0) {
        e.target.value = 1;
        return;
      }
      this.handleConfigChange('T1', value);
    });
    
    document.getElementById('weight-sample-time').addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      if (isNaN(value) || value <= 0) {
        e.target.value = 1;
        return;
      }
      this.handleConfigChange('T2', value);
    });
    
    // Control para unidad de tiempo
    document.getElementById('time-unit').addEventListener('change', (e) => {
      this.handleConfigChange('TU', e.target.value);
      this.updateTimeLabels();
    });
    
    // Controles para filtros
    document.getElementById('temp-filter').addEventListener('change', (e) => {
      const isChecked = e.target.checked ? 1 : 0;
      this.handleConfigChange('FT', isChecked);
      
      // Habilitar/deshabilitar selector de muestras
      document.getElementById('temp-filter-samples').disabled = !e.target.checked;
    });
    
    document.getElementById('weight-filter').addEventListener('change', (e) => {
      const isChecked = e.target.checked ? 1 : 0;
      this.handleConfigChange('FP', isChecked);
      
      // Habilitar/deshabilitar selector de muestras
      document.getElementById('weight-filter-samples').disabled = !e.target.checked;
    });
    
    // Controles para número de muestras en filtros
    document.getElementById('temp-filter-samples').addEventListener('change', (e) => {
      const value = e.target.value;
      this.handleConfigChange('ST', value);
    });
    
    document.getElementById('weight-filter-samples').addEventListener('change', (e) => {
      const value = e.target.value;
      this.handleConfigChange('SP', value);
    });
    
    // Inicialmente deshabilitar controles hasta que se establezca conexión
    document.querySelectorAll('.sensor-control').forEach(el => el.disabled = true);
  }
  
  // Manejar cambios de configuración
  handleConfigChange(setting, value) {
    this.log(`Cambiando configuración ${setting} a ${value}`);
    
    // Si estamos adquiriendo datos, primero detener y luego aplicar la configuración
    if (this.isRunning) {
      this.pendingConfig[setting] = value;
      this.log('Deteniendo adquisición para aplicar nueva configuración...');
      this.sendCommand('b'); // Detener adquisición
    } else {
      // Si ya está detenido, enviar directamente
      this.sendCommand(`${setting}:${value}`);
    }
  }
  
  // Aplicar configuración pendiente
  applyPendingConfig() {
    if (Object.keys(this.pendingConfig).length === 0) return;
    
    // Enviar cada comando de configuración con una pequeña pausa entre ellos
    const commands = Object.entries(this.pendingConfig);
    const sendNextCommand = (index) => {
      if (index >= commands.length) {
        // Todos los comandos enviados, reiniciar adquisición
        setTimeout(() => {
          this.log('Reiniciando adquisición después de aplicar configuración');
          this.sendCommand('a');
        }, 1000);
        
        // Limpiar configuración pendiente
        this.pendingConfig = {};
        return;
      }
      
      const [setting, value] = commands[index];
      this.sendCommand(`${setting}:${value}`);
      
      // Enviar siguiente comando después de una pausa
      setTimeout(() => sendNextCommand(index + 1), 500);
    };
    
    // Comenzar a enviar comandos
    setTimeout(() => sendNextCommand(0), 500);
  }
  
  // Actualizar etiquetas de tiempo
  updateTimeLabels() {
    const timeUnit = document.getElementById('time-unit').value;
    let unitText = '';
    let multiplier = 1;
    
    switch (timeUnit) {
      case 'm':
        unitText = 'ms';
        multiplier = 1;
        break;
      case 's':
        unitText = 'segundos';
        multiplier = 1000;
        break;
      case 'M':
        unitText = 'minutos';
        multiplier = 60000;
        break;
    }
    
    const tempTime = parseInt(document.getElementById('temp-sample-time').value) * multiplier;
    const weightTime = parseInt(document.getElementById('weight-sample-time').value) * multiplier;
    
    document.getElementById('temp-actual-time').textContent = `${tempTime} ${unitText}`;
    document.getElementById('weight-actual-time').textContent = `${weightTime} ${unitText}`;
  }
  
  // Limpiar datos del gráfico
  clearChartData() {
    this.log('Limpiando datos del gráfico');
    this.temperatureData = [];
    this.weightData = [];
    this.timeLabels = [];
    
    if (this.chart) {
      this.chart.data.labels = [];
      this.chart.data.datasets[0].data = [];
      this.chart.data.datasets[1].data = [];
      this.chart.update();
    }
  }
  
  // Crear gráfico
  createChart() {
    const ctx = document.getElementById('chart-line');
    if (!ctx) {
      console.error('No se encontró el elemento canvas para el gráfico');
      return;
    }
    
    // Destruir gráfico existente si existe
    if (window.chartLine) {
      try {
        window.chartLine.destroy();
      } catch(e) { 
        console.log("Error al destruir chartLine:", e);
      }
      delete window.chartLine;
    }
    
    this.log('Creando gráfico...');
    
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Temperatura (°C)',
            data: [],
            borderColor: '#cb0c9f',
            backgroundColor: 'rgba(203,12,159,0.2)',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#cb0c9f',
            pointBorderColor: 'white',
            fill: true,
            tension: 0.4,
            yAxisID: 'y-temperature'
          },
          {
            label: 'Intensidad de Rojo (%)',
            data: [],
            borderColor: '#f5365c',
            backgroundColor: 'rgba(245,54,92,0.2)',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#f5365c',
            pointBorderColor: 'white',
            fill: true,
            tension: 0.4,
            yAxisID: 'y-weight'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 0 // Desactivar animaciones para mejor rendimiento
        },
        plugins: {
          legend: {
            position: 'top',
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        scales: {
          'y-temperature': {
            type: 'linear',
            position: 'left',
            title: {
              display: true,
              text: 'Temperatura (°C)'
            },
            beginAtZero: false
          },
          'y-weight': {
            type: 'linear',
            position: 'right',
            title: {
              display: true,
              text: 'Intensidad de Rojo (%)'
            },
            grid: {
              drawOnChartArea: false
            },
            beginAtZero: true
          },
          x: {
            title: {
              display: true,
              text: 'Tiempo'
            }
          }
        }
      }
    });
    
    this.log('Gráfico creado correctamente');
  }
  
  // Añadir nuevos datos a la gráfica
  addSensorData(type, value) {
    // Usar la misma marca de tiempo para datos que llegan casi simultáneamente
    const now = new Date().toLocaleTimeString();
    let addNewLabel = true;
    
    // Si hay etiquetas y el último dato es muy reciente (menos de 500ms)
    if (this.timeLabels.length > 0 && 
        Date.now() - Math.max(this.lastTempTimestamp, this.lastWeightTimestamp) < 500) {
      // No agregar nueva etiqueta de tiempo
      addNewLabel = false;
    }
    
    if (addNewLabel) {
      this.timeLabels.push(now);
      // Agregar valores nulos para mantener sincronizados los arrays
      this.temperatureData.push(null);
      this.weightData.push(null);
    }
    
    // Índice del punto de datos actual (el último)
    const currentIndex = this.timeLabels.length - 1;
    
    // Actualizar el valor según el tipo
    if (type === 'temperature') {
      this.temperatureData[currentIndex] = value;
      this.log(`Dato de temperatura añadido: ${value}°C`);
    } 
    else if (type === 'weight') {
      this.weightData[currentIndex] = value;
      this.log(`Dato de intensidad añadido: ${value}%`);
    }
    
    // Limitar cantidad de datos
    while (this.timeLabels.length > this.maxDataPoints) {
      this.timeLabels.shift();
      this.temperatureData.shift();
      this.weightData.shift();
    }
    
    // Solo actualizar gráfico si hay datos y no está pausado
    if (this.chart && this.timeLabels.length > 0 && !this.isPaused) {
      this.updateChart();
    }
  }
  
  // Actualizar gráfico
  updateChart() {
    if (!this.chart) return;
    try {
      // Actualizar datos del gráfico, agregar nueva etiqueta
      this.chart.data.labels = [...this.timeLabels];
      this.chart.data.datasets[0].data = [...this.temperatureData];
      this.chart.data.datasets[1].data = [...this.weightData];
      
      // Actualizar sin animación para mejor rendimiento
      this.chart.update('none');
    } catch (error) {
      console.error("Error al actualizar gráfico:", error);
    }
  }
  
  // Enviar comando a través de WebSocket
  sendCommand(command) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({ command: command });
      this.ws.send(msg);
      this.log(`Comando enviado: ${command}`);
      this.updateStatus(`Comando enviado: ${command}`);
      return true;
    } else {
      this.updateStatus('Error: No hay conexión con el servidor'); 
      this.log('No se pudo enviar comando, sin conexión WebSocket');
      return false;
    }
  }
  
  // Actualizar mensaje de estado
  updateStatus(message) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
      statusElement.textContent = message;
    }
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
  console.log('Inicializando sistema de monitoreo de sensores...');
  
  // Limpiar variables globales que puedan interferir
  window.chartLine = undefined;
  window.temperatureData = undefined;
  window.weightData = undefined;
  window.timeLabels = undefined;
  
  // Inicializar el nuevo monitor de sensores
  window.sensorMonitor = new SensorMonitor();
});
