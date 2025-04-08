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
    // Extraer el valor numérico directamente
    const intensityValue = parseFloat(data.value);
    
    // Actualizar valor en pantalla solo si es un número válido
    if (!isNaN(intensityValue)) {
      document.getElementById('weight-value').textContent = `${intensityValue.toFixed(2)} %`;
      this.log(`Intensidad recibida: ${intensityValue}%`);
      
      // Registrar timestamp para cálculos de tiempo de muestreo
      const now = Date.now();
      if (this.lastWeightTimestamp > 0) {
        const interval = now - this.lastWeightTimestamp;
        document.getElementById('weight-actual-time').textContent = `${interval} ms`;
      }
      this.lastWeightTimestamp = now;
      
      // Añadir al gráfico siempre que se reciba (sin importar estado)
      // Esto asegura que se visualicen los datos incluso si hay problemas de comunicación
      this.addSensorData('weight', intensityValue);
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
      this.updateStatus('Adquisición iniciada');
      this.log('Sistema de adquisición ACTIVADO');
      
      // Habilitar controles cuando se confirma que el sistema está funcionando
      document.querySelectorAll('.sensor-control').forEach(el => el.disabled = false);
    } 
    else if (data.message === 'OK:b') {
      this.isRunning = false;
      this.updateAcquisitionButtonState();
      this.updateStatus('Adquisición detenida');
      this.log('Sistema de adquisición DETENIDO');
      
      // Habilitar controles cuando se confirma que el sistema se ha detenido
      document.querySelectorAll('.sensor-control').forEach(el => el.disabled = false);
    }
    else if (data.message === 'CONNECTION_OK') {
      this.log('Conexión confirmada por el servidor');
      setTimeout(() => {
        this.sendCommand('STATUS');
      }, 500);
    }
    else if (data.message.startsWith('OK:T1:') || 
             data.message.startsWith('OK:T2:') || 
             data.message.startsWith('OK:TU:') ||
             data.message.startsWith('OK:FT:') || 
             data.message.startsWith('OK:FP:') ||
             data.message.startsWith('OK:ST:') || 
             data.message.startsWith('OK:SP:')) {
      // Es una confirmación de configuración
      const parts = data.message.split(':');
      const setting = parts[1];
      const value = parts[2];
      
      this.log(`Configuración ${setting}=${value} aplicada correctamente`);
      
      // Actualizar controles si es necesario
      if (setting === 'T1') document.getElementById('temp-sample-time').value = value;
      if (setting === 'T2') document.getElementById('weight-sample-time').value = value;
      if (setting === 'TU') document.getElementById('time-unit').value = value;
      if (setting === 'FT') document.getElementById('temp-filter').checked = (value === '1');
      if (setting === 'FP') document.getElementById('weight-filter').checked = (value === '1');
      if (setting === 'ST') this.setSelectByValue('temp-filter-samples', parseInt(value));
      if (setting === 'SP') this.setSelectByValue('weight-filter-samples', parseInt(value));
      
      // Actualizar etiquetas de tiempo
      this.updateTimeLabels();
      
      // Eliminar indicador de progreso si existe
      if (document.getElementById('config-progress')) {
        document.body.removeChild(document.getElementById('config-progress'));
      }
      
      // Habilitar controles
      document.querySelectorAll('.sensor-control').forEach(el => {
        el.disabled = false;
        el.classList.remove('disabled-control');
      });
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
      } else {
        this.log('Enviando comando START (a)');
        if (!this.isPaused) {
          this.clearChartData();
        }
        this.sendCommand('a');
      }
      
      // Deshabilitar botón brevemente para evitar clicks múltiples
      const button = document.getElementById('toggle-acquisition');
      button.disabled = true;
      setTimeout(() => { button.disabled = false; }, 1500);
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
  
  // Manejar cambios de configuración - método simplificado y robusto
  handleConfigChange(setting, value) {
    this.log(`Cambiando configuración ${setting} a ${value}`);
    
    // Validar valores antes de enviar
    if ((setting === 'T1' || setting === 'T2') && (isNaN(value) || value < 1)) {
      this.log('Valor de tiempo no válido. Debe ser un número mayor que 0.');
      return;
    }
    
    if ((setting === 'ST' || setting === 'SP') && (isNaN(value) || value < 3)) {
      this.log('Valor de muestras no válido. Debe ser un número mayor que 2.');
      return;
    }
    
    // Mostrar estado de configuración en UI
    this.updateStatus(`Cambiando ${setting} a ${value}...`);
    
    // Deshabilitar temporalmente todos los controles de configuración
    document.querySelectorAll('.sensor-control').forEach(el => {
      el.disabled = true;
      el.classList.add('disabled-control');
    });
    
    // Crear un indicador visual de proceso
    const progressIndicator = document.createElement('div');
    progressIndicator.id = 'config-progress';
    progressIndicator.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 20px;
      border-radius: 5px;
      z-index: 1000;
      text-align: center;
    `;
    progressIndicator.innerHTML = `
      <div style="margin-bottom:15px">Aplicando configuración...</div>
      <div class="spinner-border text-light" role="status">
        <span class="visually-hidden">Cargando...</span>
      </div>
    `;
    document.body.appendChild(progressIndicator);
    
    // Enviar comando al servidor
    const comando = `${setting}:${value}`;
    
    // Manejar respuesta del servidor
    const checkConfigStatus = () => {
      if (!this.isRunning) {
        this.log('Esperando a que se complete la configuración...');
        setTimeout(checkConfigStatus, 500);
      } else {
        // Se ha recibido la confirmación del cambio
        this.log(`Configuración aplicada: ${setting}=${value}`);
        
        // Quitar indicador visual
        if (document.getElementById('config-progress')) {
          document.body.removeChild(document.getElementById('config-progress'));
        }
        
        // Habilitar controles
        document.querySelectorAll('.sensor-control').forEach(el => {
          el.disabled = false;
          el.classList.remove('disabled-control');
        });
        
        this.updateStatus(`Configuración aplicada: ${setting}=${value}`);
        this.updateTimeLabels();
      }
    };
    
    // Enviar el comando y comenzar a verificar su estado
    if (this.sendCommand(comando)) {
      setTimeout(checkConfigStatus, 1000);
    } else {
      // Error al enviar
      if (document.getElementById('config-progress')) {
        document.body.removeChild(document.getElementById('config-progress'));
      }
      document.querySelectorAll('.sensor-control').forEach(el => {
        el.disabled = false;
        el.classList.remove('disabled-control');
      });
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
    const now = new Date().toLocaleTimeString();
    
    // Siempre agregar una nueva entrada de tiempo para cada dato
    this.timeLabels.push(now);
    
    if (type === 'temperature') {
      this.temperatureData.push(value);
      this.weightData.push(null);
    } else {
      this.temperatureData.push(null);
      this.weightData.push(value);
    }
    
    // Limitar cantidad de puntos
    if (this.timeLabels.length > this.maxDataPoints) {
      this.timeLabels.shift();
      this.temperatureData.shift();
      this.weightData.shift();
    }
    
    // Actualizar gráfico si no está pausado
    if (!this.isPaused) {
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
      
      // Desactivar temporalmente los controles durante la ejecución de comandos críticos
      if (command === 'a' || command === 'b' || command.includes(':')) {
        document.querySelectorAll('.sensor-control').forEach(el => el.disabled = true);
        
        // Reactivar después de un tiempo razonable
        setTimeout(() => {
          document.querySelectorAll('.sensor-control').forEach(el => el.disabled = false);
        }, 2000);
      }
      
      // Feedback inmediato para comandos de inicio/detención
      if (command === 'a') {
        this.updateStatus('Iniciando adquisición...');
      } else if (command === 'b') {
        this.updateStatus('Deteniendo adquisición...');
      }
      
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
