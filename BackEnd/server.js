try {
  require('dotenv').config();
} catch (e) {
  console.log('Módulo dotenv no instalado. Usando valores predeterminados.');
}
const SerialPort = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Buscar archivo de configuración manual
let manualConfig = {};
try {
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    manualConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('Configuración cargada desde config.json');
  }
} catch (e) {
  console.error('Error al cargar config.json:', e.message);
}

// Obtener configuración desde .env, config.json o valores predeterminados
const PORT = process.env.SERVER_PORT || manualConfig.SERVER_PORT || 3000;
const SERIAL_PORT = process.env.SERIAL_PORT || manualConfig.SERIAL_PORT || 'COM3';
const BAUD_RATE = parseInt(process.env.BAUD_RATE || manualConfig.BAUD_RATE || '9600');

// Crear archivo de configuración si no existe
try {
  const configPath = path.join(__dirname, 'config.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
      SERVER_PORT: PORT,
      SERIAL_PORT: SERIAL_PORT,
      BAUD_RATE: BAUD_RATE
    }, null, 2));
    console.log('Archivo config.json creado con valores predeterminados');
  }
} catch (e) {
  console.error('Error al crear config.json:', e.message);
}

// Registrar inicialización
console.log(`Iniciando servidor en puerto ${PORT}`);
console.log(`Configuración Serial: Puerto=${SERIAL_PORT}, BaudRate=${BAUD_RATE}`);

// Configuración del servidor Express
app.use(express.static(path.join(__dirname, '..')));
const server = app.listen(PORT, () => {
  console.log(`Servidor web corriendo en http://localhost:${PORT}`);
});

// Variable para almacenar el último mensaje de cada tipo
let lastMessages = {
  temperature: null,
  weight: null
};

// Set para almacenar conexiones activas
const connections = new Set();

// Estado del sistema
let systemState = {
  isRunning: false,
  tempSampleTime: 1,
  weightSampleTime: 1,
  timeUnit: 's',
  tempFilter: false,
  weightFilter: false,
  tempSamples: 10,
  weightSamples: 10
};

// Configuración WebSocket con ping/pong para mantener conexiones vivas
const wss = new WebSocket.Server({ 
  server,
  clientTracking: true
});

// Mantener conexiones activas con heartbeat
function heartbeat() {
  this.isAlive = true;
}

// Verificar conexiones cada 30 segundos
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Cliente inactivo desconectado');
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

// Limpiar intervalo cuando se cierra el servidor
wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Función para enviar un comando al puerto serial con reintentos
function sendSerialCommand(port, command, retries = 3) {
  return new Promise((resolve, reject) => {
    if (!port) {
      return reject(new Error("Puerto serial no disponible"));
    }
    
    // Asegurar que el comando termine con salto de línea
    const formattedCmd = command.endsWith('\r\n') ? command : command + '\r\n';
    let attempt = 0;
    
    const attemptSend = () => {
      attempt++;
      console.log(`Intento ${attempt}/${retries} de enviar comando: ${command}`);
      
      port.write(formattedCmd, (err) => {
        if (err) {
          console.error(`Error al enviar ${command} (intento ${attempt}):`, err);
          if (attempt < retries) {
            setTimeout(attemptSend, 100);
          } else {
            reject(err);
          }
        } else {
          resolve();
        }
      });
    };
    
    attemptSend();
  });
}

