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
const wss = new WebSocket.Server({ 
  server,
  path: '/', // Path explícito
  perMessageDeflate: false // Desactivar compresión para evitar problemas
});

// Función para enviar un comando al puerto serial con promesa para saber cuándo se completa
function sendCommand(port, command) {
  if (!port) {
    console.error("Puerto serial no disponible");
    return Promise.reject(new Error("Puerto no disponible"));
  }

  // Preparar comando con salto de línea
  const formattedCmd = command.endsWith('\r\n') ? command : command + '\r\n';
  
  console.log(`📤 Enviando comando: ${command}`);
  
  return new Promise((resolve, reject) => {
    port.write(formattedCmd, (err) => {
      if (err) {
        console.error(`❌ Error al enviar comando: ${err.message}`);
        reject(err);
      } else {
        console.log(`✅ Comando ${command} enviado correctamente`);
        resolve();
      }
    });
  });
}

// Función para enviar un comando y esperar respuesta (con retries)
async function sendCommandWithResponse(port, command, expectedResponse, maxRetries = 3) {
  let retries = 0;
  let success = false;

  while (retries < maxRetries && !success) {
    try {
      // Limpiar cualquier dato en el buffer
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log(`📤 Intentando comando: ${command} (intento ${retries + 1})`);
      const formattedCmd = command.endsWith('\r\n') ? command : command + '\r\n';
      
      // Enviar el comando
      await new Promise((resolve, reject) => {
        port.write(formattedCmd, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Esperamos respuesta directamente del controlador
      console.log(`✅ Comando ${command} enviado correctamente, esperando respuesta...`);
      success = true;
    } catch (err) {
      console.error(`❌ Error en intento ${retries + 1}: ${err.message}`);
      retries++;
      // Espera incremental entre reintentos
      await new Promise(resolve => setTimeout(resolve, 500 * retries));
    }
  }
  
  return success;
}

// Función para ejecutar secuencia de configuración con pausas adecuadas
async function executeConfigSequence(port, command) {
  try {
    console.log('🔄 Iniciando secuencia de configuración...');
    
    // 1. Detener la adquisición
    console.log('⏹️ Deteniendo adquisición...');
    await sendCommandWithResponse(port, 'b', 'OK:b');
    
    // Esperar a que el sistema se estabilice
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 2. Enviar comando de configuración
    console.log(`🛠️ Enviando configuración: ${command}`);
    await sendCommandWithResponse(port, command, `OK:${command.split(':')[0]}`);
    
    // Actualizar estado del sistema en base al comando
    const [setting, value] = command.split(':');
    if (setting === 'T1') systemState.tempSampleTime = parseInt(value);
    else if (setting === 'T2') systemState.weightSampleTime = parseInt(value);
    else if (setting === 'TU') systemState.timeUnit = value;
    else if (setting === 'FT') systemState.tempFilter = value === '1';
    else if (setting === 'FP') systemState.weightFilter = value === '1';
    else if (setting === 'ST') systemState.tempSamples = parseInt(value);
    else if (setting === 'SP') systemState.weightSamples = parseInt(value);
    
    // Esperar a que la configuración se aplique
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 3. Reanudar adquisición
    console.log('▶️ Reiniciando adquisición...');
    await sendCommandWithResponse(port, 'a', 'OK:a');
    
    // 4. Actualizar estado para interfaces
    systemState.isRunning = true;
    
    // 5. Notificar éxito
    console.log('✅ Secuencia de configuración completada');
    return true;
  } catch (error) {
    console.error('❌ Error en secuencia de configuración:', error);
    return false;
  }
}

// Función para abrir el puerto serial
function openSerialPort() {
  try {
    console.log(`Intentando abrir puerto serial: ${SERIAL_PORT} a ${BAUD_RATE} baudios`);
    
    const port = new SerialPort.SerialPort({
      path: SERIAL_PORT,
      baudRate: BAUD_RATE
    });
    
    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    
    // Manejar apertura exitosa
    port.on('open', () => {
      console.log(`✅ Puerto serial ${SERIAL_PORT} conectado correctamente`);
      
      // Inicializar el sistema con estado detenido
      setTimeout(() => sendCommand(port, 'b'), 1000);
    });
    
    // Manejar errores
    port.on('error', (err) => {
      console.error(`❌ Error en puerto serial: ${err.message}`);
      
      // Reintentar conexión después de un tiempo
      setTimeout(openSerialPort, 5000);
    });
    
    // Procesar datos recibidos
    parser.on('data', (data) => {
      console.log(`📊 Datos recibidos: ${data}`);
      
      // Extraer tipo y valor de datos
      let sensorData = null;
      
      // Temperatura (TEMP:25.60)
      if (data.startsWith('TEMP:')) {
        const value = parseFloat(data.substring(5));
        if (!isNaN(value)) {
          sensorData = { type: 'temperature', value };
          lastMessages.temperature = sensorData;
        }
      } 
      // Intensidad/Peso (PESO:75.30)
      else if (data.startsWith('PESO:')) {
        const value = parseFloat(data.substring(5));
        if (!isNaN(value)) {
          sensorData = { type: 'weight', value };
          lastMessages.weight = sensorData;
        }
      }
      // Confirmaciones (OK:a, OK:b, etc.)
      else if (data.startsWith('OK:')) {
        const command = data.substring(3);
        sensorData = { type: 'confirmation', message: data };
        
        // Actualizar estado basado en la confirmación
        if (command === 'a') {
          systemState.isRunning = true;
        } else if (command === 'b') {
          systemState.isRunning = false;
        }
      }
      // Otros mensajes (debug, errores, etc.)
      else {
        console.log(`ℹ️ Mensaje no procesado: ${data}`);
      }
      
      // Distribuir datos a todos los clientes
      if (sensorData) {
        const dataStr = JSON.stringify(sensorData);
        connections.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(dataStr);
          }
        });
      }
    });
    
    return { port, parser };
  } catch (err) {
    console.error(`❌ Error al abrir puerto serial: ${err.message}`);
    setTimeout(openSerialPort, 5000);
    return null;
  }
}

