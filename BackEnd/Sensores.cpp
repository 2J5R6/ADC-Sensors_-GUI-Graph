#include <stdio.h>
#include "stm32f7xx.h"
#include <string.h>
#include <stdlib.h>

// Flags y variables de control
uint8_t flag = 0, i, cont = 0;
unsigned char d;
char text[64]; // Buffer para mensajes
char cmd_buffer[32]; // Buffer para comandos recibidos
uint8_t cmd_index = 0;

// Variables ADC1 - Temperatura (PT100)
uint16_t digital1;
float voltaje1;
double gradospt100;

// Variables ADC2 - Peso (Celda de carga)
uint16_t digital2;
float voltaje2;
double pesog;

// Variables para control de tiempos
uint32_t tiempo1 = 1; // Tiempo de muestreo para ADC2 (temperatura)
uint32_t tiempo2 = 1; // Tiempo de muestreo para ADC1 (peso)
char time_unit = 's'; // 'm' para ms, 's' para segundos, 'M' para minutos

// Variables para filtro promedio
#define MAX_SAMPLES 50
float temp_buffer[MAX_SAMPLES];
float peso_buffer[MAX_SAMPLES];
uint8_t temp_index = 0;
uint8_t peso_index = 0;
uint8_t temp_samples = 10; // Número de muestras por defecto para temperatura
uint8_t peso_samples = 10; // Número de muestras por defecto para peso
uint8_t filtro_temp = 0;   // 0: Sin filtro, 1: Con filtro
uint8_t filtro_peso = 0;   // 0: Sin filtro, 1: Con filtro

// Función para calcular promedio
float calcularPromedio(float buffer[], uint8_t num_samples) {
    float sum = 0.0f;
    for (uint8_t i = 0; i < num_samples; i++) {
        sum += buffer[i];
    }
    return sum / num_samples;
}

void SysTick_Wait(uint32_t n) {
    SysTick->LOAD = n - 1;
    SysTick->VAL = 0; 
    while (((SysTick->CTRL & 0x00010000) >> 16) == 0); 
}

void SysTick_ms(uint32_t x) {
    for (uint32_t i = 0; i < x; i++) {
        SysTick_Wait(16000); // Para un reloj de 16 MHz, esto da 1 ms
    }
}

// Función para enviar cadena por UART
void UART_Send_String(const char* str) {
    for (uint32_t i = 0; i < strlen(str); i++) {
        USART3->TDR = str[i];
        while (((USART3->ISR & 0x80) >> 7) == 0) {} // Esperar a que se complete la transmisión
    }
}

// Función para procesar los comandos recibidos por UART
void procesar_comando(const char* cmd) {
    char temp[32];
    strcpy(temp, cmd);
    
    char* tipo = strtok(temp, ":");
    char* valor = strtok(NULL, "\r\n");
    
    if (tipo == NULL || valor == NULL) return;
    
    int val = atoi(valor);
    
    if (strcmp(tipo, "T1") == 0) {
        // Cambiar tiempo de muestreo para temperatura
        if (val > 0) tiempo1 = val;
    } else if (strcmp(tipo, "T2") == 0) {
        // Cambiar tiempo de muestreo para peso
        if (val > 0) tiempo2 = val;
    } else if (strcmp(tipo, "TU") == 0) {
        // Cambiar unidad de tiempo (m, s, M)
        if (valor[0] == 'm' || valor[0] == 's' || valor[0] == 'M') {
            time_unit = valor[0];
        }
    } else if (strcmp(tipo, "FT") == 0) {
        // Filtro temperatura (0=off, 1=on)
        filtro_temp = (val == 0) ? 0 : 1;
    } else if (strcmp(tipo, "FP") == 0) {
        // Filtro peso (0=off, 1=on)
        filtro_peso = (val == 0) ? 0 : 1;
    } else if (strcmp(tipo, "ST") == 0) {
        // Muestras para filtro temperatura
        if (val > 0 && val <= MAX_SAMPLES) temp_samples = val;
    } else if (strcmp(tipo, "SP") == 0) {
        // Muestras para filtro peso
        if (val > 0 && val <= MAX_SAMPLES) peso_samples = val;
    }
    
    // Confirmar recepción de comando
    sprintf(text, "OK:%s:%s\r\n", tipo, valor);
    UART_Send_String(text);
}

