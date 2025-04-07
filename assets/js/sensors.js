// Configuración de gráficas y comunicación WebSocket para sensores
class SensorMonitor {
  constructor() {
    // Variables para datos de los sensores
    this.temperatureData = [];
    this.weightData = [];
    this.timeLabels = [];
    this.maxDataPoints = 60; // Mayor cantidad de puntos para mejor visualización
    
    // Referencias a los gráficos
    this.temperatureWeightChart = null;
    
    // Conexión WebSocket
    this.ws = null;
    
    // Estado del sistema
    this.isRunning = false;
    
    // Timestamps para calcular el tiempo real de muestreo
    this.lastTempTimestamp = 0;
    this.lastWeightTimestamp = 0;
    this.tempSamples = [];
    this.weightSamples = [];
    
    // Contador de datos recibidos
    this.dataReceived = 0;
    
    // Flag para controlar si se debe dibujar con líneas
    this.drawWithLines = false;
    
    // Inicializar
    this.initWebSocket();
    this.setupControls();
    this.createCharts();
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
            
            this.addDataPoint('temperature', data.value);
            document.getElementById('temp-value').textContent = `${data.value.toFixed(2)} °C`;
            this.dataReceived++;
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
            
            this.addDataPoint('weight', data.value);
            document.getElementById('weight-value').textContent = `${data.value.toFixed(2)} g`;
            this.dataReceived++;
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
    
    // Controles para tiempos de muestreo
    document.getElementById('temp-sample-time').addEventListener('change', (e) => {
      const value = e.target.value;
      this.sendCommand(`T1:${value}`);
      // Reiniciar el cálculo del tiempo de muestreo
      this.tempSamples = [];
    });
    
    document.getElementById('weight-sample-time').addEventListener('change', (e) => {
      const value = e.target.value;
      this.sendCommand(`T2:${value}`);
      // Reiniciar el cálculo del tiempo de muestreo
      this.weightSamples = [];
    });
    
    // Control para unidad de tiempo
    document.getElementById('time-unit').addEventListener('change', (e) => {
      const value = e.target.value;
      this.sendCommand(`TU:${value}`);
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
    const ctx = document.getElementById("chart-line").getContext("2d");
    
    // Asegurarnos de que Chart.js esté correctamente inicializado
    if (typeof Chart === 'undefined') {
      console.error('¡Chart.js no está cargado correctamente!');
      return;
    }
    
    try {
      // Configuración común para ambos conjuntos de datos
      const commonConfig = {
        borderWidth: 3,
        pointRadius: 3,
        fill: false,
        tension: this.drawWithLines ? 0.4 : 0
      };

      this.temperatureWeightChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: this.timeLabels,
          datasets: [
            {
              label: "Temperatura (°C)",
              borderColor: "#cb0c9f",
              backgroundColor: "rgba(203, 12, 159, 0.2)",
              pointBackgroundColor: "#cb0c9f",
              pointBorderColor: "#cb0c9f",
              data: this.temperatureData,
              yAxisID: 'y-temperature',
              ...commonConfig
            },
            {
              label: "Peso (g)",
              borderColor: "#3A416F",
              backgroundColor: "rgba(58, 65, 111, 0.2)",
              pointBackgroundColor: "#3A416F",
              pointBorderColor: "#3A416F",
              data: this.weightData,
              yAxisID: 'y-weight',
              ...commonConfig
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 0, // Desactivar animación para mejor rendimiento inicial
          },
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
          scales: {
            'y-temperature': {
              type: 'linear',
              display: true,
              position: 'left',
              title: {
                display: true,
                text: 'Temperatura (°C)'
              },
              grid: {
                drawBorder: false,
                display: true,
                drawOnChartArea: true,
                drawTicks: false,
                borderDash: [5, 5]
              },
              ticks: {
                display: true,
                padding: 10,
                color: '#b2b9bf',
                font: {
                  size: 11,
                  family: "Inter",
                  style: 'normal',
                  lineHeight: 2
                },
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
              grid: {
                drawBorder: false,
                display: false,
              },
              ticks: {
                display: true,
                padding: 10,
                color: '#3A416F',
                font: {
                  size: 11,
                  family: "Inter",
                  style: 'normal',
                  lineHeight: 2
                },
              }
            },
            x: {
              grid: {
                drawBorder: false,
                display: false,
              },
              ticks: {
                display: true,
                color: '#b2b9bf',
                padding: 20,
                font: {
                  size: 11,
                  family: "Inter",
                  style: 'normal',
                  lineHeight: 2
                },
              }
            },
          },
        },
      });
      
      // Actualizar el estado del botón según si estamos mostrando líneas o puntos
      const refreshButton = document.getElementById('chart-refresh');
      if (refreshButton) {
        refreshButton.textContent = this.drawWithLines ? "Mostrar solo puntos" : "Conectar puntos";
      }
      
      console.log("Gráfico creado correctamente");
    } catch (error) {
      console.error("Error al crear el gráfico:", error);
    }
  }
  
  // Añadir un nuevo punto de datos
  addDataPoint(type, value) {
    // Solo añadir puntos si está en modo adquisición
    if (!this.isRunning) return;
    
    const currentTime = new Date().toLocaleTimeString();
    
    // Añadir nuevas etiquetas de tiempo
    this.timeLabels.push(currentTime);
    if (this.timeLabels.length > this.maxDataPoints) {
      this.timeLabels.shift();
    }
    
    if (type === 'temperature') {
      // Añadir dato de temperatura
      this.temperatureData.push(value);
      if (this.temperatureData.length > this.maxDataPoints) {
        this.temperatureData.shift();
      }
    } else if (type === 'weight') {
      // Añadir dato de peso
      this.weightData.push(value);
      if (this.weightData.length > this.maxDataPoints) {
        this.weightData.shift();
      }
    }
    
    // Asegurarse de que ambos arrays tengan la misma longitud
    while (this.temperatureData.length < this.timeLabels.length) {
      this.temperatureData.push(null);
    }
    while (this.weightData.length < this.timeLabels.length) {
      this.weightData.push(null);
    }
    
    this.updateChart();
  }
  
  // Actualizar gráfico
  updateChart() {
    if (this.temperatureWeightChart) {
      this.temperatureWeightChart.data.labels = this.timeLabels;
      this.temperatureWeightChart.data.datasets[0].data = this.temperatureData;
      this.temperatureWeightChart.data.datasets[1].data = this.weightData;
      
      // Aplicar la configuración de líneas o puntos
      const tension = this.drawWithLines ? 0.4 : 0;
      this.temperatureWeightChart.data.datasets.forEach(dataset => {
        dataset.tension = tension;
      });
      
      this.temperatureWeightChart.update();
    }
  }
  
  // Alternar entre mostrar líneas o puntos
  toggleLineMode() {
    this.drawWithLines = !this.drawWithLines;
    
    if (this.temperatureWeightChart) {
      // Destruir y recrear el gráfico para aplicar cambios
      this.temperatureWeightChart.destroy();
      this.createCharts();
    }
    
    return this.drawWithLines;
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
    console.log(message);
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  // Eliminar la configuración de gráfico previa
  if (window.chartLine) {
    window.chartLine.destroy();
  }
  
  // Eliminar el script antiguo para evitar conflictos
  const oldScript = document.getElementById("old-chart-script");
  if (oldScript) {
    oldScript.remove();
  }
  
  // Inicializar el nuevo monitor de sensores
  window.sensorMonitor = new SensorMonitor();
  
  // Configurar el botón para alternar entre líneas y puntos
  document.getElementById('chart-refresh').addEventListener('click', function() {
    if (window.sensorMonitor) {
      const showingLines = window.sensorMonitor.toggleLineMode();
      this.textContent = showingLines ? "Mostrar solo puntos" : "Conectar puntos";
      this.innerHTML = showingLines ? 
        '<i class="fas fa-circle me-1"></i> Mostrar solo puntos' : 
        '<i class="fas fa-project-diagram me-1"></i> Conectar puntos';
    }
  });
});