// Función para abrir el puerto serial
function openSerialPort() {
  let port;
  try {
    port = new SerialPort.SerialPort({
      path: SERIAL_PORT,
      baudRate: BAUD_RATE,
    });
    
    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    
    // Manejar errores del puerto serie
    port.on('error', (err) => {
      console.error('Error en el puerto serie:', err);
      setTimeout(() => {
        console.log('Reintentando conexión al puerto serial...');
        openSerialPort();
      }, 5000); // Reintentar en 5 segundos
    });
    
    // Manejar apertura del puerto
    port.on('open', () => {
      console.log(`Puerto serie ${SERIAL_PORT} conectado a ${BAUD_RATE} baudios`);
      
      // Secuencia de inicialización
      setTimeout(async () => {
        console.log('Enviando comandos de inicialización...');
        
        try {
          // Primero detener cualquier adquisición en curso
          await sendSerialCommand(port, 'b');
          
          // Luego solicitar el estado
          setTimeout(async () => {
            await sendSerialCommand(port, 'STATUS');
          }, 500);
        } catch (err) {
          console.error('Error en secuencia de inicialización:', err);
        }
      }, 1000);
    });
    
    // Procesar datos recibidos del puerto serie
    parser.on('data', (data) => {
      console.log('Datos recibidos:', data);
      
      // Estructura para enviar los datos formateados
      let sensorData = null;
      
      // Procesar datos de temperatura
      if (data.startsWith('TEMP:')) {
        const tempValue = parseFloat(data.substring(5));
        if (!isNaN(tempValue)) {
          sensorData = { type: 'temperature', value: tempValue };
          lastMessages.temperature = sensorData;
        }
      } 
      // Procesar datos de peso
      else if (data.startsWith('PESO:')) {
        const weightValue = parseFloat(data.substring(5));
        if (!isNaN(weightValue)) {
          console.log(`Valor de peso recibido: ${weightValue}`);
          sensorData = { type: 'weight', value: weightValue };
          lastMessages.weight = sensorData;
        }
      }
      // Procesar confirmaciones de comandos
      else if (data.startsWith('OK:') || data.startsWith('ERROR:')) {
        sensorData = { type: 'confirmation', message: data };
        console.log('Confirmación recibida:', data);
        
        // Actualizar estado del sistema basado en confirmaciones
        if (data.includes('OK:a')) {
          systemState.isRunning = true;
          console.log('Sistema de adquisición ACTIVADO');
        }
        else if (data.includes('OK:b')) {
          systemState.isRunning = false;
          console.log('Sistema de adquisición DETENIDO');
          
          // Solicitar estado actual después de detener
          setTimeout(() => {
            if (port) {
              sendSerialCommand(port, 'STATUS')
                .catch(err => console.error('Error al solicitar estado:', err));
            }
          }, 300);
        }
        else if (data.includes('OK:T1:')) {
          systemState.tempSampleTime = parseInt(data.split(':')[2]);
        }
        else if (data.includes('OK:T2:')) {
          systemState.weightSampleTime = parseInt(data.split(':')[2]);
        }
        else if (data.includes('OK:TU:')) {
          systemState.timeUnit = data.split(':')[2];
        }
        else if (data.includes('OK:FT:')) {
          systemState.tempFilter = data.includes('OK:FT:1');
        }
        else if (data.includes('OK:FP:')) {
          systemState.weightFilter = data.includes('OK:FP:1');
        }
        else if (data.includes('OK:ST:')) {
          systemState.tempSamples = parseInt(data.split(':')[2]);
        }
        else if (data.includes('OK:SP:')) {
          systemState.weightSamples = parseInt(data.split(':')[2]);
        }
      }
      // Procesar mensajes de estado
      else if (data.startsWith('INFO:STATUS:')) {
        try {
          // Extraer información del estado
          const statusInfo = data.substring(12);
          const statusParts = statusInfo.split(',');
          
          for (const part of statusParts) {
            const [key, value] = part.split('=');
            if (key === 'T1') systemState.tempSampleTime = parseInt(value);
            if (key === 'T2') systemState.weightSampleTime = parseInt(value);
            if (key === 'TU') systemState.timeUnit = value;
            if (key === 'FT') systemState.tempFilter = value === '1';
            if (key === 'FP') systemState.weightFilter = value === '1';
            if (key === 'ST') systemState.tempSamples = parseInt(value);
            if (key === 'SP') systemState.weightSamples = parseInt(value);
            if (key === 'RUN') systemState.isRunning = value === '1';
          }
          
          // Crear mensaje de estado para enviar a clientes
          sensorData = { 
            type: 'status',
            state: {...systemState}  // Enviar una copia del estado
          };
          console.log('Estado del sistema actualizado:', systemState);
        } catch (err) {
          console.error('Error al procesar estado:', err);
        }
      }
      
      // Enviar los datos a todos los clientes conectados
      if (sensorData) {
        for (const client of connections) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(sensorData));
          }
        }
      }
    });
    
    return { port, parser };
  } catch (e) {
    console.error('Error al abrir puerto serie:', e);
    console.error('Asegúrate de que el puerto COM sea correcto y esté disponible.');
    console.error(`Puerto configurado: ${SERIAL_PORT}`);
    console.error('Puedes cambiarlo en config.json');
    
    setTimeout(() => {
      console.log('Reintentando conexión al puerto serial...');
      openSerialPort();
    }, 5000);
    
    return null;
  }
}