extern "C" {
    // Interrupción del botón de usuario
    void EXTI15_10_IRQHandler(void) {
        EXTI->PR |= 1; // Limpiar flag de interrupción
        if (((GPIOC->IDR & (1<<13)) >> 13) == 1) {
            flag = 0;
            // Incremento de tiempos de muestreo (funcionalidad original)
            tiempo1++;
            tiempo2++;
        }
    }

    // Interrupción del Timer 2 - Muestreo de temperatura
    void TIM2_IRQHandler(void) { 
        TIM2->SR &= ~(1<<0); // Limpiar el flag de interrupción del TIM2
        
        // Tomar lectura del ADC2 (temperatura)
        ADC2->CR2 |= (1<<30); // Iniciar conversión A/D
        while (((ADC2->SR & (1<<1)) >> 1) == 0) {} // Esperar a que termine la conversión
        ADC2->SR &= ~(1<<1); // Limpiar el flag EOC
        digital1 = ADC2->DR;
        voltaje1 = (float)digital1 * (3.3f / 4095.0f); // Corrección para resolución completa de 12 bits
        gradospt100 = (30.305f * voltaje1);
        
        // Aplicar filtro promedio si está activado
        if (filtro_temp) {
            temp_buffer[temp_index] = gradospt100;
            temp_index = (temp_index + 1) % temp_samples;
            gradospt100 = calcularPromedio(temp_buffer, temp_samples);
        }
        
        // Enviar datos formateados por UART
        sprintf(text, "TEMP:%.2f\r\n", gradospt100);
        UART_Send_String(text);
        
        // Toggle LED para indicar actividad
        GPIOB->ODR ^= (1<<7);
    }

    // Interrupción del Timer 5 - Muestreo de peso
    void TIM5_IRQHandler(void) { 
        TIM5->SR &= ~(1<<0); // Limpiar el flag de interrupción del TIM5
        
        // Tomar lectura del ADC1 (peso)
        ADC1->CR2 |= (1<<30); // Iniciar conversión A/D
        while (((ADC1->SR & (1<<1)) >> 1) == 0) {} // Esperar a que termine la conversión
        ADC1->SR &= ~(1<<1); // Limpiar el flag EOC
        digital2 = ADC1->DR;
        voltaje2 = (float)digital2 * (3.3f / 4095.0f); // Corrección para resolución completa de 12 bits
        pesog = (voltaje2 * 303.03f);
        
        // Aplicar filtro promedio si está activado
        if (filtro_peso) {
            peso_buffer[peso_index] = pesog;
            peso_index = (peso_index + 1) % peso_samples;
            pesog = calcularPromedio(peso_buffer, peso_samples);
        }
        
        // Enviar datos formateados por UART
        sprintf(text, "PESO:%.2f\r\n", pesog);
        UART_Send_String(text);
    }
    
    // Interrupción del USART3 - Recepción de comandos
    void USART3_IRQHandler(void) { 
        if (((USART3->ISR & 0x20) >> 5) == 1) { // Comprobar RXNE flag
            d = USART3->RDR;
            
            if (d == 'a') {
                flag = 1; // Comando para iniciar
            } else if (d == 'b') {
                flag = 0; // Comando para detener
            } else if (d == '\n' || d == '\r') {
                // Fin de comando, procesarlo
                if (cmd_index > 0) {
                    cmd_buffer[cmd_index] = '\0';
                    procesar_comando(cmd_buffer);
                    cmd_index = 0;
                }
            } else {
                // Agregar carácter al buffer de comandos
                if (cmd_index < sizeof(cmd_buffer) - 1) {
                    cmd_buffer[cmd_index++] = d;
                }
            }
        }
    }
}

