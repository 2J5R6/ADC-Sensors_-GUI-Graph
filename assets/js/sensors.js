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
    // SIEMPRE usar el puerto 3000 donde está el servidor
    const wsUrl = `${protocol}//${host}:3000`;
    
    this.log(`Conectando a WebSocket: ${wsUrl}`);
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      this.log('Conexión WebSocket establecida');
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
    
    // Asegurar que el valor es numérico
    const intensityValue = parseFloat(data.value);
    if (!isNaN(intensityValue)) {
      // Actualizar valor en pantalla (mostrar como porcentaje)
      document.getElementById('weight-value').textContent = `${intensityValue.toFixed(2)} %`;
      
      // Añadir al gráfico independientemente del estado de adquisición
      // para pruebas y asegurar que se visualiza correctamente
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
    this.log(`Confirmación: ${data.message}`);
    
    if (data.message === 'OK:a') {
      this.isRunning = true;
      this.updateAcquisitionButtonState();
      this.log('Sistema de adquisición ACTIVADO');
    } 
    else if (data.message === 'OK:b') { con un retraso mayor
      this.isRunning = false;
      this.updateAcquisitionButtonState();
      this.log('Sistema de adquisición DETENIDO');
      
      // Si hay configuración pendiente, aplicarla // Aumentar el tiempo de espera
      if (Object.keys(this.pendingConfig).length > 0) {
        this.log('Aplicando configuración pendiente después de detener adquisición');
        setTimeout(() => { else if (data.message === 'CONNECTION_OK') {
          this.applyPendingConfig();    // Al recibir confirmación de conexión, solicitar estado actual
        }, 1000);
      };
    }
  }
  
  // Actualizar estado del botón de adquisición
  updateAcquisitionButtonState() {sición
    const button = document.getElementById('toggle-acquisition');isitionButtonState() {
    if (this.isRunning) {e-acquisition');
      button.textContent = 'Detener Adquisición';
      button.classList.remove('btn-success');ición';
      button.classList.add('btn-danger'); button.classList.remove('btn-success');
    } else {   button.classList.add('btn-danger');
      button.textContent = 'Iniciar Adquisición';  } else {
      button.classList.remove('btn-danger');isición';
      button.classList.add('btn-success');ist.remove('btn-danger');
    }-success');
  }
  
  // Configurar controles de la interfaz
  setupControls() {a interfaz
    // Botón de iniciar/deteners() {
    document.getElementById('toggle-acquisition').addEventListener('click', () => {
      if (this.isRunning) {addEventListener('click', () => {
        this.log('Enviando comando STOP (b)');
        this.sendCommand('b');do STOP (b)');
      } else {his.sendCommand('b');
        this.log('Enviando comando START (a)');
        // Solo limpiar gráfico si no está pausado // Actualizar inmediatamente el estado del botón para feedback visual
        if (!this.isPaused) { this.isRunning = false;
          this.clearChartData();    this.updateAcquisitionButtonState();
        }
        this.sendCommand('a');detuvo
      }
    });
      }, 500);
    // Botón para pausar/continuar gráfica (solo afecta la visualización, no la adquisición)
    document.getElementById('chart-refresh').addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      const btn = document.getElementById('chart-refresh');
      
      if (this.isPaused) {
        btn.innerHTML = '<i class="fas fa-play me-1"></i> Continuar gráfica';
        btn.classList.remove('btn-outline-danger');
        btn.classList.add('btn-outline-success');el botón para feedback visual
        this.log('Gráfica PAUSADA');
      } else { this.updateAcquisitionButtonState();
        btn.innerHTML = '<i class="fas fa-pause me-1"></i> Detener gráfica';
        btn.classList.remove('btn-outline-success');});
        btn.classList.add('btn-outline-danger');
        this.log('Gráfica CONTINUADA');uisición)
      }addEventListener('click', () => {
    });
    getElementById('chart-refresh');
    // Controles para tiempos de muestreo
    document.getElementById('temp-sample-time').addEventListener('change', (e) => {f (this.isPaused) {
      const value = parseInt(e.target.value);lay me-1"></i> Continuar gráfica';
      if (isNaN(value) || value <= 0) { btn.classList.remove('btn-outline-danger');
        e.target.value = 1;    btn.classList.add('btn-outline-success');
        return;
      }
      this.handleConfigChange('T1', value);fa-pause me-1"></i> Detener gráfica';
    });e('btn-outline-success');
    ssList.add('btn-outline-danger');
    document.getElementById('weight-sample-time').addEventListener('change', (e) => { this.log('Gráfica CONTINUADA');
      const value = parseInt(e.target.value);
      if (isNaN(value) || value <= 0) {
        e.target.value = 1;
        return;streo
      }e) => {
      this.handleConfigChange('T2', value);
    });e <= 0) {
     e.target.value = 1;
    // Control para unidad de tiempo    return;
    document.getElementById('time-unit').addEventListener('change', (e) => {
      this.handleConfigChange('TU', e.target.value);
      this.updateTimeLabels();
    });
    cument.getElementById('weight-sample-time').addEventListener('change', (e) => {
    // Controles para filtros
    document.getElementById('temp-filter').addEventListener('change', (e) => {
      const isChecked = e.target.checked ? 1 : 0; e.target.value = 1;
      this.handleConfigChange('FT', isChecked);    return;
      
      // Habilitar/deshabilitar selector de muestras
      document.getElementById('temp-filter-samples').disabled = !e.target.checked;
    });
    
    document.getElementById('weight-filter').addEventListener('change', (e) => {
      const isChecked = e.target.checked ? 1 : 0;his.handleConfigChange('TU', e.target.value);
      this.handleConfigChange('FP', isChecked);  this.updateTimeLabels();
      
      // Habilitar/deshabilitar selector de muestras
      document.getElementById('weight-filter-samples').disabled = !e.target.checked;
    });addEventListener('change', (e) => {
    onst isChecked = e.target.checked ? 1 : 0;
    // Controles para número de muestras en filtros  this.handleConfigChange('FT', isChecked);
    document.getElementById('temp-filter-samples').addEventListener('change', (e) => {
      const value = e.target.value;ector de muestras
      this.handleConfigChange('ST', value);samples').disabled = !e.target.checked;
    });
    
    document.getElementById('weight-filter-samples').addEventListener('change', (e) => { => {
      const value = e.target.value;
      this.handleConfigChange('SP', value);   this.handleConfigChange('FP', isChecked);
    });    
    tor de muestras
    // Inicialmente deshabilitar controles hasta que se establezca conexiónfilter-samples').disabled = !e.target.checked;
    document.querySelectorAll('.sensor-control').forEach(el => el.disabled = true);
  }
  
  // Manejar cambios de configuraciónId('temp-filter-samples').addEventListener('change', (e) => {
  handleConfigChange(setting, value) {
    this.log(`Cambiando configuración ${setting} a ${value}`);
    
    // Si estamos adquiriendo datos, primero detener y luego aplicar la configuración
    if (this.isRunning) {s').addEventListener('change', (e) => {
      this.pendingConfig[setting] = value;
      this.log('Deteniendo adquisición para aplicar nueva configuración...'); this.handleConfigChange('SP', value);
      this.sendCommand('b'); // Detener adquisición });
    } else {  
      // Si ya está detenido, enviar directamentetroles hasta que se establezca conexión
      this.sendCommand(`${setting}:${value}`);orAll('.sensor-control').forEach(el => el.disabled = true);
    }
  }
  
  // Aplicar configuración pendiente
  applyPendingConfig() {setting} a ${value}`);
    if (Object.keys(this.pendingConfig).length === 0) return;
    aplicar la configuración
    // Enviar cada comando de configuración con una pequeña pausa entre ellos
    const commands = Object.entries(this.pendingConfig);
    const sendNextCommand = (index) => {sición para aplicar nueva configuración...');
      if (index >= commands.length) {mmand('b'); // Detener adquisición
        // Todos los comandos enviados, reiniciar adquisiciónse {
        setTimeout(() => {tamente
          this.log('Reiniciando adquisición después de aplicar configuración');g}:${value}`);
          this.sendCommand('a');
        }, 1000);
        
        // Limpiar configuración pendiente
        this.pendingConfig = {};
        return; (Object.keys(this.pendingConfig).length === 0) return;
      }
      eña pausa entre ellos
      const [setting, value] = commands[index];nst commands = Object.entries(this.pendingConfig);
      this.sendCommand(`${setting}:${value}`);const sendNextCommand = (index) => {
      h) {
      // Enviar siguiente comando después de una pausaiar adquisición
      setTimeout(() => sendNextCommand(index + 1), 500);     setTimeout(() => {
    };        this.log('Reiniciando adquisición después de aplicar configuración');
    
    // Comenzar a enviar comandos
    setTimeout(() => sendNextCommand(0), 500);
  }figuración pendiente
  fig = {};
  // Actualizar etiquetas de tiempo    return;
  updateTimeLabels() {
    const timeUnit = document.getElementById('time-unit').value;
    let unitText = '';lue] = commands[index];
    let multiplier = 1;`${setting}:${value}`);
    
    switch (timeUnit) { siguiente comando después de una pausa
      case 'm':tCommand(index + 1), 500);
        unitText = 'ms';
        multiplier = 1;
        break; a enviar comandos
      case 's':Command(0), 500);
        unitText = 'segundos';
        multiplier = 1000;
        break;Actualizar etiquetas de tiempo
      case 'M':dateTimeLabels() {
        unitText = 'minutos';
        multiplier = 60000;
        break;let multiplier = 1;
    }
    
    const tempTime = parseInt(document.getElementById('temp-sample-time').value) * multiplier;   case 'm':
    const weightTime = parseInt(document.getElementById('weight-sample-time').value) * multiplier;      unitText = 'ms';
    
    document.getElementById('temp-actual-time').textContent = `${tempTime} ${unitText}`;
    document.getElementById('weight-actual-time').textContent = `${weightTime} ${unitText}`;
  }
  ;
  // Limpiar datos del gráfico
  clearChartData() {  case 'M':
    this.log('Limpiando datos del gráfico');inutos';
    this.temperatureData = [];
    this.weightData = [];
    this.timeLabels = [];
    
    if (this.chart) {onst tempTime = parseInt(document.getElementById('temp-sample-time').value) * multiplier;
      this.chart.data.labels = []; const weightTime = parseInt(document.getElementById('weight-sample-time').value) * multiplier;
      this.chart.data.datasets[0].data = [];  
      this.chart.data.datasets[1].data = [];ementById('temp-actual-time').textContent = `${tempTime} ${unitText}`;
      this.chart.update();lementById('weight-actual-time').textContent = `${weightTime} ${unitText}`;
    }
  }
  
  // Crear gráficoata() {
  createChart() {his.log('Limpiando datos del gráfico');
    const ctx = document.getElementById('chart-line');this.temperatureData = [];
    if (!ctx) {
      console.error('No se encontró el elemento canvas para el gráfico');
      return;
    }
    ta.labels = [];
    // Destruir gráfico existente si existe
    if (window.chartLine) {his.chart.data.datasets[1].data = [];
      try {
        window.chartLine.destroy();
      } catch(e) { 
        console.log("Error al destruir chartLine:", e);
      } Crear gráfico
      delete window.chartLine;
    }ument.getElementById('chart-line');
     {
    this.log('Creando gráfico...');('No se encontró el elemento canvas para el gráfico');
    
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {co existente si existe
        labels: [],
        datasets: [
          {stroy();
            label: 'Temperatura (°C)',
            data: [],Line:", e);
            borderColor: '#cb0c9f',
            backgroundColor: 'rgba(203,12,159,0.2)',rtLine;
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#cb0c9f',('Creando gráfico...');
            pointBorderColor: 'white',
            fill: true,, {
            tension: 0.4,
            yAxisID: 'y-temperature'
          },
          {
            label: 'Intensidad de Rojo (%)',
            data: [],
            borderColor: '#f5365c',
            backgroundColor: 'rgba(245,54,92,0.2)',: '#cb0c9f',
            borderWidth: 2,or: 'rgba(203,12,159,0.2)',
            pointRadius: 3,
            pointBackgroundColor: '#f5365c', pointRadius: 3,
            pointBorderColor: 'white',   pointBackgroundColor: '#cb0c9f',
            fill: true,    pointBorderColor: 'white',
            tension: 0.4,: true,
            yAxisID: 'y-weight'
          }'
        ]
      },
      options: {  label: 'Peso (g)',
        responsive: true,[],
        maintainAspectRatio: false,olor: '#3A416F',
        animation: { 'rgba(58,65,111,0.2)',
          duration: 0 // Desactivar animaciones para mejor rendimientoborderWidth: 2,
        },ius: 3,
        plugins: {dColor: '#3A416F',
          legend: {: 'white',
            position: 'top', fill: true,
          },  tension: 0.4,
          tooltip: {y-weight'
            mode: 'index',
            intersect: false
          }
        },
        interaction: {
          mode: 'index',: false,
          intersect: false
        },0 // Desactivar animaciones para mejor rendimiento
        scales: {
          'y-temperature': {
            type: 'linear',nd: {
            position: 'left',
            title: {
              display: true,
              text: 'Temperatura (°C)'
            },
            beginAtZero: false
          },
          'y-weight': {
            type: 'linear',: 'index',
            position: 'right',: false
            title: {
              display: true,: {
              text: 'Intensidad de Rojo (%)'
            },type: 'linear',
            grid: {sition: 'left',
              drawOnChartArea: false
            },
            beginAtZero: truetura (°C)'
          },,
          x: { beginAtZero: false
            title: { },
              display: true,   'y-weight': {
              text: 'Tiempo'     type: 'linear',
            }        position: 'right',
          }
        }           display: true,
      }            text: 'Peso (g)'
    });
    
    this.log('Gráfico creado correctamente');
  }        },
  
  // Añadir nuevos datos a la gráfica - Versión simplificada
  addSensorData(type, value) {
    const now = new Date().toLocaleTimeString();
    
    // Crear una nueva entrada para cada dato para asegurar visualización correcta        text: 'Tiempo'
    this.timeLabels.push(now);
        }
    if (type === 'temperature') {
      this.temperatureData.push(value);
      this.weightData.push(null);
      this.log(`Dato de temperatura añadido: ${value}°C`);
    } 
    else if (type === 'weight') {
      this.temperatureData.push(null);
      this.weightData.push(value);
      this.log(`Dato de intensidad añadido: ${value}%`);
    }new Date().toLocaleTimeString();
    
    // Limitar cantidad de datos
    while (this.timeLabels.length > this.maxDataPoints) {
      this.timeLabels.shift();
      this.temperatureData.shift();s.temperatureData.push(value);
      this.weightData.shift();ghtData.push(null); // Sin dato de peso para este instante
    }
    eratura: ${value}°C`);
    // Solo actualizar gráfico si hay datos
    if (this.chart && this.timeLabels.length > 0) {
      this.updateChart();/ Para datos de peso
    }// Usar la última etiqueta de tiempo si existe
  }
     const lastTime = this.timeLabels[this.timeLabels.length - 1];
  // Actualizar gráfico    
  updateChart() {esa misma etiqueta
    if (!this.chart) return;
    .weightData.length - 1] = value;
    try {
      // Actualizar datos del gráfico, agregar nueva etiqueta
      this.chart.data.labels = [...this.timeLabels];     this.timeLabels.push(now);
      this.chart.data.datasets[0].data = [...this.temperatureData];      this.temperatureData.push(null);
      this.chart.data.datasets[1].data = [...this.weightData];ta.push(value);
           }
      // Actualizar sin animación para mejor rendimiento    } else {
      this.chart.update('none');iquetas, crear una
    } catch (error) {Labels.push(now);
      console.error("Error al actualizar gráfico:", error);.push(null);
    }    this.weightData.push(value);
  }
  
  // Enviar comando a través de WebSocket
  sendCommand(command) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({ command: command }); Limitar cantidad de datos
      this.ws.send(msg);{
      this.log(`Comando enviado: ${command}`);
      this.updateStatus(`Comando enviado: ${command}`);eData.shift();
      return true;
    } else {
      this.updateStatus('Error: No hay conexión con el servidor'); 
      this.log('No se pudo enviar comando, sin conexión WebSocket');  this.updateChart();
      return false;
    }
  }
  
  // Actualizar mensaje de estadourn;
  updateStatus(message) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {r datos del gráfico
      statusElement.textContent = message;hart.data.labels = [...this.timeLabels];
    };
  }
}
 // Actualizar sin animación para mejor rendimiento
// Inicializar cuando el DOM esté listo   this.chart.update('none');
document.addEventListener('DOMContentLoaded', function() {  } catch (error) {
  console.log('Inicializando sistema de monitoreo de sensores...');ualizar gráfico:", error);
  
  // Limpiar variables globales que puedan interferir
  window.chartLine = undefined;
  window.temperatureData = undefined;
  window.weightData = undefined;dCommand(command) {
  window.timeLabels = undefined; if (this.ws && this.ws.readyState === WebSocket.OPEN) {
       const msg = JSON.stringify({ command: command });
  // Inicializar el nuevo monitor de sensores      this.ws.send(msg);
  window.sensorMonitor = new SensorMonitor();and}`);
});
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