// Iniciar conexión serial
let serialConnection = openSerialPort();

// Manejar conexiones WebSocket
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`👤 Cliente conectado desde ${clientIp}`);
  connections.add(ws);
  
  // Enviar datos actuales al cliente
  if (lastMessages.temperature) {
    ws.send(JSON.stringify(lastMessages.temperature));
  }
  
  if (lastMessages.weight) {
    ws.send(JSON.stringify(lastMessages.weight));
  }
  
  // Notificar estado actual
  ws.send(JSON.stringify({
    type: 'status',
    state: systemState
  }));
  
  // Manejar comandos desde el frontend - simplificado y robusto
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (!data.command || !serialConnection || !serialConnection.port) {
        console.log('❌ Comando no válido o conexión serial no disponible');
        return;
      }
      
      const command = data.command.trim();
      console.log(`📩 Recibido comando: ${command}`);
      
      // Manejar comandos simples de inicio/parada
      if (command === 'a') {
        await sendCommandWithResponse(serialConnection.port, 'a', 'OK:a');
        systemState.isRunning = true;
        
        // Notificar a todos los clientes
        const confirmation = { type: 'confirmation', message: 'OK:a' };
        const status = { type: 'status', state: {...systemState} };
        
        connections.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(confirmation));
            client.send(JSON.stringify(status));
          }
        });
      } 
      else if (command === 'b') {
        await sendCommandWithResponse(serialConnection.port, 'b', 'OK:b');
        systemState.isRunning = false;
        
        // Notificar a todos los clientes
        const confirmation = { type: 'confirmation', message: 'OK:b' };
        const status = { type: 'status', state: {...systemState} };
        
        connections.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(confirmation));
            client.send(JSON.stringify(status));
          }
        });
      }
      // Manejar comandos de configuración (patrón clave:valor)
      else if (
        command.match(/^(T1|T2|TU|FT|FP|ST|SP):\S+$/)
      ) {
        // Para todos los comandos de configuración, usar la secuencia completa
        const success = await executeConfigSequence(serialConnection.port, command);
        
        if (success) {
          // Notificar a todos los clientes
          connections.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              // Enviar confirmación
              client.send(JSON.stringify({
                type: 'confirmation',
                message: `OK:${command}`
              }));
              
              // Enviar estado actualizado
              client.send(JSON.stringify({
                type: 'status',
                state: {...systemState}
              }));
            }
          });
        } else {
          // Notificar error
          ws.send(JSON.stringify({
            type: 'error',
            message: `Error al aplicar configuración: ${command}`
          }));
        }
      }
      else if (command === 'STATUS') {
        // Comando de estado, solo enviarlo
        await sendCommandWithResponse(serialConnection.port, 'STATUS');
      }
      else {
        console.log(`⚠️ Comando desconocido: ${command}`);
      }
    } catch (e) {
      console.error(`❌ Error al procesar mensaje: ${e.message}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Error: ${e.message}`
      }));
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