int main() {
    // Inicializar buffers para filtros
    for (int i = 0; i < MAX_SAMPLES; i++) {
        temp_buffer[i] = 0.0f;
        peso_buffer[i] = 0.0f;
    }
    
    // ----- Configuración de GPIOs -----
    RCC->AHB1ENR |= ((1<<1) | (1<<2)); // Habilitar reloj para GPIOB y GPIOC
    
    // Configurar GPIOB pins 0 y 7 como salidas (LEDs)
    GPIOB->MODER &= ~((0b11<<0) | (0b11<<14));
    GPIOB->MODER |= ((1<<0) | (1<<14)); 
    GPIOB->OTYPER &= ~((1<<0) | (1<<7)); // Push-pull
    GPIOB->OSPEEDR |= (((1<<1) | (1<<0) | (1<<15) | (1<<14))); // Alta velocidad
    GPIOB->PUPDR &= ~((0b11<<0) | (0b11<<14)); // Sin pull-up/down
    
    // Configurar GPIOC pin 13 como entrada (botón)
    GPIOC->MODER &= ~(0b11<<26);
    GPIOC->OSPEEDR |= ((1<<27) | (1<<26)); // Alta velocidad
    GPIOC->PUPDR &= ~(0b11<<26);
    GPIOC->PUPDR |= (1<<27); // Pull-up
    
    // ----- Configuración de SysTick -----
    SysTick->LOAD = 0x00FFFFFF; 
    SysTick->CTRL |= (0b101); // Habilitar SysTick
    
    // ----- Configuración de interrupciones externas -----
    RCC->APB2ENR |= (1<<14); // Habilitar reloj SYSCFG
    SYSCFG->EXTICR[3] &= ~(0b1111<<4); // Limpiar 
    SYSCFG->EXTICR[3] |= (1<<5); // PC13 para EXTI13
    EXTI->IMR |= (1<<13); // Desenmascarar EXTI13
    EXTI->RTSR |= (1<<13); // Trigger en flanco ascendente
    
    // Habilitar interrupción en NVIC
    NVIC_EnableIRQ(EXTI15_10_IRQn); 
    
    // ----- Configuración de USART3 -----
    RCC->AHB1ENR |= (1<<3); // Habilitar reloj para GPIOD
    
    // Configurar PD8 y PD9 para función alternativa USART3
    GPIOD->MODER &= ~((0b11<<18) | (0b11<<16)); 
    GPIOD->MODER |= ((0b10<<16) | (0b10<<18)); // AF mode
    GPIOD->AFR[1] &= ~((0b1111<<4) | (0b1111<<0));
    GPIOD->AFR[1] |= ((0b0111<<0) | (0b0111<<4)); // AF7 para USART3
    
    RCC->APB1ENR |= (1<<18); // Habilitar reloj USART3
    
    // Configurar USART3
    USART3->BRR = 0x683; // 9600 baud a 16MHz
    USART3->CR1 |= ((1<<5) | (1<<3) | (1<<2) | (1<<0)); // Habilitar RX, TX, RXNEIE y enable
    
    // Habilitar interrupción USART3 en NVIC
    NVIC_EnableIRQ(USART3_IRQn); 
    
    // ----- Configuración de ADC2 para PB1 (temperatura) -----
    GPIOB->MODER |= (0b11<<2); // PB1 como entrada analógica
    
    RCC->APB2ENR |= (1<<9); // Habilitar reloj ADC2
    ADC2->CR2 |= ((1<<10) | (1<<0)); // EOCS y ADC Enable
    ADC2->CR1 &= ~(0b11<<24); // Resolución a 12 bits
    ADC2->SMPR1 |= (0b111<<6); // Tiempo de muestreo máximo
    ADC2->SQR3 = 9; // Canal 9 para PB1
    
    // ----- Configuración de ADC1 para PC4 (peso) -----
    GPIOC->MODER |= (0b11<<8); // PC4 como entrada analógica
    
    RCC->APB2ENR |= (1<<8); // Habilitar reloj ADC1
    ADC1->CR2 |= ((1<<10) | (1<<0)); // EOCS y ADC Enable
    ADC1->CR1 &= ~(0b11<<24); // Resolución a 12 bits
    ADC1->SMPR1 |= (0b111<<12); // Tiempo de muestreo máximo
    ADC1->SQR3 = 14; // Canal 14 para PC4
    
    // ----- Configuración de Timer 2 para muestreo de temperatura -----
    RCC->APB1ENR |= (1<<0); // Habilitar reloj TIM2
    TIM2->PSC = 16000 - 1; // Prescaler para 1ms a 16MHz
    TIM2->ARR = 1000; // Periodo inicial (1s)
    TIM2->DIER |= (1<<0); // Habilitar interrupción de update
    TIM2->CR1 |= (1<<0); // Habilitar contador
    
    // Habilitar interrupción TIM2 en NVIC
    NVIC_EnableIRQ(TIM2_IRQn); 
    
    // ----- Configuración de Timer 5 para muestreo de peso -----
    RCC->APB1ENR |= (1<<3); // Habilitar reloj TIM5
    TIM5->PSC = 16000 - 1; // Prescaler para 1ms a 16MHz
    TIM5->ARR = 1000; // Periodo inicial (1s)
    TIM5->DIER |= (1<<0); // Habilitar interrupción de update
    TIM5->CR1 |= (1<<0); // Habilitar contador
    
    // Habilitar interrupción TIM5 en NVIC
    NVIC_EnableIRQ(TIM5_IRQn); 
    
    // Mensaje de inicio
    UART_Send_String("Sistema iniciado\r\n");
    UART_Send_String("Enviar 'a' para iniciar, 'b' para detener\r\n");
    
    // Bucle principal
    while(1) {
        if (flag == 1) {
            // Modo de adquisición activo
            GPIOB->ODR ^= (1<<0); // Toggle LED para indicar funcionamiento
            SysTick_ms(1000);
        }
        
        // Actualizar periodos de muestreo de timers
        uint32_t factor = 1;
        
        switch (time_unit) {
            case 'm': // milisegundos
                factor = 1;
                break;
            case 's': // segundos
                factor = 1000;
                break;
            case 'M': // minutos
                factor = 60000;
                break;
        }
        
        uint32_t arr_value1 = tiempo1 * factor;
        if (arr_value1 < 1) arr_value1 = 1;
        
        uint32_t arr_value2 = tiempo2 * factor;
        if (arr_value2 < 1) arr_value2 = 1;
        
        // Actualizar periodos de los timers solo si han cambiado
        if (TIM2->ARR != arr_value1) {
            TIM2->ARR = arr_value1;
        }
        
        if (TIM5->ARR != arr_value2) {
            TIM5->ARR = arr_value2;
        }
    }
}