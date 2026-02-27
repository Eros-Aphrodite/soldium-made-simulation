import { useEffect, useMemo, useState } from 'react';

type FailureReason = 'overCurrent' | 'endOfLife' | null;

type HistoryPoint = {
  t: number; // seconds
  naKg: number;
  h2Kg: number;
  currentA: number;
  powerW: number;
  resistanceOhm: number;
  electrodeHealth: number;
};

type SimState = {
  time_s: number;
  currentA: number;
  resistanceOhm: number;
  powerW: number;
  naProducedKg: number;
  naohRemainingKg: number;
  h2Kg: number;
  electrodeHealth: number; // 1 -> fresh, 0 -> dead
  warningActive: boolean;
  warningReason: FailureReason;
  exploded: boolean;
  warningElapsed_s: number;
  history: HistoryPoint[];
};

export type ElectrolysisParams = {
  voltageV: number;
  targetPowerKW?: number;
  mode?: 'voltage' | 'power';
  naohInitialKg: number;
  running: boolean;
  dtSeconds?: number;
};

const FARADAY = 96485; // C/mol
const M_NA_KG_PER_MOL = 0.02299; // kg/mol
const M_H2_KG_PER_MOL = 0.002016; // kg/mol

export function useElectrolysisSimulation({
  voltageV,
  targetPowerKW = 0,
  mode = 'voltage',
  naohInitialKg,
  running,
  dtSeconds = 0.25,
}: ElectrolysisParams): SimState {
  const clampedNaohInitial = useMemo(() => Math.min(Math.max(naohInitialKg, 0), 500), [naohInitialKg]);

  const [state, setState] = useState<SimState>(() => ({
    time_s: 0,
    currentA: 0,
    resistanceOhm: 1e-4,
    powerW: 0,
    naProducedKg: 0,
    naohRemainingKg: clampedNaohInitial,
    h2Kg: 0,
    electrodeHealth: 1,
    warningActive: false,
    warningReason: null,
    exploded: false,
    warningElapsed_s: 0,
    history: [],
  }));

  // Re-initialise NaOH when feed changes substantially
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      naohRemainingKg: clampedNaohInitial,
    }));
  }, [clampedNaohInitial]);

  useEffect(() => {
    if (!running || state.exploded) return;

    const dt = dtSeconds;
    const id = setInterval(() => {
      setState((prev) => {
        if (prev.exploded) return prev;

        const time_s = prev.time_s + dt;

        // Resistance model: base + effects of depletion and electrode wear
        const R0 = 1e-4; // base Ohms
        const depletion = 1 - Math.min(Math.max(prev.naohRemainingKg / 500, 0), 1);
        const wear = 1 - prev.electrodeHealth;
        const resistanceOhm = R0 * (1 + 2.0 * depletion + 3.0 * wear);

        let voltage = Math.max(voltageV, 0);
        if (mode === 'power' && targetPowerKW > 0 && resistanceOhm > 0) {
          const targetW = targetPowerKW * 1000;
          voltage = Math.sqrt(targetW * resistanceOhm);
        }
        const currentA = voltage > 0 && resistanceOhm > 0 ? voltage / resistanceOhm : 0;
        const powerW = voltage * currentA;

        // Coulomb count for electrode life
        const Q_design = 50_000 * 3600 * 10; // 10 h at 50 kA nominal
        const dQ = Math.abs(currentA) * dt;
        const newHealth = Math.max(0, prev.electrodeHealth - dQ / Q_design);

        const overCurrent = Math.abs(currentA) > 50_000;
        const endOfLife = newHealth <= 0.05;

        // Derive next warning / explosion state in a more type-explicit way
        const baseWarningReason: FailureReason = prev.warningReason;
        const shouldTriggerWarning = !prev.exploded && (overCurrent || endOfLife);

        const warningActive: boolean = prev.warningActive || shouldTriggerWarning;
        const warningReason: FailureReason =
          shouldTriggerWarning && !baseWarningReason
            ? overCurrent
              ? 'overCurrent'
              : 'endOfLife'
            : baseWarningReason;

        let warningElapsed_s = warningActive ? prev.warningElapsed_s + dt : 0;
        let exploded = prev.exploded || (warningActive && warningElapsed_s >= 10);

        // Effective current for production (reduced when warning or damaged)
        let effectiveCurrent = currentA * newHealth;
        if (warningActive) {
          effectiveCurrent *= 0.2;
        }

        // Faraday-based production
        let naProducedKg = prev.naProducedKg;
        let naohRemainingKg = prev.naohRemainingKg;
        let h2Kg = prev.h2Kg;

        if (!exploded && naohRemainingKg > 0 && Math.abs(effectiveCurrent) > 1e-3) {
          const efficiency = 0.85;
          const nNa_mol = (efficiency * Math.abs(effectiveCurrent) * dt) / FARADAY;
          const dNa_kg = nNa_mol * M_NA_KG_PER_MOL;

          // consume NaOH roughly stoichiometrically
          const k_naoh = 3; // kg NaOH per kg Na (heuristic)
          const dNaoh_kg = k_naoh * dNa_kg;

          naProducedKg += dNa_kg;
          naohRemainingKg = Math.max(0, naohRemainingKg - dNaoh_kg);

          // H2 co-production (very approximate, for visualisation)
          const nH2_mol = nNa_mol * 0.5;
          const dH2_kg = nH2_mol * M_H2_KG_PER_MOL;
          h2Kg += dH2_kg;
        }

        // History for graph (keep last 400 samples)
        const history: HistoryPoint[] = [
          ...prev.history,
          {
            t: time_s,
            naKg: naProducedKg,
            h2Kg,
            currentA,
            powerW,
            resistanceOhm,
            electrodeHealth: newHealth,
          },
        ].slice(-400);

        return {
          time_s,
          currentA,
          resistanceOhm,
          powerW,
          naProducedKg,
          naohRemainingKg,
          h2Kg,
          electrodeHealth: newHealth,
          warningActive,
          warningReason,
          exploded,
          warningElapsed_s,
          history,
        };
      });
    }, dt * 1000);

    return () => clearInterval(id);
  }, [running, dtSeconds, voltageV, targetPowerKW, mode, state.exploded]);

  return state;
}

