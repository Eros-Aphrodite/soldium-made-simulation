import { useEffect, useState } from 'react';
import './App.css';
import { PlantScene } from './PlantScene';

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

function App() {
  const [sim, setSim] = useState<SimulationState | null>(null);
  const [currentAInput, setCurrentAInput] = useState('10000');
  const [dtInput, setDtInput] = useState('1');
  const [naohMassInput, setNaohMassInput] = useState('10'); // kg
  const [estimatedHours, setEstimatedHours] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [reactionFocus, setReactionFocus] = useState<'none' | 'cathode' | 'anode' | 'electrolyte'>(
    'none',
  );

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

  const productionKg = sim?.cumulative_na_kg ?? 0;
  const currentAForViz =
    sim?.current_a ??
    (Number.isFinite(parseFloat(currentAInput)) ? parseFloat(currentAInput) : 0);
  const h2Kg = sim?.cumulative_h2_kg ?? 0;

  return (
    <div className="app-root">
      <div className="sidebar">
        <h1 className="title">Sodium Plant Simulation</h1>

        <div className="controls">
          <label>
            <span>Current (A)</span>
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
          {sim ? (
            <ul>
              <li>
                <span>Time (h)</span>
                <strong>{sim.time_hours.toFixed(2)}</strong>
              </li>
              <li>
                <span>Na produced (kg)</span>
                <strong>{sim.cumulative_na_kg.toFixed(3)}</strong>
              </li>
              <li>
                <span>NaOH (kg)</span>
                <strong>{sim.cumulative_naoh_kg.toFixed(3)}</strong>
              </li>
              <li>
                <span>Cl₂ (kg)</span>
                <strong>{sim.cumulative_cl2_kg.toFixed(3)}</strong>
              </li>
              <li>
                <span>H₂ (kg)</span>
                <strong>{sim.cumulative_h2_kg.toFixed(3)}</strong>
              </li>
              <li>
                <span>Revenue</span>
                <strong>{sim.cumulative_revenue.toFixed(2)}</strong>
              </li>
              <li>
                <span>Cost</span>
                <strong>{sim.cumulative_cost.toFixed(2)}</strong>
              </li>
              <li>
                <span>Current (A)</span>
                <strong>{sim.current_a.toFixed(0)}</strong>
              </li>
              <li>
                <span>Δt (h)</span>
                <strong>{sim.dt_hours.toFixed(2)}</strong>
              </li>
              {estimatedHours && (
                <li>
                  <span>Time to consume NaOH (h)</span>
                  <strong>{estimatedHours}</strong>
                </li>
              )}
            </ul>
          ) : (
            <p>No data yet.</p>
          )}
        </div>

        {status && <div className="status">{status}</div>}
      </div>

      <div className="canvas-container">
        <PlantScene
          productionKg={productionKg}
          currentA={currentAForViz}
          running={isRunning}
          h2Kg={h2Kg}
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

            <div className="product-cluster" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

