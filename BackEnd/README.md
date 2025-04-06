# Sistema de Adquisición de Datos STM32F7 - Documentación Técnica

## Descripción General

Este sistema implementa una solución de adquisición dual que captura señales analógicas de:
- Temperatura mediante sensor PT100 (ADC2 - PB1)
- Peso a través de celda de carga (ADC1 - PC4)

El sistema permite configurar en tiempo real los parámetros de muestreo y filtrado mediante comandos UART.

## Configuración de Registros

### 1. Configuración del Reloj (RCC)

```c
// Habilitación de relojes para periféricos
RCC->AHB1ENR |= ((1<<1) | (1<<2) | (1<<3));  // GPIOB, GPIOC, GPIOD
RCC->APB2ENR |= ((1<<14) | (1<<8) | (1<<9)); // SYSCFG, ADC1, ADC2
RCC->APB1ENR |= ((1<<18) | (1<<0) | (1<<3)); // USART3, TIM2, TIM5
```

| Bit en RCC->AHB1ENR | Periférico | Función |
|---------------------|------------|---------|
| 1 | GPIOB | Habilita reloj para LEDs y sensor de temperatura |
| 2 | GPIOC | Habilita reloj para botón de usuario y celda de carga |
| 3 | GPIOD | Habilita reloj para pines USART3 |

| Bit en RCC->APB2ENR | Periférico | Función |
|---------------------|------------|---------|
| 14 | SYSCFG | Permite configuración de interrupciones externas |
| 8 | ADC1 | Habilita reloj para ADC de celda de carga |
| 9 | ADC2 | Habilita reloj para ADC de temperatura |

| Bit en RCC->APB1ENR | Periférico | Función |
|---------------------|------------|---------|
| 18 | USART3 | Habilita reloj para comunicación serial |
| 0 | TIM2 | Habilita reloj para timer de muestreo de temperatura |
| 3 | TIM5 | Habilita reloj para timer de muestreo de peso |

### 2. Configuración de GPIO

#### GPIOB (LEDs y Temperatura)

```c
// PB0, PB7: Salidas digitales (LEDs)
GPIOB->MODER &= ~((0b11<<0) | (0b11<<14));
GPIOB->MODER |= ((1<<0) | (1<<14)); 
GPIOB->OTYPER &= ~((1<<0) | (1<<7)); // Push-pull
GPIOB->OSPEEDR |= (((1<<1) | (1<<0) | (1<<15) | (1<<14))); // Alta velocidad
GPIOB->PUPDR &= ~((0b11<<0) | (0b11<<14)); // Sin pull-up/down

// PB1: Entrada analógica (Sensor temperatura)
GPIOB->MODER |= (0b11<<2);
```

| Registro | Configuración | Descripción |
|----------|---------------|-------------|
| MODER | 01 para PB0, PB7 | Configura como salidas digitales |
| MODER | 11 para PB1 | Configura como entrada analógica |
| OTYPER | 0 para PB0, PB7 | Configura como salida push-pull |
| OSPEEDR | 11 para PB0, PB7 | Configura alta velocidad (hasta 100 MHz) |
| PUPDR | 00 para PB0, PB7 | Sin resistencias pull-up/pull-down |

#### GPIOC (Botón y Celda de Carga)

```c
// PC13: Entrada digital (Botón usuario)
GPIOC->MODER &= ~(0b11<<26);
GPIOC->OSPEEDR |= ((1<<27) | (1<<26)); // Alta velocidad
GPIOC->PUPDR &= ~(0b11<<26);
GPIOC->PUPDR |= (1<<27); // Pull-up

// PC4: Entrada analógica (Celda de carga)
GPIOC->MODER |= (0b11<<8);
```

