/**
 * Script para reiniciar dispositivo en caso de problemas
 */
(function() {
  // Agregar botón de reinicio de emergencia
  window.addEventListener('load', () => {
    // Crear el botón flotante en la esquina inferior derecha
    const resetButton = document.createElement('button');
    resetButton.textContent = '🔄 Reiniciar Dispositivo';
    resetButton.className = 'btn btn-sm btn-warning';
    resetButton.style.cssText = `
      position: fixed;
      right: 15px;
      bottom: 15px;
      z-index: 1000;
      opacity: 0.8;
      border-radius: 20px;
      font-size: 12px;
    `;
    
    resetButton.addEventListener('click', () => {
      if (!confirm('¿Seguro que desea reiniciar el dispositivo y la configuración?')) return;
      
      if (window.sensorMonitor && window.sensorMonitor.ws && 
          window.sensorMonitor.ws.readyState === WebSocket.OPEN) {
        
        const sendSequence = async () => {
          try {
            // Mostrar modal de progreso
            showProgressModal('Reiniciando dispositivo...');
            
            // Detener adquisición
            updateProgress('Deteniendo adquisición...', 10);
            window.sensorMonitor.sendCommand('b');
            await sleep(1000);
            
            // Reconfigurar parámetros por defecto
            updateProgress('Configurando tiempo de temperatura...', 20);
            window.sensorMonitor.sendCommand('T1:1');
            await sleep(500);
            
            updateProgress('Configurando tiempo de intensidad...', 30);
            window.sensorMonitor.sendCommand('T2:1');
            await sleep(500);
            
            updateProgress('Configurando unidad de tiempo...', 40);
            window.sensorMonitor.sendCommand('TU:s');
            await sleep(500);
            
            updateProgress('Desactivando filtros...', 50);
            window.sensorMonitor.sendCommand('FT:0');
            await sleep(500);
            
            updateProgress('Desactivando filtros...', 60);
            window.sensorMonitor.sendCommand('FP:0');
            await sleep(500);
            
            updateProgress('Configurando muestras por defecto...', 70);
            window.sensorMonitor.sendCommand('ST:10');
            await sleep(500);
            
            updateProgress('Configurando muestras por defecto...', 80);
            window.sensorMonitor.sendCommand('SP:10');
            await sleep(500);
            
            updateProgress('Reiniciando adquisición...', 90);
            window.sensorMonitor.sendCommand('a');
            await sleep(1000);
            
            updateProgress('¡Reinicio completado!', 100);
            
            // Esperar y ocultar modal
            await sleep(1000);
            hideProgressModal();
            
            // Recargar la página para reiniciar la interfaz
            window.location.reload();
          } catch (err) {
            console.error('Error en secuencia de reinicio:', err);
            hideProgressModal();
            alert('Error al reiniciar dispositivo: ' + err.message);
          }
        };
        
        sendSequence();
      } else {
        alert('No hay conexión con el servidor para reiniciar el dispositivo.');
      }
    });
    
    document.body.appendChild(resetButton);
    
    // Comprobar si las teclas Ctrl+Alt+R están presionadas
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.altKey && e.key === 'r') {
        resetButton.click();
      }
    });
  });
  
  // Función de espera
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Crear y mostrar modal de progreso
  function showProgressModal(title) {
    // Crear el modal si no existe
    if (!document.getElementById('reset-progress-modal')) {
      const modal = document.createElement('div');
      modal.id = 'reset-progress-modal';
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
      `;
      
      const modalContent = document.createElement('div');
      modalContent.style.cssText = `
        background-color: white;
        padding: 20px;
        border-radius: 10px;
        width: 80%;
        max-width: 400px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
      `;
      
      const modalTitle = document.createElement('h5');
      modalTitle.id = 'progress-title';
      modalTitle.textContent = title;
      
      const progressContainer = document.createElement('div');
      progressContainer.style.cssText = `
        width: 100%;
        height: 20px;
        background-color: #f0f0f0;
        border-radius: 10px;
        margin: 20px 0 10px;
        overflow: hidden;
      `;
      
      const progressBar = document.createElement('div');
      progressBar.id = 'progress-bar';
      progressBar.style.cssText = `
        height: 100%;
        width: 0%;
        background-color: #2dce89;
        transition: width 0.3s ease;
      `;
      
      const progressText = document.createElement('div');
      progressText.id = 'progress-text';
      progressText.textContent = 'Iniciando...';
      progressText.style.cssText = `
        text-align: center;
        margin-top: 10px;
        font-size: 14px;
        color: #8392AB;
      `;
      
      progressContainer.appendChild(progressBar);
      modalContent.appendChild(modalTitle);
      modalContent.appendChild(progressContainer);
      modalContent.appendChild(progressText);
      modal.appendChild(modalContent);
      
      document.body.appendChild(modal);
    }
    
    // Mostrar el modal
    document.getElementById('reset-progress-modal').style.display = 'flex';
  }
  
  // Actualizar progreso
  function updateProgress(text, percentage) {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    
    if (progressBar && progressText) {
      progressBar.style.width = `${percentage}%`;
      progressText.textContent = text;
      
      if (percentage === 100) {
        progressBar.style.backgroundColor = '#2dce89';
      }
    }
  }
  
  // Ocultar modal
  function hideProgressModal() {
    const modal = document.getElementById('reset-progress-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }
})();
