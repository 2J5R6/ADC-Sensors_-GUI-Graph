// Configuración de gráficas y comunicación WebSocket para sensores
class SensorMonitor {
  constructor() {
    // Variables para datos de los sensores
    this.temperatureData = [];
    this.weightData = [];
    this.timeLabels = [];
    this.maxDataPoints = 100;
    
    // Referencias a los gráficos
    this.temperatureWeightChart = null;
    
    // Conexión WebSocket
    this.ws = null;
    
    // Estado del sistema
    this.isRunning = false;
    this.graphPaused = false;
    
    // Timestamps para calcular el tiempo real de muestreo
    this.lastTempTimestamp = 0;
    this.lastWeightTimestamp = 0;
    this.tempSamples = [];
    this.weightSamples = [];
    
    // Inicializar
    this.clearConflictingScripts();
    this.initWebSocket();
    this.setupControls();
    this.createCharts();
    
    // Debug
    this.debug = true;
  }
  
  // Limpiar scripts conflictivos
  clearConflictingScripts() {
    // Eliminar scripts conflictivos y variables globales
    if (window.chartLine) {
      try {
        window.chartLine.destroy();
      } catch(e) {
        console.error("Error al destruir chartLine:", e);
      }
      delete window.chartLine;
    }
    
    window.temperatureData = undefined;
    window.weightData = undefined;
    window.timeLabels = undefined;
    
    console.log("Variables y scripts conflictivos limpiados.");
  }
  
