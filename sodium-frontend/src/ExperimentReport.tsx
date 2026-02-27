import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Line,
} from '@react-pdf/renderer';
import type { HistoryPoint } from './useElectrolysisSimulation';

type ExperimentMetaForReport = {
  startedAt: string;
  endedAt?: string;
  initialNaohKg: number;
  initialVoltageV: number;
  initialPowerKW: number;
  initialCurrentA: number;
  failed: boolean;
  failureReason?: string;
  expectedHours?: number;
};

type Props = {
  experiment: ExperimentMetaForReport;
  series: HistoryPoint[];
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingHorizontal: 32,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  title: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: 700,
  },
  sectionTitle: {
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
    fontWeight: 700,
  },
  paragraph: {
    marginBottom: 4,
    lineHeight: 1.4,
  },
  listItem: {
    marginLeft: 8,
    marginBottom: 2,
  },
  table: {
    marginTop: 6,
    borderWidth: 0.5,
    borderColor: '#cbd5e1',
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableHeaderCell: {
    flex: 1,
    backgroundColor: '#020617',
    color: '#e5e7eb',
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 9,
    fontWeight: 700,
  },
  tableCell: {
    flex: 1,
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 9,
    borderTopWidth: 0.5,
    borderColor: '#cbd5e1',
  },
  smallText: {
    fontSize: 8,
  },
  graphTitle: {
    fontSize: 11,
    marginBottom: 4,
    fontWeight: 700,
  },
});

