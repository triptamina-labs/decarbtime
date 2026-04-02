# DecarbTime

Aplicación web para simular la **descarboxilación** de cannabinoides (THCA→THC, CBDA→CBD) y consultar los **puntos de ebullición** de THC y CBD en función de la presión. Desarrollada por Tripta Labs Co.

---

## Cómo ejecutar la app

- **Dependencias:** `pnpm install`
- **Desarrollo:** `pnpm dev`
- **Build:** `pnpm build`
- **Vista previa del build:** `pnpm preview`

---

## Estructura de la aplicación

La app tiene **dos pestañas**:

1. **Descarboxilación** — Simula la evolución de ácidos (THCA, CBDA), activos (THC, CBD) y degradados (CBN, CBD degradado) en el tiempo, con parámetros de temperatura, presión, % de oxígeno y ratio THC/CBD.
2. **Puntos de ebullición** — Muestra la temperatura de ebullición de THC y CBD en función de la presión (0,1–15 atm), con un slider de presión y leyenda con los valores en la presión seleccionada.

---

# Modelo matemático

## 1. Pestaña Descarboxilación

### 1.1 Reacciones consideradas

Se modelan dos cadenas de reacciones en paralelo (concentraciones en % respecto al total inicial):

**Cadena THC**

- **THCA** (ácido) → **THC** (activo) → **CBN** (degradado)

**Cadena CBD**

- **CBDA** (ácido) → **CBD** (activo) → **CBD degradado**

Todas las reacciones se suponen de **primer orden** con constantes cinéticas que dependen de la temperatura (Arrhenius) y de la presión (efecto vacío y efecto oxidación).

### 1.2 Cinética de Arrhenius

Cada reacción tiene una constante cinética base (en 1/min) dada por:

$$k_\text{base} = A \, \exp\left(-\frac{E_a}{R\,T}\right) \times 60$$

con:

- \(T\) = temperatura en kelvin (\(T = T_{\text{°C}} + 273{,}15\))
- \(R = 8{,}314\) J/(mol·K)
- \(A\) = factor preexponencial (1/s en la forma estándar; el \(\times 60\) convierte a 1/min)

**Parámetros usados en el código:**

| Reacción     | \(E_a\) (J/mol) | \(A\) (1/s) |
|-------------|------------------|-------------|
| THCA → THC  | 85 000           | \(3{,}7\times 10^8\) |
| THC → CBN   | 105 000          | \(1{,}5\times 10^9\) |
| CBDA → CBD  | 95 000           | \(3{,}5\times 10^9\) |
| CBD → degradado | 115 000     | \(5{,}0\times 10^9\) |

### 1.3 Efecto de la presión

La presión se introduce en atm y se convierte a mbar: \(P_\text{mbar} = P_\text{atm} \times 1013{,}25\).

**Efecto vacío (descarboxilación)**

- La salida de CO₂ en THCA→THC y CBDA→CBD se acelera en vacío.
- Factor aplicado a \(k_{\text{THCA}\to\text{THC}}\) y \(k_{\text{CBDA}\to\text{CBD}}\):

$$\text{factor\_vacio} = \max\left(1,\; 1 + 0{,}2 \times \frac{1000 - P_\text{mbar}}{1000}\right)$$

- Para \(P_\text{mbar} < 1000\) (vacío): factor > 1 (hasta 1,2 a vacío total).
- Para \(P_\text{mbar} \ge 1000\): factor = 1 (no aceleración; evita constantes negativas).

**Efecto oxidación (degradación)**

- La degradación THC→CBN y CBD→degradado depende del oxígeno disponible.
- Presión parcial de O₂ (Ley de Dalton): \(P_{\text{O}_2} = \frac{\%\,\text{O}_2}{100} \times P_\text{mbar}\).
- Referencia a nivel del mar: 21 % de 1000 mbar → 210 mbar.
- Factor aplicado a \(k_{\text{THC}\to\text{CBN}}\) y \(k_{\text{CBD}\to\text{deg}}\):

$$\text{factor\_oxidacion} = \max\left(0{,}02,\; \frac{P_{\text{O}_2}}{210}\right)$$

- El mínimo 0,02 representa degradación puramente térmica (sin O₂).

Constantes efectivas:

- \(k_{\text{THCA}\to\text{THC}} = k_{\text{base,1}} \times \text{factor\_vacio}\)
- \(k_{\text{CBDA}\to\text{CBD}} = k_{\text{base,3}} \times \text{factor\_vacio}\)
- \(k_{\text{THC}\to\text{CBN}} = k_{\text{base,2}} \times \text{factor\_oxidacion}\)
- \(k_{\text{CBD}\to\text{deg}} = k_{\text{base,4}} \times \text{factor\_oxidacion}\)

### 1.4 Sistema de EDOs

Vector de estado (concentraciones en %):