// Iniciar conexión serial
let serialConnection = openSerialPort();

// Manejar conexiones WebSocket
wss.on('connection', (ws) => {
  console.log('Cliente conectado');
  connections.add(ws);
  
  // Configurar heartbeat para esta conexión
  ws.isAlive = true;
  ws.on('pong', heartbeat);
  
  // Enviar el estado actual del sistema
  ws.send(JSON.stringify({
    type: 'status',
    state: {...systemState}
  }));
  
  // Enviar los últimos valores al nuevo cliente
  if (lastMessages.temperature) {
    ws.send(JSON.stringify(lastMessages.temperature));
    console.log('Enviando último valor de temperatura al nuevo cliente');
  }
  
  if (lastMessages.weight) {
    ws.send(JSON.stringify(lastMessages.weight));
    console.log('Enviando último valor de peso al nuevo cliente');
  }
  
  // Enviar confirmación de conexión
  ws.send(JSON.stringify({
    type: 'confirmation',
    message: 'CONNECTION_OK'
  }));
  
  // Manejar comandos desde el frontend
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Si es un comando para la STM32
      if (data.command && serialConnection && serialConnection.port) {
        const cmd = data.command.trim();
        console.log(`Enviando comando a STM32: ${cmd}`);
        
        // Para comandos simples como 'a' y 'b', usar más reintentos
        const retries = (cmd === 'a' || cmd === 'b') ? 5 : 3;
        
        sendSerialCommand(serialConnection.port, cmd, retries)
          .catch(err => {
            console.error(`Error en comando ${cmd}:`, err);
            ws.send(JSON.stringify({
              type: 'error',
              message: `Error al enviar comando: ${err.message}`
            }));
          });
      }
    } catch (e) {
      console.error('Error al procesar mensaje:', e);
    }
  });
  
  // Manejar desconexión
  ws.on('close', () => {
    console.log('Cliente desconectado');
    connections.delete(ws);
  });
});

// Crear archivo de conectividad para monitoreo de conexión
const connectivityJsPath = path.join(__dirname, '..', 'assets', 'js', 'connectivity.js');
if (!fs.existsSync(connectivityJsPath)) {
  const connectivityJsContent = `
// Script para monitoreo de la conexión WebSocket
(function() {
  // Variables de control
  let connectionAttempts = 0;
  const MAX_RETRY = 5;
  let reconnectTimer = null;
  
  // Función para verificar el estado de la conexión
  function checkConnection() {
    if (window.sensorMonitor && window.sensorMonitor.ws) {
      if (window.sensorMonitor.ws.readyState === WebSocket.CLOSED || 
          window.sensorMonitor.ws.readyState === WebSocket.CLOSING) {
        
        console.log("[Connectivity] Detectada conexión cerrada");
        connectionAttempts++;
        
        if (connectionAttempts <= MAX_RETRY) {
          console.log(\`[Connectivity] Reiniciando conexión (intento \${connectionAttempts})\`);
          window.sensorMonitor.initWebSocket();
        } else {
          console.log("[Connectivity] Máximo de intentos alcanzado");
        }
      } else if (window.sensorMonitor.ws.readyState === WebSocket.OPEN) {
        connectionAttempts = 0; // Resetear contador cuando hay conexión
        console.log("[Connectivity] Conexión activa");
      }
    }
  }
  
  // Verificar periódicamente
  window.addEventListener('load', () => {
    // Comenzar verificación después de 5 segundos
    setTimeout(() => {
      reconnectTimer = setInterval(checkConnection, 5000);
    }, 5000);
  });
  
  // Limpiar al cerrar
  window.addEventListener('beforeunload', () => {
    if (reconnectTimer) clearInterval(reconnectTimer);
  });
})();
`;

  try {
    fs.writeFileSync(connectivityJsPath, connectivityJsContent);
    console.log('Archivo connectivity.js creado para monitoreo de conexión');
  } catch (err) {
    console.error('No se pudo crear el archivo connectivity.js:', err);
  }
}

// Manejar errores no capturados
process.on('uncaughtException', (err) => {
  console.error('Error no capturado:', err);
});
