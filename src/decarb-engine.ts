/**
 * Motor de descarboxilación: cinética THCA→THC→CBN y CBDA→CBD→degradado.
 * - Vacío: acelera la salida de CO₂ (hasta 20% más rápido).
 * - Oxidación: basada en presión parcial de O₂ (Ley de Dalton); mínimo 2% (degradación térmica sin O₂).
 */

const R = 8.314;

// Cinética base THC
const Ea_THCA_THC = 85000.0;
const A_THCA_THC = 3.7e8;
const Ea_THC_CBN = 105000.0;
const A_THC_CBN = 1.5e9;

// Cinética base CBD
const Ea_CBDA_CBD = 95000.0;
const A_CBDA_CBD = 3.5e9;
const Ea_CBD_DEG = 115000.0;
const A_CBD_DEG = 5.0e9;

function calcular_k_base(A: number, Ea: number, T_celsius: number): number {
  const T_kelvin = T_celsius + 273.15;
  return A * Math.exp(-Ea / (R * T_kelvin)) * 60.0; // 1/min
}

// [THCA, THC, CBN, CBDA, CBD, CBD_DEG]
function sistema_reacciones(
  c: number[],
  _t: number,
  k_thc1: number,
  k_thc2: number,
  k_cbd1: number,
  k_cbd2: number
): number[] {
  const [THCA, THC, , CBDA, CBD] = c;
  const dTHCA_dt = -k_thc1 * THCA;
  const dTHC_dt = k_thc1 * THCA - k_thc2 * THC;
  const dCBN_dt = k_thc2 * THC;
  const dCBDA_dt = -k_cbd1 * CBDA;
  const dCBD_dt = k_cbd1 * CBDA - k_cbd2 * CBD;
  const dCBD_DEG_dt = k_cbd2 * CBD;
  return [dTHCA_dt, dTHC_dt, dCBN_dt, dCBDA_dt, dCBD_dt, dCBD_DEG_dt];
}

function rk4Step(
  c: number[],
  t: number,
  dt: number,
  k_thc1: number,
  k_thc2: number,
  k_cbd1: number,
  k_cbd2: number
): number[] {
  const f = (y: number[], ti: number) =>
    sistema_reacciones(y, ti, k_thc1, k_thc2, k_cbd1, k_cbd2);

  const k1 = f(c, t);
  const c2 = c.map((ci, i) => ci + (dt / 2) * k1[i]);
  const k2 = f(c2, t + dt / 2);
  const c3 = c.map((ci, i) => ci + (dt / 2) * k2[i]);
  const k3 = f(c3, t + dt / 2);
  const c4 = c.map((ci, i) => ci + dt * k3[i]);
  const k4 = f(c4, t + dt);

  return c.map((ci, i) => ci + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

export interface DecarbInput {
  T_celsius: number;
  P_atm: number;
  O2_percent: number;
  ratio_THC_percent: number;
}

const MBAR_PER_ATM = 1013.25;
/** Presión parcial O₂ de referencia: 21% de 1000 mbar (nivel del mar). */
const P_O2_REF_MBAR = 210.0;

export interface DecarbResult {
  t_min: number[];
  THCA: number[];
  THC: number[];
  CBN: number[];
  CBDA: number[];
  CBD: number[];
  CBD_DEG: number[];
  maxTHC: { t_min: number; value: number } | null;
  maxCBD: { t_min: number; value: number } | null;
}

const TIEMPO_MAX = 150.0;
const N_POINTS = 500;
const DT = TIEMPO_MAX / (N_POINTS - 1);

export function runDecarb(input: DecarbInput): DecarbResult {
  const { T_celsius, P_atm, O2_percent, ratio_THC_percent } = input;
  const P_mbar = P_atm * MBAR_PER_ATM;

  const k_thc1_base = calcular_k_base(A_THCA_THC, Ea_THCA_THC, T_celsius);
  const k_thc2_base = calcular_k_base(A_THC_CBN, Ea_THC_CBN, T_celsius);
  const k_cbd1_base = calcular_k_base(A_CBDA_CBD, Ea_CBDA_CBD, T_celsius);
  const k_cbd2_base = calcular_k_base(A_CBD_DEG, Ea_CBD_DEG, T_celsius);

  // Efecto vacío: acelera descarboxilación (salida de CO₂) solo cuando P < 1 atm.
  // Por encima de 1 atm el factor no puede ser < 1 (evita k negativos y curvas que “suben”).
  const factor_vacio = Math.max(1.0, 1.0 + 0.2 * ((1000.0 - P_mbar) / 1000.0));
  const k_thc1 = k_thc1_base * factor_vacio;
  const k_cbd1 = k_cbd1_base * factor_vacio;

  // Efecto oxidación: presión parcial de O₂ (Ley de Dalton); mínimo 2% = degradación térmica sin O₂
  const P_parcial_O2 = (O2_percent / 100.0) * P_mbar;
  const factor_oxidacion = Math.max(P_parcial_O2 / P_O2_REF_MBAR, 0.02);
  const k_thc2 = k_thc2_base * factor_oxidacion;
  const k_cbd2 = k_cbd2_base * factor_oxidacion;

  const ratio_THC = ratio_THC_percent / 100.0;
  const ratio_CBD = 1.0 - ratio_THC;
  let c = [
    100.0 * ratio_THC,
    0.0,
    0.0,
    100.0 * ratio_CBD,
    0.0,
    0.0,
  ];

  const t_min: number[] = [0];
  const THCA: number[] = [c[0]];
  const THC: number[] = [c[1]];
  const CBN: number[] = [c[2]];
  const CBDA: number[] = [c[3]];
  const CBD: number[] = [c[4]];
  const CBD_DEG: number[] = [c[5]];

  let maxTHCValue = c[1];
  let maxTHCT = 0;
  let maxCBDValue = c[4];
  let maxCBDT = 0;

  for (let i = 1; i < N_POINTS; i++) {
    const t = (i - 1) * DT;
    c = rk4Step(c, t, DT, k_thc1, k_thc2, k_cbd1, k_cbd2);
    const ti = i * DT;
    t_min.push(ti);
    THCA.push(c[0]);
    THC.push(c[1]);
    CBN.push(c[2]);
    CBDA.push(c[3]);
    CBD.push(c[4]);
    CBD_DEG.push(c[5]);

    if (c[1] > maxTHCValue) {
      maxTHCValue = c[1];
      maxTHCT = ti;
    }
    if (c[4] > maxCBDValue) {
      maxCBDValue = c[4];
      maxCBDT = ti;
    }
  }

  return {
    t_min,
    THCA,
    THC,
    CBN,
    CBDA,
    CBD,
    CBD_DEG,
    maxTHC: ratio_THC > 0.01 ? { t_min: maxTHCT, value: maxTHCValue } : null,
    maxCBD: ratio_CBD > 0.01 ? { t_min: maxCBDT, value: maxCBDValue } : null,
  };
}
