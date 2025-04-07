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

// Configuración WebSocket
const wss = new WebSocket.Server({ server });

// Variable para almacenar el último mensaje de cada tipo
let lastMessages = {
  temperature: null,
  weight: null
};

// Función para enviar comandos a la STM32 con confirmación
function sendSerialCommand(port, command, callback) {
  if (!port) {
    console.error("Puerto no disponible");
    if (callback) callback(new Error("Puerto no disponible"));
    return;
  }

  console.log(`Enviando comando: ${command}`);
  port.write(command + '\r\n', (err) => {
    if (err) {
      console.error('Error al enviar comando:', err);
      if (callback) callback(err);
    } else {
      console.log(`Comando enviado exitosamente: ${command}`);
      if (callback) callback(null);
    }
  });
}

// Función para depurar la comunicación
function debugSerial(msg, data) {
  const debug = true; // Cambiar a false para desactivar mensajes de depuración
  if (debug) {
    console.log(`[DEBUG] ${msg}`, data || '');
  }
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
      
      // Enviar configuración inicial al dispositivo
      setTimeout(() => {
        console.log("Enviando configuración inicial...");
        sendSerialCommand(port, "TU:s", () => {}); // Configurar unidad de tiempo a segundos
        sendSerialCommand(port, "T1:1", () => {}); // Tiempo de muestreo temperatura = 1
        sendSerialCommand(port, "T2:1", () => {}); // Tiempo de muestreo peso = 1
      }, 2000);
    });
    
    // Procesar datos recibidos del puerto serie
    parser.on('data', (data) => {
      debugSerial('Datos recibidos:', data);
      
      // Estructura para enviar los datos formateados
      let sensorData = null;
      
      // Procesar datos de temperatura
      if (data.startsWith('TEMP:')) {
        const tempValue = parseFloat(data.substring(5));
        if (!isNaN(tempValue)) {
          sensorData = { type: 'temperature', value: tempValue };
          lastMessages.temperature = sensorData;
          debugSerial('Temperatura procesada:', tempValue);
        }
      } 
      // Procesar datos de peso
      else if (data.startsWith('PESO:')) {
        const weightValue = parseFloat(data.substring(5));
        if (!isNaN(weightValue)) {
          sensorData = { type: 'weight', value: weightValue };
          lastMessages.weight = sensorData;
          debugSerial('Peso procesado:', weightValue);
        }
      }
      // Procesar confirmaciones de comandos
      else if (data.startsWith('OK:')) {
        sensorData = { type: 'confirmation', message: data };
        debugSerial('Confirmación recibida:', data);
      }
      
      // Enviar los datos a todos los clientes conectados
      if (sensorData) {
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(sensorData));
          }
        });
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
    }, 5000); // Reintentar en 5 segundos
    
    return null;
  }
}

// Iniciar conexión serial
let serialConnection = openSerialPort();

// Corregir la duplicación del handler de WebSocket
let clientHandlersRegistered = false;

// Manejar conexiones WebSocket
wss.on('connection', (ws) => {
  console.log('Cliente conectado');
  
  // Enviar los últimos valores al nuevo cliente
  if (lastMessages.temperature) {
    ws.send(JSON.stringify(lastMessages.temperature));
  }
  if (lastMessages.weight) {
    ws.send(JSON.stringify(lastMessages.weight));
  }
  
  // Manejar comandos desde el frontend
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Si es un comando para la STM32
      if (data.command && serialConnection && serialConnection.port) {
        sendSerialCommand(serialConnection.port, data.command, (err) => {
          if (err) {
            ws.send(JSON.stringify({
              type: 'error',
              message: `Error al enviar comando: ${err.message}`
            }));
          }
        });
      }
    } catch (e) {
      console.error('Error al procesar mensaje:', e);
    }
  });
  
  // Manejar desconexión
  ws.on('close', () => {
    console.log('Cliente desconectado');
  });
});

// Objeto para almacenar conexiones activas
let connections = new Set();

// Ruta para mostrar información del sistema
app.get('/api/status', (req, res) => {
  let status = {
    server: {
      port: PORT,
      uptime: process.uptime()
    },
    serial: {
      port: SERIAL_PORT,
      baudRate: BAUD_RATE,
      connected: serialConnection && serialConnection.port ? true : false
    },
    clients: wss.clients.size
  };
  
  res.json(status);
});

// Ruta para reiniciar la conexión serial
app.post('/api/restart-serial', (req, res) => {
  if (serialConnection && serialConnection.port) {
    serialConnection.port.close();
  }
  
  setTimeout(() => {
    serialConnection = openSerialPort();
    res.json({ success: true, message: 'Reinicio de conexión serial iniciado' });
  }, 1000);
});

// Manejar errores no capturados
process.on('uncaughtException', (err) => {
  console.error('Error no capturado:', err);
});