| Registro | Configuración | Descripción |
|----------|---------------|-------------|
| MODER | 00 para PC13 | Configura como entrada digital |
| MODER | 11 para PC4 | Configura como entrada analógica |
| OSPEEDR | 11 para PC13 | Configura alta velocidad (hasta 100 MHz) |
| PUPDR | 01 para PC13 | Activa resistencia pull-up interna |

#### GPIOD (UART)

```c
// PD8 (TX), PD9 (RX): Función alternativa USART3
GPIOD->MODER &= ~((0b11<<18) | (0b11<<16)); 
GPIOD->MODER |= ((0b10<<16) | (0b10<<18)); // AF mode
GPIOD->AFR[1] &= ~((0b1111<<4) | (0b1111<<0));
GPIOD->AFR[1] |= ((0b0111<<0) | (0b0111<<4)); // AF7 para USART3
```

| Registro | Configuración | Descripción |
|----------|---------------|-------------|
| MODER | 10 para PD8, PD9 | Configura como función alternativa |
| AFR[1] | 0111 (AF7) para PD8, PD9 | Selecciona USART3 como función alternativa |

### 3. Configuración de SysTick

```c
SysTick->LOAD = 0x00FFFFFF; 
SysTick->CTRL |= (0b101);
```

| Bit en CTRL | Función |
|-------------|---------|
| 0 | Habilita contador |
| 2 | Selecciona reloj del sistema (16MHz) |

### 4. Configuración de Interrupciones Externas (EXTI)

```c
SYSCFG->EXTICR[3] &= ~(0b1111<<4);
SYSCFG->EXTICR[3] |= (1<<5); // PC13 para EXTI13
EXTI->IMR |= (1<<13); // Desenmascarar EXTI13
EXTI->RTSR |= (1<<13); // Trigger en flanco ascendente
```

| Registro | Configuración | Descripción |
|----------|---------------|-------------|
| EXTICR[3] | 0001 para EXTI13 | Selecciona PC13 como fuente de interrupción |
| IMR | 1 para línea 13 | Habilita la interrupción para EXTI13 |
| RTSR | 1 para línea 13 | Configura detección por flanco ascendente |

### 5. Configuración USART3

```c
USART3->BRR = 0x683; // 9600 baud a 16MHz
USART3->CR1 |= ((1<<5) | (1<<3) | (1<<2) | (1<<0));
```

| Registro | Valor/Bit | Descripción |
|----------|-----------|-------------|
| BRR | 0x683 | Configura baudrate a 9600 (16MHz/9600) |
| CR1 bit 0 | 1 | Habilita USART |
| CR1 bit 2 | 1 | Habilita receptor (RX) |
| CR1 bit 3 | 1 | Habilita transmisor (TX) |
| CR1 bit 5 | 1 | Habilita interrupción por recepción |

### 6. Configuración ADC

#### ADC2 (Sensor de Temperatura - PB1)

```c
ADC2->CR2 |= ((1<<10) | (1<<0)); // EOCS y ADC Enable
ADC2->CR1 &= ~(0b11<<24); // Resolución a 12 bits
ADC2->SMPR1 |= (0b111<<6); // Tiempo de muestreo máximo
ADC2->SQR3 = 9; // Canal 9 para PB1
```

| Registro | Valor/Bit | Descripción |
|----------|-----------|-------------|
| CR2 bit 0 | 1 | Habilita ADC |
| CR2 bit 10 | 1 | EOCS: End of conversion selection |
| CR1 bits 24-25 | 00 | Resolución de 12 bits (0-4095) |
| SMPR1 bits 8-6 | 111 | Tiempo de muestreo de 480 ciclos |
| SQR3 | 9 | Selecciona el canal 9 (conectado a PB1) |

#### ADC1 (Celda de Carga - PC4)

```c
ADC1->CR2 |= ((1<<10) | (1<<0)); // EOCS y ADC Enable
ADC1->CR1 &= ~(0b11<<24); // Resolución a 12 bits
ADC1->SMPR1 |= (0b111<<12); // Tiempo de muestreo máximo
ADC1->SQR3 = 14; // Canal 14 para PC4
```

