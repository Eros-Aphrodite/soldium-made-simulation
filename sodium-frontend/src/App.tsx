import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { PlantScene } from './PlantScene';
import { useElectrolysisSimulation } from './useElectrolysisSimulation';

type SimulationState = {
  time_hours: number;
  cumulative_na_kg: number;
  cumulative_naoh_kg: number;
  cumulative_cl2_kg: number;
  cumulative_h2_kg: number;
  cumulative_revenue: number;
  cumulative_cost: number;
  current_a: number;
  dt_hours: number;
};

const API_BASE = 'http://127.0.0.1:8000';

type MiniGraphProps = {
  title: string;
  series: { t: number; y: number }[];
  yLabel: string;
};

function MiniGraph({ title, series, yLabel }: MiniGraphProps) {
  if (!series.length) return null;

  const t0 = series[0].t;
  const tLast = series[series.length - 1].t || t0 + 1;
  const xs = series.map((p) => p.t);
  const ys = series.map((p) => p.y);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1e-6);

  const width = 220;
  const height = 80;

  const path = series
    .map((p, i) => {
      const x = ((p.t - t0) / (tLast - t0 || 1)) * (width - 10) + 5;
      const normY = (p.y - minY) / (maxY - minY || 1);
      const y = height - 5 - normY * (height - 10);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');

  return (
    <div className="mini-graph">
      <div className="mini-graph-header">
        <span>{title}</span>
        <span className="mini-graph-ylabel">{yLabel}</span>
      </div>
      <svg width={width} height={height}>
        <path d={path} stroke="#22c55e" strokeWidth={2} fill="none" />
      </svg>
    </div>
  );
}

function App() {
  const [sim, setSim] = useState<SimulationState | null>(null);
  const [currentAInput, setCurrentAInput] = useState('4.0'); // now used as voltage input (V)
  const [dtInput, setDtInput] = useState('1');
  const [naohMassInput, setNaohMassInput] = useState('10'); // kg
  const [estimatedHours, setEstimatedHours] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [reactionFocus, setReactionFocus] = useState<'none' | 'cathode' | 'anode' | 'electrolyte'>(
    'none',
  );
  const [activeModel, setActiveModel] = useState<'plant' | 'hv-room'>('plant');

  async function fetchState() {
    try {
      const res = await fetch(`${API_BASE}/api/state`);
      if (!res.ok) throw new Error('state error');
      const data = await res.json();
      setSim(data);
    } catch (err) {
      setStatus('Failed to contact backend. Is api_server.py running?');
    }
  }

  async function handleReset() {
    try {
      const body = {
        current_a: parseFloat(currentAInput) || 0,
        dt_hours: parseFloat(dtInput) || 1,
      };
      const res = await fetch(`${API_BASE}/api/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('reset error');
      await res.json();
      setStatus('Plant reset.');
      await fetchState();
    } catch (err) {
      setStatus('Reset failed. Check backend console.');
    }
  }

  async function handleStep(steps = 1) {
    try {
      const res = await fetch(`${API_BASE}/api/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps }),
      });
      if (!res.ok) throw new Error('step error');
      const data = await res.json();
      setSim((prev) => ({
        ...(prev ?? data),
        ...data,
      }));
      setStatus('');
    } catch (err) {
      setStatus('Step failed. Is api_server.py running?');
      setIsRunning(false);
    }
  }

  async function handleEstimateTime() {
    try {
      const currentA = parseFloat(currentAInput) || 0;
      const naohMass = parseFloat(naohMassInput) || 0;
      if (currentA <= 0 || naohMass <= 0) {
        setStatus('Enter positive current and NaOH mass.');
        return;
      }
      const res = await fetch(`${API_BASE}/api/reaction_time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_a: currentA,
          naoh_mass_kg: naohMass,
          efficiency: 0.9,
        }),
      });
      if (!res.ok) throw new Error('time error');
      const data = await res.json();
      setEstimatedHours(data.hours.toFixed(2));
      setStatus('');
    } catch (err) {
      setStatus('Time estimate failed. Check backend console.');
    }
  }

  useEffect(() => {
    fetchState();
  }, []);

  useEffect(() => {
    if (!isRunning) return;
    let cancelled = false;

    const loop = async () => {
      if (cancelled) return;
      await handleStep(1);
      if (!cancelled) {
        setTimeout(loop, 500);
      }
    };

    loop();
    return () => {
      cancelled = true;
    };
  }, [isRunning]);

  const voltageV = useMemo(
    () => (Number.isFinite(parseFloat(currentAInput)) ? parseFloat(currentAInput) : 0),
    [currentAInput],
  );

  const localSim = useElectrolysisSimulation({
    voltageV,
    naohInitialKg: parseFloat(naohMassInput) || 0,
    running: isRunning,
    dtSeconds: 0.25,
  });

  const productionKg = localSim.naProducedKg;
  const currentAForViz = localSim.currentA;
  const h2Kg = localSim.h2Kg;

  return (
    <div className="app-root">
      <div className="sidebar">
        <h1 className="title">Sodium Plant Simulation</h1>

        <div className="controls">
          <label>
            <span>Voltage (V)</span>
            <input
              type="number"
              value={currentAInput}
              onChange={(e) => setCurrentAInput(e.target.value)}
            />
          </label>
          <label>
            <span>Δt (hours)</span>
            <input
              type="number"
              step="0.1"
              value={dtInput}
              onChange={(e) => setDtInput(e.target.value)}
            />
          </label>

          <label>
            <span>NaOH feed (kg, Castner batch)</span>
            <input
              type="number"
              step="0.1"
              value={naohMassInput}
              onChange={(e) => setNaohMassInput(e.target.value)}
            />
          </label>

          <div className="button-row">
            <button onClick={handleReset}>Reset</button>
            <button onClick={() => handleStep(1)}>Step</button>
            <button onClick={() => handleStep(10)}>+10 Steps</button>
          </div>
          <div className="button-row">
            <button onClick={() => setIsRunning((r) => !r)}>
              {isRunning ? 'Pause' : 'Run'}
            </button>
            <button onClick={handleEstimateTime}>Estimate time</button>
          </div>
        </div>

        <div className="stats">
          <h2>State</h2>
          {localSim ? (
            <>
              <ul>
                <li>
                  <span>Time (s)</span>
                  <strong>{localSim.time_s.toFixed(1)}</strong>
                </li>
                <li>
                  <span>Na produced (kg)</span>
                  <strong>{localSim.naProducedKg.toFixed(3)}</strong>
                </li>
                <li>
                  <span>NaOH (kg)</span>
                  <strong>{localSim.naohRemainingKg.toFixed(3)}</strong>
                </li>
                <li>
                  <span>H₂ (kg)</span>
                  <strong>{localSim.h2Kg.toFixed(5)}</strong>
                </li>
                <li>
                  <span>Voltage (V)</span>
                  <strong>{voltageV.toFixed(2)}</strong>
                </li>
                <li>
                  <span>Current (A)</span>
                  <strong>{localSim.currentA.toFixed(0)}</strong>
                </li>
                <li>
                  <span>Resistance (Ω)</span>
                  <strong>{localSim.resistanceOhm.toExponential(3)}</strong>
                </li>
                <li>
                  <span>Power (W)</span>
                  <strong>{localSim.powerW.toFixed(0)}</strong>
                </li>
                <li>
                  <span>Electrode health</span>
                  <strong>{(localSim.electrodeHealth * 100).toFixed(1)}%</strong>
                </li>
                {localSim.warningActive && (
                  <li>
                    <span>Warning</span>
                    <strong>Electrode limit / over-current</strong>
                  </li>
                )}
                {localSim.exploded && (
                  <li>
                    <span>Status</span>
                    <strong>Test failed – cell destroyed</strong>
                  </li>
                )}
              </ul>

              <MiniGraph
                title="Na production"
                yLabel="kg"
                series={localSim.history.map((p) => ({ t: p.t, y: p.naKg }))}
              />
              <MiniGraph
                title="H₂ production"
                yLabel="kg"
                series={localSim.history.map((p) => ({ t: p.t, y: p.h2Kg }))}
              />
            </>
          ) : (
            <p>No data yet.</p>
          )}
        </div>

        {status && <div className="status">{status}</div>}
      </div>

      <div className="canvas-container">
        <div className="model-toggle">
          <button
            className={activeModel === 'plant' ? 'active' : ''}
            onClick={() => setActiveModel('plant')}
          >
            Plant system
          </button>
          <button
            className={activeModel === 'hv-room' ? 'active' : ''}
            onClick={() => setActiveModel('hv-room')}
          >
            HV room
          </button>
        </div>
        <PlantScene
          productionKg={productionKg}
          currentA={currentAForViz}
          running={isRunning}
          h2Kg={h2Kg}
          activeModel={activeModel}
          onCathodeClick={() => setReactionFocus('cathode')}
          onAnodeClick={() => setReactionFocus('anode')}
          onElectrolyteClick={() => setReactionFocus('electrolyte')}
        />
        <div className="reaction-panel">
          <div className="reaction-header">
            {reactionFocus === 'cathode' && 'Cathode: sodium reduction'}
            {reactionFocus === 'anode' && 'Anode: oxidation of ions'}
            {reactionFocus === 'electrolyte' && 'Electrolyte: ion motion'}
            {reactionFocus === 'none' && 'Click cell to view reaction'}
          </div>
          <div
            className={`reaction-viewport focus-${reactionFocus} ${
              isRunning ? 'running' : 'stopped'
            }`}
          >
            {/* shared electron track */}
            <div className="electron-track">
              <span className="electron" />
              <span className="electron" />
              <span className="electron" />
            </div>

            {/* simplified ion clouds for anode/electrolyte views */}
            <div className="ion-cloud left">
              <span className="ion positive" />
              <span className="ion positive" />
              <span className="ion positive" />
            </div>
            <div className="ion-cloud right">
              <span className="ion negative" />
              <span className="ion negative" />
              <span className="ion negative" />
            </div>

            {/* dedicated sodium reduction micro-scene for cathode */}
            <div className="na-scene">
              <div className="na-ion labeled">Na⁺</div>
              <div className="na-electron e1">e⁻</div>
              <div className="na-electron e2">e⁻</div>
              <div className="na-atom labeled">Na</div>
            </div>

            {/* hydroxide / oxygen micro-scene for anode */}
            <div className="oh-scene">
              <div className="oh-ion labeled">OH⁻</div>
              <div className="oh-ion labeled second">OH⁻</div>
              <div className="oh-electron">e⁻</div>
              <div className="oh-product labeled">O₂</div>
            </div>

            {/* generic electrolyte ion motion micro-scene */}
            <div className="electrolyte-scene">
              <div className="el-ion cation">Na⁺</div>
              <div className="el-ion anion">OH⁻</div>
              <div className="el-ion cation">Na⁺</div>
              <div className="el-ion anion">OH⁻</div>
            </div>

            {/* stylised electrode face, labeled by focus */}
            <div className="product-cluster">
              {reactionFocus === 'cathode' && '−'}
              {reactionFocus === 'anode' && '+'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

