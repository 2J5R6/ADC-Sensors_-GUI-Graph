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

// Configuración WebSocket simple
const wss = new WebSocket.Server({ server });

// Función para enviar un comando al puerto serial
function sendCommand(port, command) {
  if (!port) {
    console.error("Puerto serial no disponible");
    return Promise.reject(new Error("Puerto no disponible"));
  }

  // Asegurar el formato correcto del comando
  let cmd = command;
  if (!cmd.endsWith('\r\n')) {
    cmd += '\r\n';
  }
  
  console.log(`Enviando comando: ${cmd.trim()}`);
  
  return new Promise((resolve, reject) => {
    port.write(cmd, (err) => {
      if (err) {
        console.error(`Error al enviar comando ${cmd.trim()}:`, err);
        reject(err);
      } else {
        console.log(`Comando ${cmd.trim()} enviado correctamente`);
        resolve();
      }
    });
  });
}

// Función para abrir el puerto serial
function openSerialPort() {
  try {
    const port = new SerialPort.SerialPort({
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
      setTimeout(() => {
        console.log('Enviando comandos de inicialización...');
        
        // Primero detener cualquier adquisición en curso
        sendCommand(port, 'b')
          .then(() => {
            console.log('Sistema parado, solicitando estado actual');
            
            // Luego solicitar el estado
            setTimeout(() => {
              sendCommand(port, 'STATUS')
                .catch(err => console.error('Error al solicitar estado:', err));
            }, 1000);
          })
          .catch(err => {
            console.error('Error en secuencia de inicialización:', err);
          });
      }, 2000);
    });
    
    // Procesar datos recibidos del puerto serie
    parser.on('data', (data) => {
      console.log('Datos recibidos:', data);
      
      try {
        // Estructura para enviar los datos formateados
        let sensorData = null;
        
        // Procesar datos de temperatura
        if (data.startsWith('TEMP:')) {
          const tempValue = parseFloat(data.substring(5));
          if (!isNaN(tempValue)) {
            sensorData = { type: 'temperature', value: tempValue };
            lastMessages.temperature = sensorData;
            console.log(`Temperatura procesada: ${tempValue}°C`);
          }
        } 
        // Procesar datos de peso/intensidad
        else if (data.startsWith('PESO:')) {
          // Extraer parte numérica
          const intensityText = data.substring(5).trim();
          const intensityValue = parseFloat(intensityText);
          
          console.log(`Procesando dato de intensidad: ${intensityText}`);
          
          if (!isNaN(intensityValue)) {
            // Seguimos usando 'weight' como tipo para mantener compatibilidad
            sensorData = { type: 'weight', value: intensityValue };
            lastMessages.weight = sensorData;
            console.log(`Intensidad procesada: ${intensityValue}%`);
            
            // Enviar dato específicamente a todos los clientes para asegurar recepción
            const dataStr = JSON.stringify(sensorData);
            for (const client of connections) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(dataStr);
              }
            }
          }
        }
        // Procesar confirmaciones de comandos
        else if (data.startsWith('OK:') || data.startsWith('ERROR:')) {
          sensorData = { type: 'confirmation', message: data };
          console.log('Confirmación recibida:', data);
          
          // Actualizar estado del sistema basado en confirmaciones
          if (data === 'OK:a') {
            systemState.isRunning = true;
            console.log('Sistema de adquisición ACTIVADO');
          }
          else if (data === 'OK:b') {
            systemState.isRunning = false;
            console.log('Sistema de adquisición DETENIDO');
          }
          else if (data.startsWith('OK:T1:')) {
            systemState.tempSampleTime = parseInt(data.split(':')[2]);
          }
          else if (data.startsWith('OK:T2:')) {
            systemState.weightSampleTime = parseInt(data.split(':')[2]);
          }
          else if (data.startsWith('OK:TU:')) {
            systemState.timeUnit = data.split(':')[2];
          }
          else if (data.startsWith('OK:FT:')) {
            systemState.tempFilter = data.split(':')[2] === '1';
          }
          else if (data.startsWith('OK:FP:')) {
            systemState.weightFilter = data.split(':')[2] === '1';
          }
          else if (data.startsWith('OK:ST:')) {
            systemState.tempSamples = parseInt(data.split(':')[2]);
          }
          else if (data.startsWith('OK:SP:')) {
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
              state: {...systemState}
            };
            console.log('Estado del sistema actualizado:', systemState);
          } catch (err) {
            console.error('Error al procesar estado:', err);
          }
        }
        
        // Enviar los datos a todos los clientes conectados si hay datos válidos
        if (sensorData) {
          for (const client of connections) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(sensorData));
            }
          }
        }
      } catch (err) {
        console.error('Error al procesar datos:', err);
      }
    });
    
    return { port, parser };
  } catch (e) {
    console.error('Error al abrir puerto serie:', e);
    console.error('Asegúrate de que el puerto COM sea correcto y esté disponible.');
    console.error(`Puerto configurado: ${SERIAL_PORT}`);
    
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
  
  // Enviar estado actual al nuevo cliente
  ws.send(JSON.stringify({
    type: 'status',
    state: {...systemState}
  }));
  
  // Enviar últimos valores de sensores si existen
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
      
      if (data.command && serialConnection && serialConnection.port) {
        // Comandos simples (a, b) enviados tal cual
        const cmd = data.command.trim();
        
        // Para los comandos a/b, enviar una sola vez para evitar problemas
        if (cmd === 'a' || cmd === 'b') {
          sendCommand(serialConnection.port, cmd)
            .then(() => {
              // Si el comando es b (detener), esperar y verificar estado
              if (cmd === 'b') {
                setTimeout(() => {
                  sendCommand(serialConnection.port, 'STATUS')
                    .catch(err => console.error('Error al solicitar estado:', err));
                }, 1000);
              }
            })
            .catch(err => {
              console.error(`Error al enviar comando ${cmd}:`, err);
              ws.send(JSON.stringify({
                type: 'error',
                message: `Error: ${err.message}`
              }));
            });
        } else {
          // Otros comandos
          sendCommand(serialConnection.port, cmd)
            .catch(err => {
              console.error(`Error al enviar comando ${cmd}:`, err);
              ws.send(JSON.stringify({
                type: 'error',
                message: `Error: ${err.message}`
              }));
            });
        }
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

// Manejar errores no capturados
process.on('uncaughtException', (err) => {
  console.error('Error no capturado:', err);
});