| Registro | Valor/Bit | Descripción |
|----------|-----------|-------------|
| CR2 bit 0 | 1 | Habilita ADC |
| CR2 bit 10 | 1 | EOCS: End of conversion selection |
| CR1 bits 24-25 | 00 | Resolución de 12 bits (0-4095) |
| SMPR1 bits 14-12 | 111 | Tiempo de muestreo de 480 ciclos |
| SQR3 | 14 | Selecciona el canal 14 (conectado a PC4) |

### 7. Configuración Timers

#### TIM2 (Muestreo de Temperatura)

```c
TIM2->PSC = 16000 - 1; // Prescaler para 1ms a 16MHz
TIM2->ARR = 1000; // Periodo inicial (1s)
TIM2->DIER |= (1<<0); // Habilitar interrupción de update
TIM2->CR1 |= (1<<0); // Habilitar contador
```

| Registro | Valor/Bit | Descripción |
|----------|-----------|-------------|
| PSC | 15999 | Preescalador (16MHz/16000 = 1kHz) |
| ARR | 1000 | Valor de recarga automática (periodo = 1s) |
| DIER bit 0 | 1 | Habilita interrupción por actualización |
| CR1 bit 0 | 1 | Habilita contador |

#### TIM5 (Muestreo de Peso)

```c
TIM5->PSC = 16000 - 1; // Prescaler para 1ms a 16MHz
TIM5->ARR = 1000; // Periodo inicial (1s)
TIM5->DIER |= (1<<0); // Habilitar interrupción de update
TIM5->CR1 |= (1<<0); // Habilitar contador
```

| Registro | Valor/Bit | Descripción |
|----------|-----------|-------------|
| PSC | 15999 | Preescalador (16MHz/16000 = 1kHz) |
| ARR | 1000 | Valor de recarga automática (periodo = 1s) |
| DIER bit 0 | 1 | Habilita interrupción por actualización |
| CR1 bit 0 | 1 | Habilita contador |

### 8. Habilitación de Interrupciones NVIC

```c
NVIC_EnableIRQ(EXTI15_10_IRQn); 
NVIC_EnableIRQ(USART3_IRQn);
NVIC_EnableIRQ(TIM2_IRQn);
NVIC_EnableIRQ(TIM5_IRQn);
```

## Secuencia de Inicialización

La secuencia correcta para la inicialización del sistema es la siguiente:

1. **Inicialización de variables y buffers**
   - Limpiar buffers para filtros promedio

2. **Configuración de Relojes**
   - Habilitar relojes para GPIOB, GPIOC, GPIOD
   - Habilitar relojes para periféricos (SYSCFG, ADC1, ADC2, USART3, TIM2, TIM5)

3. **Configuración de GPIO**
   - Configurar PB0, PB7 como salidas digitales (LEDs)
   - Configurar PB1 como entrada analógica (temperatura)
   - Configurar PC13 como entrada digital con pull-up (botón)
   - Configurar PC4 como entrada analógica (peso)
   - Configurar PD8, PD9 como función alternativa para USART3

4. **Configuración del SysTick**
   - Configurar para base de tiempo precisa

5. **Configuración de Interrupciones Externas**
   - Configurar EXTI13 para PC13 (botón)

6. **Configuración de USART3**
   - Configurar para 9600 baudios
   - Habilitar TX, RX e interrupciones por recepción

7. **Configuración de ADCs**
   - Configurar ADC1 para celda de carga (PC4)
   - Configurar ADC2 para sensor de temperatura (PB1)

8. **Configuración de Timers**
   - Configurar TIM2 para muestreo de temperatura
   - Configurar TIM5 para muestreo de peso

9. **Habilitación de Interrupciones en NVIC**
   - Habilitar interrupciones para EXTI, USART3, TIM2 y TIM5