export const ExperimentReport: React.FC<Props> = ({ experiment, series }) => {
  const started = new Date(experiment.startedAt);
  const ended = experiment.endedAt ? new Date(experiment.endedAt) : new Date();
  const tLast = series.length ? series[series.length - 1].t : 0;
  const runHours = tLast / 3600;

  // Build hourly rows
  type HourlyRow = { hour: number; dNa: number; dH2: number };
  const hourly: HourlyRow[] = [];
  if (series.length > 1) {
    let lastNa = series[0].naKg;
    let lastH2 = series[0].h2Kg;
    let lastHour = Math.floor(series[0].t / 3600);
    for (let i = 1; i < series.length; i++) {
      const p = series[i];
      const h = Math.floor(p.t / 3600);
      if (h !== lastHour) {
        hourly.push({
          hour: lastHour,
          dNa: series[i - 1].naKg - lastNa,
          dH2: series[i - 1].h2Kg - lastH2,
        });
        lastNa = series[i - 1].naKg;
        lastH2 = series[i - 1].h2Kg;
        lastHour = h;
      }
    }
    const last = series[series.length - 1];
    hourly.push({
      hour: lastHour,
      dNa: last.naKg - lastNa,
      dH2: last.h2Kg - lastH2,
    });
  }

  const peakCurrent = series.length ? Math.max(...series.map((p) => Math.abs(p.currentA))) : 0;
  const minHealth = series.length ? Math.min(...series.map((p) => p.electrodeHealth)) : 1;

  const firstWarning = series.find((p) => p.warningActive);
  const warningTime =
    firstWarning && typeof firstWarning.t === 'number'
      ? firstWarning.t / 3600
      : undefined;

  const expected =
    typeof experiment.expectedHours === 'number'
      ? `${experiment.expectedHours.toFixed(3)} h`
      : 'not available';

  const delta =
    typeof experiment.expectedHours === 'number'
      ? `${(runHours - experiment.expectedHours).toFixed(3)} h`
      : 'n/a';

  const t0 = series.length ? series[0].t : 0;
  const tEnd = series.length ? series[series.length - 1].t || t0 + 1 : t0 + 1;

  const naVals = series.map((p) => p.naKg);
  const h2Vals = series.map((p) => p.h2Kg);
  const naMin = naVals.length ? Math.min(...naVals, 0) : 0;
  const naMax = naVals.length ? Math.max(...naVals, 1e-6) : 1;
  const h2Min = h2Vals.length ? Math.min(...h2Vals, 0) : 0;
  const h2Max = h2Vals.length ? Math.max(...h2Vals, 1e-9) : 1;

  const graphWidth = 400;
  const graphHeight = 80;

  const timeTicks = 5;
  const timeTickLines = Array.from({ length: timeTicks + 1 }, (_, i) => t0 + ((tEnd - t0) * i) / timeTicks);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Sodium Plant Electrolysis Experiment Report</Text>

        <View style={{ marginBottom: 8 }}>
          <Text style={styles.paragraph}>
            Date (start): {started.toLocaleString()}
          </Text>
          <Text style={styles.paragraph}>
            Date (end): {ended.toLocaleString()}
          </Text>
          <Text style={styles.paragraph}>
            Total run time (simulated): {runHours.toFixed(3)} h
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Purpose of the experiment</Text>
        <Text style={styles.paragraph}>
          To explore the behavior of a sodium electrolysis cell under different voltage, power, and NaOH
          feed conditions, and to visualise sodium / gas production and failure modes.
        </Text>

        <Text style={styles.sectionTitle}>Experimental equipment and reagents</Text>
        <Text style={styles.listItem}>• Castner-type sodium electrolysis cell (simulated).</Text>
        <Text style={styles.listItem}>• NaOH feed tank (up to 500 kg, batch).</Text>
        <Text style={styles.listItem}>
          • Gas handling and purification train (H₂ and Cl₂ visualised).
        </Text>
        <Text style={styles.listItem}>
          • High-voltage power supply with voltage / power control (simulated).
        </Text>

        <Text style={styles.sectionTitle}>Initial conditions</Text>
        <Text style={styles.paragraph}>
          NaOH feed: {experiment.initialNaohKg.toFixed(3)} kg
        </Text>
        <Text style={styles.paragraph}>
          Voltage setpoint: {experiment.initialVoltageV.toFixed(2)} V
        </Text>
        <Text style={styles.paragraph}>
          Power target: {experiment.initialPowerKW.toFixed(2)} kW
        </Text>
        <Text style={styles.paragraph}>
          Initial cell current (approx): {experiment.initialCurrentA.toFixed(0)} A
        </Text>

        <Text style={styles.sectionTitle}>Time-series results (sampled)</Text>
        {series.slice(0, 25).map((p) => (
          <Text key={p.t} style={[styles.paragraph, styles.smallText]}>
            t={p.t.toFixed(1)} s | Na={p.naKg.toFixed(4)} kg | H₂={p.h2Kg.toExponential(3)} kg | I=
            {p.currentA.toFixed(0)} A | P={p.powerW.toFixed(0)} W
          </Text>
        ))}
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Hourly production summary</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.tableHeaderCell}>Hour</Text>
            <Text style={styles.tableHeaderCell}>Na (kg/h)</Text>
            <Text style={styles.tableHeaderCell}>H₂ (kg/h)</Text>
          </View>
          {hourly.slice(0, 30).map((row) => (
            <View key={row.hour} style={styles.tableRow}>
              <Text style={styles.tableCell}>{row.hour}</Text>
              <Text style={styles.tableCell}>{row.dNa.toFixed(4)}</Text>
              <Text style={styles.tableCell}>{row.dH2.toExponential(3)}</Text>
            </View>
          ))}
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.graphTitle}>Production graphs</Text>

        {/* Na graph */}
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.smallText}>Na (kg) vs time</Text>
          <Svg width={graphWidth} height={graphHeight + 20}>
            {/* Axes */}
            <Line
              x1={30}
              y1={10}
              x2={30}
              y2={10 + graphHeight}
              stroke="#64748b"
              strokeWidth={0.5}
            />
            <Line
              x1={30}
              y1={10 + graphHeight}
              x2={30 + graphWidth - 60}
              y2={10 + graphHeight}
              stroke="#64748b"
              strokeWidth={0.5}
            />

            {/* Ticks & labels (x-axis) */}
            {timeTickLines.map((tv, i) => {
              const x =
                30 + ((tv - t0) / (tEnd - t0 || 1)) * (graphWidth - 60);
              return (
                <React.Fragment key={`na-t-${i}`}>
                  <Line
                    x1={x}
                    y1={10 + graphHeight}
                    x2={x}
                    y2={12 + graphHeight}
                    stroke="#94a3b8"
                    strokeWidth={0.5}
                  />
                  <Text
                    style={styles.smallText}
                    x={x - 6}
                    y={18 + graphHeight}
                  >
                    {((tv - t0) / 3600).toFixed(1)}
                  </Text>
                </React.Fragment>
              );
            })}

            {/* Na line */}
            {series.map((p, idx) => {
              if (idx === 0) return null;
              const prev = series[idx - 1];
              const x1 =
                30 + ((prev.t - t0) / (tEnd - t0 || 1)) * (graphWidth - 60);
              const x2 =
                30 + ((p.t - t0) / (tEnd - t0 || 1)) * (graphWidth - 60);
              const y1 =
                10 +
                graphHeight -
                ((prev.naKg - naMin) / (naMax - naMin || 1)) * graphHeight;
              const y2 =
                10 +
                graphHeight -
                ((p.naKg - naMin) / (naMax - naMin || 1)) * graphHeight;
              return (
                <Line
                  key={`na-${idx}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#22c55e"
                  strokeWidth={1}
                />
              );
            })}
          </Svg>
        </View>

        {/* H2 graph */}
        <View>
          <Text style={styles.smallText}>H₂ (kg) vs time</Text>
          <Svg width={graphWidth} height={graphHeight + 20}>
            <Line
              x1={30}
              y1={10}
              x2={30}
              y2={10 + graphHeight}
              stroke="#64748b"
              strokeWidth={0.5}
            />
            <Line
              x1={30}
              y1={10 + graphHeight}
              x2={30 + graphWidth - 60}
              y2={10 + graphHeight}
              stroke="#64748b"
              strokeWidth={0.5}
            />

            {timeTickLines.map((tv, i) => {
              const x =
                30 + ((tv - t0) / (tEnd - t0 || 1)) * (graphWidth - 60);
              return (
                <React.Fragment key={`h2-t-${i}`}>
                  <Line
                    x1={x}
                    y1={10 + graphHeight}
                    x2={x}
                    y2={12 + graphHeight}
                    stroke="#94a3b8"
                    strokeWidth={0.5}
                  />
                  <Text
                    style={styles.smallText}
                    x={x - 6}
                    y={18 + graphHeight}
                  >
                    {((tv - t0) / 3600).toFixed(1)}
                  </Text>
                </React.Fragment>
              );
            })}

            {series.map((p, idx) => {
              if (idx === 0) return null;
              const prev = series[idx - 1];
              const x1 =
                30 + ((prev.t - t0) / (tEnd - t0 || 1)) * (graphWidth - 60);
              const x2 =
                30 + ((p.t - t0) / (tEnd - t0 || 1)) * (graphWidth - 60);
              const y1 =
                10 +
                graphHeight -
                ((prev.h2Kg - h2Min) / (h2Max - h2Min || 1)) * graphHeight;
              const y2 =
                10 +
                graphHeight -
                ((p.h2Kg - h2Min) / (h2Max - h2Min || 1)) * graphHeight;
              return (
                <Line
                  key={`h2-${idx}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#38bdf8"
                  strokeWidth={1}
                />
              );
            })}
          </Svg>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>
          Failure analysis and comparison to expected values
        </Text>
        {experiment.failed ? (
          <View>
            <Text style={styles.paragraph}>
              Outcome: FAILURE – plant destroyed in simulation.
            </Text>
            <Text style={styles.paragraph}>
              Primary cause (model): {experiment.failureReason ?? 'Model safety limits exceeded.'}
            </Text>
            <Text style={styles.paragraph}>
              Simulated run time to failure: {runHours.toFixed(3)} h
            </Text>
            <Text style={styles.paragraph}>
              Peak current observed: {peakCurrent.toFixed(0)} A
            </Text>
            <Text style={styles.paragraph}>
              Minimum electrode health: {(minHealth * 100).toFixed(1)} %
            </Text>
            <Text style={styles.paragraph}>
              {warningTime !== undefined
                ? `First warning issued at: ${warningTime.toFixed(3)} h`
                : 'Warning threshold not explicitly identified in history (instantaneous failure).'}
            </Text>
            <Text style={styles.paragraph}>
              Expected time from design calculation: {expected}
            </Text>
            <Text style={styles.paragraph}>
              Difference (simulated − expected): {delta}
            </Text>
          </View>
        ) : (
          <View>
            <Text style={styles.paragraph}>
              Outcome: Experiment completed without triggering model failure criteria.
            </Text>
            <Text style={styles.paragraph}>
              No failure analysis is required; simulated operation remained within safe limits.
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Electrochemical principles and reactions</Text>
        <Text style={styles.paragraph}>
          The model is based on an idealised Castner-type cell. Key half-reactions include:
        </Text>
        <Text style={styles.listItem}>
          • Cathode (sodium deposition): Na⁺ + e⁻ → Na(l)
        </Text>
        <Text style={styles.listItem}>
          • Cathode (hydrogen evolution): 2 H₂O + 2 e⁻ → H₂(g) + 2 OH⁻
        </Text>
        <Text style={styles.listItem}>
          • Anode (oxidation of anions): 2 Cl⁻ → Cl₂(g) + 2 e⁻ (or OH⁻ → O₂/H₂O in alkaline
          media).
        </Text>
        <Text style={styles.paragraph}>
          Overall, charge passed Q = ∫ I dt is converted to moles via Faraday&apos;s law n = Q / (zF),
          which the model uses to estimate sodium and hydrogen production. Electrode health
          declines with cumulative charge density; when the available surface area is effectively
          exhausted, resistance rises and the cell becomes unstable, triggering the simulated
          failure.
        </Text>
        <Text style={styles.paragraph}>
          The stylised diagrams underlying this simulation correspond to a simple electrochemical
          cell:
        </Text>
        <Text style={styles.listItem}>
          • Cathode: electron-rich metal surface where Na⁺ and/or H₂O are reduced.
        </Text>
        <Text style={styles.listItem}>
          • Anode: electron-poor surface where anions are oxidised.
        </Text>
        <Text style={styles.listItem}>
          • Electrolyte: molten / concentrated NaOH providing ionic conduction between the
          electrodes.
        </Text>
        <Text style={styles.listItem}>
          • External circuit: current source driving I through the cell with voltage V = I·R(t).
        </Text>
        <Text style={[styles.paragraph, styles.smallText]}>
          Note: This report is generated from a simplified educational model. It must not be used
          as engineering documentation or safety proof for any real sodium plant.
        </Text>
      </Page>
    </Document>
  );
};

