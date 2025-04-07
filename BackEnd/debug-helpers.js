/**
 * Archivo de ayuda para depurar problemas de comunicación serial
 * Este archivo puede ser importado en server.js si se necesita más ayuda para solucionar problemas.
 */

const fs = require('fs');
const path = require('path');

// Configurar un archivo de log para todos los comandos y respuestas
const setupSerialLogger = (serialConnection) => {
  const logPath = path.join(__dirname, 'serial-log.txt');
  
  // Crear archivo de log
  fs.writeFileSync(logPath, `Serial Log iniciado: ${new Date().toISOString()}\n\n`);
  
  // Registrador de comandos enviados
  const logCommand = (cmd) => {
    fs.appendFileSync(logPath, `[ENVIADO ${new Date().toISOString()}] ${cmd}`);
  };
  
  // Registrador de datos recibidos
  const logData = (data) => {
    fs.appendFileSync(logPath, `[RECIBIDO ${new Date().toISOString()}] ${data}\n`);
  };
  
  // Envío de comandos con reintentos
  const sendCommandWithRetry = (cmd, retries = 3, delay = 50) => {
    if (!serialConnection || !serialConnection.port) {
      return Promise.reject(new Error('Puerto serial no disponible'));
    }
    
    return new Promise((resolve, reject) => {
      const attemptSend = (attemptsLeft) => {
        logCommand(`Intento ${retries - attemptsLeft + 1}: ${cmd}`);
        
        serialConnection.port.write(cmd, (err) => {
          if (err) {
            logCommand(`Error: ${err.message}\n`);
            if (attemptsLeft > 1) {
              setTimeout(() => attemptSend(attemptsLeft - 1), delay);
            } else {
              reject(err);
            }
          } else {
            resolve();
          }
        });
      };
      
      attemptSend(retries);
    });
  };
  
  return {
    logCommand,
    logData,
    sendCommandWithRetry
  };
};

module.exports = {
  setupSerialLogger
};
