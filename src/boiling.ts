/**
 * Punto de ebullición de THC y CBD en función de la presión (Clausius-Clapeyron).
 * Referencia a 1 atm: THC 157 °C, CBD 165 °C (literatura).
 */

const R = 8.314; // J/(mol·K)

/** Temperatura de ebullición THC a 1 atm (°C). */
const T0_THC_C = 157;
/** Temperatura de ebullición CBD a 1 atm (°C). */
const T0_CBD_C = 165;
/** Entalpía de vaporización aproximada (J/mol); típica para cannabinoides. */
const DELTA_H_VAP = 55e3;

function T0_K(tC: number): number {
  return tC + 273.15;
}

/**
 * Temperatura de ebullición a presión P (atm).
 * Clausius-Clapeyron: ln(P/P0) = (ΔH/R)(1/T0 - 1/T) → T = 1/(1/T0 - R·ln(P)/ΔH)
 */
function boilingTempKelvin(T0_C: number, P_atm: number): number {
  const T0 = T0_K(T0_C);
  const lnP = Math.log(Math.max(P_atm, 0.01));
  const oneOverT = 1 / T0 - (R * lnP) / DELTA_H_VAP;
  if (oneOverT <= 0) return T0; // evita división por cero a P muy baja
  return 1 / oneOverT;
}

function boilingTempCelsius(T0_C: number, P_atm: number): number {
  return boilingTempKelvin(T0_C, P_atm) - 273.15;
}

export interface BoilingAtPressure {
  T_THC_C: number;
  T_CBD_C: number;
}

export function boilingPointsAtPressure(P_atm: number): BoilingAtPressure {
  return {
    T_THC_C: boilingTempCelsius(T0_THC_C, P_atm),
    T_CBD_C: boilingTempCelsius(T0_CBD_C, P_atm),
  };
}

const P_MIN = 0.1;
const P_MAX = 15;
const N_POINTS = 80;

export interface BoilingCurve {
  P_atm: number[];
  T_THC: number[];
  T_CBD: number[];
}

export function boilingCurves(): BoilingCurve {
  const P_atm: number[] = [];
  const T_THC: number[] = [];
  const T_CBD: number[] = [];
  for (let i = 0; i <= N_POINTS; i++) {
    const P = P_MIN + (i / N_POINTS) * (P_MAX - P_MIN);
    P_atm.push(P);
    T_THC.push(boilingTempCelsius(T0_THC_C, P));
    T_CBD.push(boilingTempCelsius(T0_CBD_C, P));
  }
  return { P_atm, T_THC, T_CBD };
}