  // Inicializar la conexión WebSocket
  initWebSocket() {
    // Determinar la URL WebSocket basada en la URL actual
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = 3000;  // Puerto configurado en el servidor
    
    this.ws = new WebSocket(`${protocol}//${host}:${port}`);
    
    this.ws.onopen = () => {
      console.log('Conexión WebSocket establecida');
      this.updateStatus('Conectado al servidor');
      document.getElementById('status-dot').classList.replace('status-disconnected', 'status-connected');
      
      // Habilitar controles
      document.querySelectorAll('.sensor-control').forEach(el => el.disabled = false);
    };
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Datos recibidos:", data);
        
        // Manejar diferentes tipos de datos
        switch (data.type) {
          case 'temperature':
            // Calcular el tiempo real de muestreo
            const now = Date.now();
            if (this.lastTempTimestamp > 0) {
              const interval = now - this.lastTempTimestamp;
              this.tempSamples.push(interval);
              
              // Mantener solo las últimas 10 muestras para calcular el promedio
              if (this.tempSamples.length > 10) {
                this.tempSamples.shift();
              }
              
              // Mostrar el tiempo de muestreo promedio
              const avgSampleTime = this.tempSamples.reduce((a, b) => a + b, 0) / this.tempSamples.length;
              document.getElementById('temp-actual-time').textContent = `${Math.round(avgSampleTime)}ms`;
            }
            this.lastTempTimestamp = now;
            
            // Actualizar el valor mostrado independientemente de la pausa
            document.getElementById('temp-value').textContent = `${data.value.toFixed(2)} °C`;
            
            // Solo añadir al gráfico si no está pausado
            if (!this.graphPaused) {
              this.addDataPoint('temperature', data.value);
            }
            break;
            
          case 'weight':
            // Calcular el tiempo real de muestreo
            const nowWeight = Date.now();
            if (this.lastWeightTimestamp > 0) {
              const interval = nowWeight - this.lastWeightTimestamp;
              this.weightSamples.push(interval);
              
              // Mantener solo las últimas 10 muestras para calcular el promedio
              if (this.weightSamples.length > 10) {
                this.weightSamples.shift();
              }
              
              // Mostrar el tiempo de muestreo promedio
              const avgSampleTime = this.weightSamples.reduce((a, b) => a + b, 0) / this.weightSamples.length;
              document.getElementById('weight-actual-time').textContent = `${Math.round(avgSampleTime)}ms`;
            }
            this.lastWeightTimestamp = nowWeight;
            
            // Actualizar el valor mostrado independientemente de la pausa
            document.getElementById('weight-value').textContent = `${data.value.toFixed(2)} g`;
            
            // Solo añadir al gráfico si no está pausado
            if (!this.graphPaused) {
              this.addDataPoint('weight', data.value);
            }
            break;
            
          case 'confirmation':
            this.updateStatus(`Respuesta: ${data.message}`);
            break;
        }
      } catch (e) {
        console.error('Error al procesar mensaje:', e);
      }
    };
    
    this.ws.onclose = () => {
      console.log('Conexión WebSocket cerrada');
      this.updateStatus('Desconectado del servidor');
      document.getElementById('status-dot').classList.replace('status-connected', 'status-disconnected');
      
      // Deshabilitar controles
      document.querySelectorAll('.sensor-control').forEach(el => el.disabled = true);
      
      // Intentar reconectar después de un tiempo
      setTimeout(() => this.initWebSocket(), 5000);
    };
    
    this.ws.onerror = (error) => {
      console.error('Error en WebSocket:', error);
      this.updateStatus('Error de conexión');
    };
  }
  
  // Configurar controles de la interfaz
  setupControls() {
    // Botón de iniciar/detener
    document.getElementById('toggle-acquisition').addEventListener('click', () => {
      if (this.isRunning) {
        this.sendCommand('b');  // Comando para detener
        document.getElementById('toggle-acquisition').textContent = 'Iniciar Adquisición';
        document.getElementById('toggle-acquisition').classList.replace('btn-danger', 'btn-success');
      } else {
        this.sendCommand('a');  // Comando para iniciar
        document.getElementById('toggle-acquisition').textContent = 'Detener Adquisición';
        document.getElementById('toggle-acquisition').classList.replace('btn-success', 'btn-danger');
      }
      this.isRunning = !this.isRunning;
    });
    
    // Botón para pausar/reanudar la gráfica
    document.getElementById('chart-refresh').addEventListener('click', () => {
      this.graphPaused = !this.graphPaused;
      const button = document.getElementById('chart-refresh');
      if (this.graphPaused) {
        button.textContent = 'Reanudar Gráfica';
        button.classList.replace('btn-outline-primary', 'btn-outline-success');
        button.innerHTML = '<i class="fas fa-play me-1"></i> Reanudar Gráfica';
      } else {
        button.textContent = 'Pausar Gráfica';
        button.classList.replace('btn-outline-success', 'btn-outline-primary');
        button.innerHTML = '<i class="fas fa-pause me-1"></i> Pausar Gráfica';
      }
    });
    
    // Controles para tiempos de muestreo
    document.getElementById('temp-sample-time').addEventListener('change', (e) => {
      const value = e.target.value;
      this.sendCommand(`T1:${value}`);
      console.log(`Tiempo de muestreo de temperatura cambiado a ${value}`);
      // Reiniciar el cálculo del tiempo de muestreo
      this.tempSamples = [];
    });
    
    document.getElementById('weight-sample-time').addEventListener('change', (e) => {
      const value = e.target.value;
      this.sendCommand(`T2:${value}`);
      console.log(`Tiempo de muestreo de peso cambiado a ${value}`);
      // Reiniciar el cálculo del tiempo de muestreo
      this.weightSamples = [];
    });
    
    // Control para unidad de tiempo
    document.getElementById('time-unit').addEventListener('change', (e) => {
      const value = e.target.value;
      this.sendCommand(`TU:${value}`);
      console.log(`Unidad de tiempo cambiada a ${value}`);
      // Reiniciar el cálculo del tiempo de muestreo
      this.tempSamples = [];
      this.weightSamples = [];
    });
    
    // Controles para filtros
    document.getElementById('temp-filter').addEventListener('change', (e) => {
      const isChecked = e.target.checked ? 1 : 0;
      this.sendCommand(`FT:${isChecked}`);
      
      // Habilitar/deshabilitar selector de muestras
      document.getElementById('temp-filter-samples').disabled = !e.target.checked;
    });
    
    document.getElementById('weight-filter').addEventListener('change', (e) => {
      const isChecked = e.target.checked ? 1 : 0;
      this.sendCommand(`FP:${isChecked}`);
      
      // Habilitar/deshabilitar selector de muestras
      document.getElementById('weight-filter-samples').disabled = !e.target.checked;
    });
    
    // Controles para número de muestras en filtros
    document.getElementById('temp-filter-samples').addEventListener('change', (e) => {
      const value = e.target.value;
      this.sendCommand(`ST:${value}`);
    });
    
    document.getElementById('weight-filter-samples').addEventListener('change', (e) => {
      const value = e.target.value;
      this.sendCommand(`SP:${value}`);
    });
    
    // Inicialmente deshabilitar controles hasta que se establezca conexión
    document.querySelectorAll('.sensor-control').forEach(el => el.disabled = true);
  }
  
  // Crear gráficos
  createCharts() {
    const ctx = document.getElementById('chart-line');
    if (!ctx) {
      console.error('No se encontró el elemento canvas "chart-line"');
      return;
    }
    
    // Asegurarnos de que Chart.js esté correctamente inicializado
    if (typeof Chart === 'undefined') {
      console.error('¡Chart.js no está cargado correctamente!');
      return;
    }
    
    // Eliminar cualquier gráfico existente
    if (this.temperatureWeightChart) {
      this.temperatureWeightChart.destroy();
    }
    
    try {
      this.temperatureWeightChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: this.timeLabels,
          datasets: [
            {
              label: "Temperatura (°C)",
              tension: 0.4,
              borderWidth: 3,
              pointRadius: 3,
              borderColor: "#cb0c9f",
              backgroundColor: "rgba(203, 12, 159, 0.1)",
              fill: true,
              data: this.temperatureData,
              yAxisID: 'y-temperature',
            },
            {
              label: "Peso (g)",
              tension: 0.4,
              borderWidth: 3,
              pointRadius: 3,
              borderColor: "#3A416F",
              backgroundColor: "rgba(58, 65, 111, 0.1)",
              fill: true,
              data: this.weightData,
              yAxisID: 'y-weight',
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false, // Desactivar animación para mejor rendimiento
          plugins: {
            legend: {
              display: true,
              position: 'top',
            },
            tooltip: {
              mode: 'index',
              intersect: false,
            }
          },
          interaction: {
            intersect: false,
            mode: 'nearest',
          },
          elements: {
            line: {
              tension: 0.4
            }
          },
          scales: {
            'y-temperature': {
              type: 'linear',
              display: true,
              position: 'left',
              title: {
                display: true,
                text: 'Temperatura (°C)'
              },
              ticks: {
                color: '#cb0c9f',
              }
            },
            'y-weight': {
              type: 'linear',
              display: true,
              position: 'right',
              title: {
                display: true,
                text: 'Peso (g)'
              },
              ticks: {
                color: '#3A416F',
              },
              grid: {
                drawOnChartArea: false, // Solo mostrar líneas de rejilla para temperatura
              }
            }
          }
        },
      });
      
      console.log("Gráfico creado correctamente");
    } catch (error) {
      console.error("Error al crear el gráfico:", error);
    }
  }
  
  // Añadir un nuevo punto de datos
  addDataPoint(type, value) {
    // Solo añadir puntos si está en modo adquisición y la gráfica no está pausada
    if (!this.isRunning || this.graphPaused) return;
    
    const currentTime = new Date().toLocaleTimeString();
    
    // Añadir etiqueta de tiempo si es necesario
    if (this.timeLabels.length === 0 || 
        this.timeLabels[this.timeLabels.length - 1] !== currentTime) {
      this.timeLabels.push(currentTime);
      
      // Limitar el número de puntos mostrados
      if (this.timeLabels.length > this.maxDataPoints) {
        this.timeLabels.shift();
        if (this.temperatureData.length > 0) this.temperatureData.shift();
        if (this.weightData.length > 0) this.weightData.shift();
      }
    }
    
    // Simplemente añadir el nuevo valor según su tipo
    if (type === 'temperature') {
      this.temperatureData.push(value);
      
      // Asegurar que el último punto de peso se mantenga actualizado
      if (this.weightData.length < this.temperatureData.length) {
        this.weightData.push(this.weightData.length > 0 ? this.weightData[this.weightData.length - 1] : null);
      }
    } else if (type === 'weight') {
      this.weightData.push(value);
      
      // Asegurar que el último punto de temperatura se mantenga actualizado
      if (this.temperatureData.length < this.weightData.length) {
        this.temperatureData.push(this.temperatureData.length > 0 ? this.temperatureData[this.temperatureData.length - 1] : null);
      }
    }
    
    // Mantener los arrays con la misma longitud que las etiquetas de tiempo
    while (this.temperatureData.length > this.timeLabels.length) this.temperatureData.pop();
    while (this.weightData.length > this.timeLabels.length) this.weightData.pop();
    
    // Debug
    console.log(`Datos - etiquetas: ${this.timeLabels.length}, temp: ${this.temperatureData.length}, peso: ${this.weightData.length}`);
    
    // Actualizar el gráfico
    this.updateChart();
  }
  
  // Actualizar gráfico
  updateChart() {
    if (this.temperatureWeightChart) {
      this.temperatureWeightChart.data.labels = this.timeLabels;
      this.temperatureWeightChart.data.datasets[0].data = this.temperatureData;
      this.temperatureWeightChart.data.datasets[1].data = this.weightData;
      this.temperatureWeightChart.update();
    }
  }
  
  // Enviar comando a través de WebSocket
  sendCommand(command) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ command: command }));
      this.updateStatus(`Comando enviado: ${command}`);
    } else {
      this.updateStatus('No hay conexión con el servidor');
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
document.addEventListener('DOMContentLoaded', () => {
  console.log("Inicializando monitor de sensores...");
  
  // Eliminar cualquier gráfico existente primero
  const existingChart = Chart.getChart("chart-line");
  if (existingChart) {
    existingChart.destroy();
  }
  
  // Eliminar variables globales que pueden interferir
  if (window.chartLine) {
    try {
      window.chartLine.destroy();
    } catch (e) { 
      console.log("Error al destruir chartLine:", e);
    }
    delete window.chartLine;
  }
  
  // Eliminar script conflictivo en dashboard.html
  const scripts = document.querySelectorAll('script');
  scripts.forEach(script => {
    if (!script.src && 
        (script.textContent.includes('temperatureData') || 
        script.textContent.includes('chartLine'))) {
      console.log("Eliminando script conflictivo");
      script.textContent = '// Script deshabilitado';
    }
  });
  
  // Inicializar el nuevo monitor de sensores
  window.sensorMonitor = new SensorMonitor();
});