## Mapa de Conexiones

| Periférico | Pin | Función | Modo |
|------------|-----|---------|------|
| LED Sistema | PB0 | Indicador actividad | Salida digital |
| LED Temperatura | PB7 | Indicador muestreo temperatura | Salida digital |
| Sensor PT100 | PB1 | Entrada para temperatura | Entrada analógica |
| Botón Usuario | PC13 | Control manual | Entrada digital (pull-up) |
| Celda de Carga | PC4 | Entrada para peso | Entrada analógica |
| USART3 TX | PD8 | Transmisión datos | Función alternativa (AF7) |
| USART3 RX | PD9 | Recepción comandos | Función alternativa (AF7) |

## Protocolo de Comunicación

### Formato de Trama

UART 9600 baudios, 8 bits de datos, sin paridad, 1 bit de parada.

### Comandos de Control

| Comando | Descripción | Formato | Ejemplo |
|---------|-------------|---------|---------|
| a | Iniciar adquisición | a | a |
| b | Detener adquisición | b | b |
| T1 | Tiempo de muestreo temperatura | T1:valor | T1:5 |
| T2 | Tiempo de muestreo peso | T2:valor | T2:2 |
| TU | Unidad de tiempo | TU:x | TU:s |
| FT | Filtro temperatura | FT:0/1 | FT:1 |
| FP | Filtro peso | FP:0/1 | FP:1 |
| ST | Muestras filtro temperatura | ST:valor | ST:10 |
| SP | Muestras filtro peso | SP:valor | SP:8 |

### Formato de Datos de Salida

```
TEMP:xx.xx\r\n
PESO:xx.xx\r\n
```

## Procesamiento de Datos

### Conversión ADC a Valores Físicos

- **Temperatura**: ADC → Voltaje → Temperatura
  ```
  voltaje1 = (float)digital1 * (3.3f / 4095.0f)
  gradospt100 = (30.305f * voltaje1)
  ```

- **Peso**: ADC → Voltaje → Peso
  ```
  voltaje2 = (float)digital2 * (3.3f / 4095.0f)
  pesog = (voltaje2 * 303.03f)
  ```

### Filtrado de Señales

El sistema implementa filtros de promedio móvil para reducir ruido:
- Configurables entre 1-50 muestras
- Implementados mediante buffers circulares
- Activación independiente para cada sensor

## Manejadores de Interrupción

### EXTI15_10_IRQHandler (Botón Usuario)

Detecta la pulsación del botón y controla el flag de adquisición.

### TIM2_IRQHandler (Muestreo Temperatura)

1. Inicia conversión ADC2
2. Lee valor digital y convierte a temperatura
3. Aplica filtro si está activado
4. Envía datos formateados por UART
5. Alterna LED de temperatura

### TIM5_IRQHandler (Muestreo Peso)

1. Inicia conversión ADC1
2. Lee valor digital y convierte a peso
3. Aplica filtro si está activado
4. Envía datos formateados por UART

### USART3_IRQHandler (Recepción Comandos)

1. Lee carácter recibido
2. Identifica comandos simples ('a', 'b')
3. Acumula caracteres para comandos compuestos
4. Procesa comandos completos al recibir '\r' o '\n'

## Notas Técnicas

1. Los ADCs están configurados para 12 bits de resolución (0-4095)
2. Las frecuencias de muestreo son configurables en tiempo real
3. El sistema utiliza 16 MHz como frecuencia de reloj base
4. Los filtros de promedio móvil pueden configurarse entre 1-50 muestras

## Referencias

- [STM32F7 Reference Manual](https://www.st.com/resource/en/reference_manual/dm00124865-stm32f75xxx-and-stm32f74xxx-advanced-arm-based-32-bit-mcus-stmicroelectronics.pdf)
- [STM32F7 Datasheet](https://www.st.com/resource/en/datasheet/stm32f767zi.pdf)