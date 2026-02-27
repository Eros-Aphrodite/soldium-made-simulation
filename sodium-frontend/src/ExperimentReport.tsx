import React from 'react';
import { Document, Page, Text, View, StyleSheet, Svg, Line, Image } from '@react-pdf/renderer';
import type { HistoryPoint } from './useElectrolysisSimulation';

type ExperimentMetaForReport = {
  startedAt: string;
  endedAt?: string;
  initialNaohKg: number;
  naohPurityPercent: number;
  initialVoltageV: number;
  initialPowerKW: number;
  initialCurrentA: number;
  failed: boolean;
  failureReason?: string;
  expectedHours?: number;
};

type ExperimentEventForReport = {
  t_s: number;
  kind: string;
  description: string;
};

type Props = {
  experiment: ExperimentMetaForReport;
  series: HistoryPoint[];
  events: ExperimentEventForReport[];
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
  divider: {
    marginTop: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#94a3b8',
  },
  diagram: {
    marginTop: 4,
    marginBottom: 8,
    width: '100%',
    height: 'auto',
  },
  graphGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  graphBox: {
    width: '48%',
    marginBottom: 10,
  },
});

export const ExperimentReport: React.FC<Props> = ({ experiment, series, events }) => {
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
  const maxTempC = series.length ? Math.max(...series.map((p) => p.cellTempC ?? 0)) : 0;

  const graphWidth = 400;
  const graphHeight = 80;
  const smallGraphWidth = 250;
  const smallGraphHeight = 70;

  const timeTicks = 5;
  const timeTickLines = Array.from({ length: timeTicks + 1 }, (_, i) => t0 + ((tEnd - t0) * i) / timeTicks);

  const sortedEvents = [...events].sort((a, b) => a.t_s - b.t_s);

  const voltageVals = series.map((p) => (Math.abs(p.currentA) > 1e-9 ? p.powerW / p.currentA : 0));
  const currentKA = series.map((p) => p.currentA / 1000);
  const powerKW = series.map((p) => p.powerW / 1000);
  const resistance_mOhm = series.map((p) => p.resistanceOhm * 1000);

  const renderLineGraph = (opts: {
    title: string;
    unit: string;
    values: number[];
    color: string;
    formatTick?: (v: number) => string;
  }) => {
    const left = 30;
    const top = 10;
    const plotW = smallGraphWidth - 60;
    const plotH = smallGraphHeight;

    const vMin = opts.values.length ? Math.min(...opts.values) : 0;
    const vMax = opts.values.length ? Math.max(...opts.values) : 1;
    const pad = (vMax - vMin) * 0.08;
    const yMin = vMin - (Number.isFinite(pad) ? pad : 0);
    const yMax = vMax + (Number.isFinite(pad) ? pad : 0);

    const yTicks = 4;
    const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);

    const tickFmt = opts.formatTick ?? ((v: number) => v.toFixed(2));

    return (
      <View style={styles.graphBox}>
        <Text style={styles.smallText}>
          {opts.title} ({opts.unit}) vs time
        </Text>
        <Svg width={smallGraphWidth} height={smallGraphHeight + 22}>
          {/* Axes */}
          <Line x1={left} y1={top} x2={left} y2={top + plotH} stroke="#64748b" strokeWidth={0.5} />
          <Line
            x1={left}
            y1={top + plotH}
            x2={left + plotW}
            y2={top + plotH}
            stroke="#64748b"
            strokeWidth={0.5}
          />

          {/* Y ticks + labels */}
          {yTickVals.map((yv, i) => {
            const y = top + plotH - ((yv - yMin) / (yMax - yMin || 1)) * plotH;
            return (
              <React.Fragment key={`y-${opts.title}-${i}`}>
                <Line x1={left - 2} y1={y} x2={left} y2={y} stroke="#94a3b8" strokeWidth={0.5} />
                <Text style={styles.smallText} x={left - 4} y={y + 3} textAnchor="end">
                  {tickFmt(yv)}
                </Text>
              </React.Fragment>
            );
          })}

          {/* X ticks (minutes) */}
          {timeTickLines.map((tv, i) => {
            const x = left + ((tv - t0) / (tEnd - t0 || 1)) * plotW;
            return (
              <React.Fragment key={`x-${opts.title}-${i}`}>
                <Line
                  x1={x}
                  y1={top + plotH}
                  x2={x}
                  y2={top + plotH + 2}
                  stroke="#94a3b8"
                  strokeWidth={0.5}
                />
                <Text style={styles.smallText} x={x - 6} y={top + plotH + 14}>
                  {((tv - t0) / 60).toFixed(0)}
                </Text>
              </React.Fragment>
            );
          })}

          {/* Curve */}
          {opts.values.map((v, idx) => {
            if (idx === 0) return null;
            const prevV = opts.values[idx - 1];
            const p = series[idx];
            const prevP = series[idx - 1];
            const x1 = left + ((prevP.t - t0) / (tEnd - t0 || 1)) * plotW;
            const x2 = left + ((p.t - t0) / (tEnd - t0 || 1)) * plotW;
            const y1 = top + plotH - ((prevV - yMin) / (yMax - yMin || 1)) * plotH;
            const y2 = top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
            return <Line key={`${opts.title}-${idx}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={opts.color} strokeWidth={1} />;
          })}

          <Text style={styles.smallText} x={left + plotW / 2 - 14} y={top + plotH + 20}>
            Time (min)
          </Text>
        </Svg>
      </View>
    );
  };

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

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Experimental procedure (how this run was performed)</Text>
        <Text style={styles.paragraph}>
          1. The operator selected an NaOH feed mass, a voltage setpoint, and optionally a power target in the
          simulation UI.
        </Text>
        <Text style={styles.paragraph}>
          2. The experiment was started using the toolbar. The model then advanced in small time steps
          (0.25&nbsp;s), continuously updating current, resistance, power, and product formation.
        </Text>
        <Text style={styles.paragraph}>
          3. As Joule heating increased the cell temperature, the effective resistance rose, which in turn reduced
          the current and slowed sodium production. Additional power would be required to keep production high.
        </Text>
        <Text style={styles.paragraph}>
          4. Electrodes aged with cumulative charge and temperature; if safety limits were exceeded, the model
          triggered a failure and destroyed-factory visualisation.
        </Text>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Purpose of the experiment</Text>
        <Text style={styles.paragraph}>
          To explore the behavior of a sodium electrolysis cell under different voltage, power, and NaOH
          feed conditions, and to visualise sodium / gas production and failure modes.
        </Text>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Experimental equipment and reagents</Text>
        <Text style={styles.listItem}>• Castner-type sodium electrolysis cell (simulated).</Text>
        <Text style={styles.listItem}>• NaOH feed tank (up to 500 kg, batch).</Text>
        <Text style={styles.listItem}>• Gas handling and purification train (H2 and Cl2 visualised).</Text>
        <Text style={styles.listItem}>
          • High-voltage power supply with voltage / power control (simulated).
        </Text>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Initial conditions</Text>
        <Text style={styles.paragraph}>
          NaOH feed (as charged): {experiment.initialNaohKg.toFixed(3)} kg
        </Text>
        <Text style={styles.paragraph}>
          NaOH purity: {experiment.naohPurityPercent.toFixed(1)} %
        </Text>
        <Text style={styles.paragraph}>
          Effective NaOH for reaction: {((experiment.initialNaohKg * experiment.naohPurityPercent) / 100).toFixed(3)} kg
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

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Time-series results (sampled)</Text>
        {series.slice(0, 25).map((p) => (
          <Text key={p.t} style={[styles.paragraph, styles.smallText]}>
            t={p.t.toFixed(1)} s | Na={p.naKg.toFixed(4)} kg | H2={p.h2Kg.toExponential(3)} kg | I=
            {p.currentA.toFixed(0)} A | P={p.powerW.toFixed(0)} W
          </Text>
        ))}

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Timeline of experiment (operator actions)</Text>
        {sortedEvents.length === 0 ? (
          <Text style={styles.paragraph}>No operator actions were recorded.</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeaderCell}>Time (min)</Text>
              <Text style={styles.tableHeaderCell}>Event</Text>
              <Text style={styles.tableHeaderCell}>Details</Text>
            </View>
            {sortedEvents.map((ev, idx) => (
              <View key={idx} style={styles.tableRow}>
                <Text style={styles.tableCell}>{(ev.t_s / 60).toFixed(2)}</Text>
                <Text style={styles.tableCell}>{ev.kind}</Text>
                <Text style={styles.tableCell}>{ev.description}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Hourly production summary</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.tableHeaderCell}>Hour</Text>
            <Text style={styles.tableHeaderCell}>Na (kg/h)</Text>
            <Text style={styles.tableHeaderCell}>H2 (kg/h)</Text>
          </View>
          {hourly.slice(0, 30).map((row) => (
            <View key={row.hour} style={styles.tableRow}>
              <Text style={styles.tableCell}>{row.hour}</Text>
              <Text style={styles.tableCell}>{row.dNa.toFixed(4)}</Text>
              <Text style={styles.tableCell}>{row.dH2.toExponential(3)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.divider} />

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
          <Text style={styles.smallText}>H2 (kg) vs time</Text>
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

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Electrical operating curves</Text>
        <View style={styles.graphGrid}>
          {renderLineGraph({ title: 'Voltage', unit: 'V', values: voltageVals, color: '#f59e0b', formatTick: (v) => v.toFixed(2) })}
          {renderLineGraph({ title: 'Current', unit: 'kA', values: currentKA, color: '#ef4444', formatTick: (v) => v.toFixed(1) })}
          {renderLineGraph({ title: 'Power', unit: 'kW', values: powerKW, color: '#8b5cf6', formatTick: (v) => v.toFixed(0) })}
          {renderLineGraph({ title: 'Resistance', unit: 'mΩ', values: resistance_mOhm, color: '#10b981', formatTick: (v) => v.toFixed(3) })}
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Experimental equipment drawings (schematic)</Text>
        <Image src="/electrolysis-views.png" style={styles.diagram} />
        <Image src="/electrolysis-dimensions.png" style={styles.diagram} />
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
              Maximum simulated cell temperature: {maxTempC.toFixed(1)} °C
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
              Expected completion time from design calculation: {expected}
            </Text>
            <Text style={styles.paragraph}>
              Actual simulated run time in this experiment: {runHours.toFixed(3)} h
            </Text>
            <Text style={styles.paragraph}>
              Time error (simulated − expected): {delta}
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Electrochemical principles and reactions</Text>
        <Text style={styles.paragraph}>
          The model is based on an idealised Castner-type cell. Key half-reactions include:
        </Text>
        <Text style={styles.listItem}>
          • Cathode (sodium deposition): Na+ + e- → Na(l)
        </Text>
        <Text style={styles.listItem}>
          • Cathode (hydrogen evolution): 2 H2O + 2 e- → H2(g) + 2 OH-
        </Text>
        <Text style={styles.listItem}>
          • Anode (oxidation of anions): 2 Cl- → Cl2(g) + 2 e- (or OH- → O2/H2O in alkaline
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
          • Cathode: electron-rich metal surface where Na+ and/or H2O are reduced.
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