$$\mathbf{c} = [\text{THCA},\; \text{THC},\; \text{CBN},\; \text{CBDA},\; \text{CBD},\; \text{CBD\_DEG}]$$

Ecuaciones:

$$\begin{aligned}
\frac{d\,\text{THCA}}{dt}  &= -k_1\,\text{THCA} \\
\frac{d\,\text{THC}}{dt}   &= k_1\,\text{THCA} - k_2\,\text{THC} \\
\frac{d\,\text{CBN}}{dt}  &= k_2\,\text{THC} \\
\frac{d\,\text{CBDA}}{dt} &= -k_3\,\text{CBDA} \\
\frac{d\,\text{CBD}}{dt}  &= k_3\,\text{CBDA} - k_4\,\text{CBD} \\
\frac{d\,\text{CBD\_DEG}}{dt} &= k_4\,\text{CBD}
\end{aligned}$$

con \(k_1,k_2\) (THC) y \(k_3,k_4\) (CBD) las constantes efectivas ya definidas.

### 1.5 Condiciones iniciales

- Ratio THC/CBD: el usuario fija % THC (0–100); % CBD = 100 − % THC.
- A \(t=0\):
  - THCA = 100 × (ratio THC), THC = 0, CBN = 0
  - CBDA = 100 × (ratio CBD), CBD = 0, CBD_DEG = 0

Así, la suma de las seis concentraciones es 100 % en todo momento.

### 1.6 Integración numérica

- **Método:** Runge-Kutta de cuarto orden (RK4).
- **Dominio temporal:** \(t \in [0,\,150]\) min.
- **Número de puntos:** 500 → paso fijo \(\Delta t = 150/499 \approx 0{,}30\) min.

En cada paso se actualizan las seis concentraciones y se registran para la gráfica. Además se calculan el **pico de THC** y el **pico de CBD** (tiempo y valor donde la concentración de THC o CBD es máxima).

### 1.7 Salidas de la pestaña Descarboxilación

- Curvas de THCA, THC, CBN, CBDA, CBD y CBD_DEG frente al tiempo (min).
- Leyenda con convención: ácido (línea discontinua), activo (línea continua gruesa), degradado (punteada).
- Bloque **Pico (máx. activo)** con punto + texto: tiempo (min) y concentración (%) en el máximo de THC y en el máximo de CBD (si aplica según el ratio).

---

## 2. Pestaña Puntos de ebullición

### 2.1 Modelo

Se usa la ecuación de **Clausius-Clapeyron** integrada para relacionar presión de vapor y temperatura de ebullición:

$$\ln\frac{P}{P_0} = \frac{\Delta H_\text{vap}}{R}\left(\frac{1}{T_0} - \frac{1}{T}\right)$$

Despejando la temperatura de ebullición \(T\) a presión \(P\) (con \(P_0 = 1\) atm):

$$\frac{1}{T} = \frac{1}{T_0} - \frac{R\,\ln P}{\Delta H_\text{vap}}
\quad\Rightarrow\quad
T = \frac{1}{\frac{1}{T_0} - \frac{R\,\ln P}{\Delta H_\text{vap}}}$$

- \(T_0\): temperatura de ebullición a 1 atm (K).
- \(\Delta H_\text{vap}\): entalpía de vaporización (J/mol).
- \(R = 8{,}314\) J/(mol·K).
- \(P\) en atm.

### 2.2 Parámetros

- **THC:** \(T_0 = 157\,°\text{C}\) (430,15 K) a 1 atm.
- **CBD:** \(T_0 = 165\,°\text{C}\) (438,15 K) a 1 atm.
- **Entalpía de vaporización:** \(\Delta H_\text{vap} = 55\,000\) J/mol para ambos (valor representativo para cannabinoides).

Para \(P\) muy baja se limita el argumento para evitar singularidades numéricas.

### 2.3 Salidas de la pestaña Puntos de ebullición

- Gráfica: eje X = presión (atm), eje Y = temperatura de ebullición (°C); dos curvas (THC y CBD).
- Slider de presión (0,1–15 atm) y leyenda con el punto de ebullición de THC y de CBD a la presión seleccionada.
- Línea vertical en la presión actual para leer fácilmente en el gráfico.

---

## Limitaciones y uso

- Los parámetros cinéticos (\(E_a\), \(A\)) y de ebullición (\(\Delta H_\text{vap}\), \(T_0\)) son **representativos**; no sustituyen datos experimentales del material concreto.
- La app es **orientativa**: ilustra tendencias (efecto de temperatura, vacío, oxígeno y presión sobre descarboxilación y ebullición), no predicciones exactas para un producto o proceso determinado.
- En descarboxilación se asume reactor bien mezclado (concentraciones uniformes), primer orden y efectos de presión modelados de forma simplificada (vacío y oxidación como se describen arriba).

---

## Stack técnico

- **Front:** TypeScript, Vite, Chart.js.
- **Gestor de paquetes:** pnpm.