import { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
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

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

type ExperimentMeta = {
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

function App() {
  const [, setSim] = useState<SimulationState | null>(null);
  const [currentAInput, setCurrentAInput] = useState('4.0'); // now used as voltage input (V)
  const [dtInput, setDtInput] = useState('1');
  const [naohMassInput, setNaohMassInput] = useState('10'); // kg
  const [powerKWInput, setPowerKWInput] = useState('0'); // optional power target
  const [, setEstimatedHours] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [reactionFocus, setReactionFocus] = useState<'none' | 'cathode' | 'anode' | 'electrolyte'>(
    'none',
  );
  const [activeModel] = useState<'plant' | 'hv-room'>('plant');
  const [showGraphModal, setShowGraphModal] = useState(false);
  const [showIntroModal, setShowIntroModal] = useState(true);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [experiment, setExperiment] = useState<ExperimentMeta | null>(null);
  const explosionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const explosionTriggerRef = useRef<((pos: { x: number; y: number }) => void) | null>(null);
  const prevExplodedRef = useRef(false);

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
    targetPowerKW: parseFloat(powerKWInput) || 0,
    mode: (parseFloat(powerKWInput) || 0) > 0 ? 'power' : 'voltage',
    naohInitialKg: parseFloat(naohMassInput) || 0,
    running: isRunning,
    dtSeconds: 0.25,
  });

  const productionKg = localSim.naProducedKg;
  const currentAForViz = localSim.currentA;
  const h2Kg = localSim.h2Kg;

  const handleStartExperiment = () => {
    const now = new Date();
    setExperiment({
      startedAt: now.toISOString(),
      initialNaohKg: parseFloat(naohMassInput) || 0,
      initialVoltageV: voltageV,
      initialPowerKW: parseFloat(powerKWInput) || 0,
      initialCurrentA: localSim.currentA,
      failed: false,
    });
    setIsRunning(true);
  };

  const handleEndExperiment = async () => {
    setIsRunning(false);

    let expectedHours: number | undefined;
    try {
      const res = await fetch(`${API_BASE}/api/reaction_time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_a: Math.max(localSim.currentA, 0),
          naoh_mass_kg: parseFloat(naohMassInput) || 0,
          efficiency: 0.9,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        expectedHours = data.hours;
      }
    } catch {
      expectedHours = undefined;
    }

    setExperiment((prev) => {
      const failureReason =
        localSim.exploded && localSim.warningReason
          ? localSim.warningReason === 'overCurrent'
            ? 'Over-current above 50 kA'
            : 'Electrode end-of-life'
          : undefined;
      return {
        ...(prev ?? {
          startedAt: new Date().toISOString(),
          initialNaohKg: parseFloat(naohMassInput) || 0,
          initialVoltageV: voltageV,
          initialPowerKW: parseFloat(powerKWInput) || 0,
          initialCurrentA: localSim.currentA,
          failed: false,
        }),
        endedAt: new Date().toISOString(),
        failed: localSim.exploded,
        failureReason,
        expectedHours,
      };
    });

    setShowReportModal(true);
  };

  const handleDownloadReport = async () => {
    if (!experiment) return;
    const doc = new jsPDF();

    const started = new Date(experiment.startedAt);
    const ended = experiment.endedAt ? new Date(experiment.endedAt) : new Date();
    const runSeconds = localSim.time_s;
    const runHours = runSeconds / 3600;

    let y = 12;
    doc.setFontSize(14);
    doc.text('Sodium Plant Electrolysis Experiment Report', 10, y);
    y += 8;

    doc.setFontSize(10);
    doc.text(`Date (start): ${started.toLocaleString()}`, 10, y);
    y += 5;
    doc.text(`Date (end):   ${ended.toLocaleString()}`, 10, y);
    y += 5;
    doc.text(`Total run time: ${runSeconds.toFixed(1)} s (${runHours.toFixed(3)} h)`, 10, y);
    y += 8;

    doc.setFontSize(11);
    doc.text('Purpose of the experiment', 10, y);
    y += 5;
    doc.setFontSize(9);
    doc.text(
      [
        'To explore the behavior of a sodium electrolysis cell under different voltage, power,',
        'and NaOH feed conditions, and to visualize sodium / gas production and failure modes.',
      ],
      10,
      y,
    );
    y += 12;

    doc.setFontSize(11);
    doc.text('Experimental equipment and reagents', 10, y);
    y += 5;
    doc.setFontSize(9);
    doc.text(
      [
        '- Castner-type sodium electrolysis cell (simulated)',
        '- NaOH feed tank (up to 500 kg, batch)',
        '- Gas handling and purification train (H₂ and Cl₂ visualised)',
        '- High-voltage power supply with voltage / power control (simulated)',
      ],
      10,
      y,
    );
    y += 18;

    doc.setFontSize(11);
    doc.text('Underlying principles', 10, y);
    y += 5;
    doc.setFontSize(9);
    doc.text(
      [
        'The model approximates the Castner process: electric current drives Na⁺ reduction at the',
        'cathode and oxidation of anions at the anode. Faraday\'s law links charge passed to the',
        'amount of sodium and gas produced. Electrode health declines with cumulative charge, and',
        'safety limits are enforced at ~50 kA and low electrode health, leading to failure.',
      ],
      10,
      y,
    );
    y += 18;

    doc.setFontSize(11);
    doc.text('Initial conditions', 10, y);
    y += 5;
    doc.setFontSize(9);
    doc.text(
      [
        `NaOH feed: ${experiment.initialNaohKg.toFixed(3)} kg`,
        `Voltage setpoint: ${experiment.initialVoltageV.toFixed(2)} V`,
        `Power target: ${experiment.initialPowerKW.toFixed(2)} kW`,
        `Initial cell current (approx): ${experiment.initialCurrentA.toFixed(0)} A`,
      ],
      10,
      y,
    );
    y += 18;

    doc.setFontSize(11);
    doc.text('Time-series results (sampled)', 10, y);
    y += 5;
    doc.setFontSize(9);

    const rows: string[] = [];
    const series = localSim.history;
    const step = Math.max(1, Math.floor(series.length / 20));
    for (let i = 0; i < series.length; i += step) {
      const p = series[i];
      rows.push(
        `${p.t.toFixed(1)} s | Na=${p.naKg.toFixed(4)} kg | H2=${p.h2Kg.toExponential(
          3,
        )} kg | I=${p.currentA.toFixed(0)} A | P=${p.powerW.toFixed(0)} W`,
      );
    }
    doc.text(rows, 10, y);
    y += Math.min(rows.length * 4, 80);

    doc.addPage();
    y = 12;

    doc.setFontSize(11);
    doc.text('Failure analysis and comparison to expected values', 10, y);
    y += 5;
    doc.setFontSize(9);

    if (experiment.failed) {
      const reasonText =
        experiment.failureReason ??
        (localSim.warningReason === 'overCurrent'
          ? 'Over-current beyond nominal limit.'
          : localSim.warningReason === 'endOfLife'
          ? 'Electrode end-of-life (health below threshold).'
          : 'Failure triggered by model safety limits.');

      const expected =
        typeof experiment.expectedHours === 'number'
          ? `${experiment.expectedHours.toFixed(3)} h`
          : 'not available';

      const delta =
        typeof experiment.expectedHours === 'number'
          ? `${(runHours - experiment.expectedHours).toFixed(3)} h`
          : 'n/a';

      doc.text(
        [
          `Outcome: FAILURE – plant destroyed in simulation.`,
          `Primary cause (model): ${reasonText}`,
          `Simulated run time to failure: ${runHours.toFixed(3)} h`,
          `Expected time from design calculation: ${expected}`,
          `Difference (simulated − expected): ${delta}`,
        ],
        10,
        y,
      );
      y += 28;
    } else {
      doc.text(
        [
          'Outcome: Experiment completed without triggering model failure criteria.',
          'No failure analysis is required; simulated operation remained within safe limits.',
        ],
        10,
        y,
      );
      y += 16;
    }

    doc.text(
      [
        'Note: This report is generated from a simplified educational model. It must not be used as',
        'engineering documentation or safety proof for any real sodium plant.',
      ],
      10,
      y,
    );

    const fileStamp = started.toISOString().replace(/[:T]/g, '-').split('.')[0];
    doc.save(`sodium-experiment-report-${fileStamp}.pdf`);
  };

  // Explosion overlay effect (2D canvas, based on cell.html)
  useEffect(() => {
    const canvas = explosionCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    type SmokeType = 'burst' | 'stalk';
    type SmokeParticle = {
      x: number;
      y: number;
      type: SmokeType;
      size: number;
      vx: number;
      vy: number;
      life: number;
      decay: number;
      colorVal: number;
    };

    const particles: SmokeParticle[] = [];
    let flashIntensity = 0;

    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    function addSmoke(x: number, y: number, type: SmokeType, speedMult = 1) {
      particles.push({
        x,
        y,
        type,
        size: Math.random() * 10 + 5,
        vx: (Math.random() - 0.5) * (type === 'burst' ? 25 : 5) * speedMult,
        vy: (type === 'burst' ? (Math.random() - 0.5) * 15 : -Math.random() * 10) * speedMult,
        life: 1,
        decay: Math.random() * 0.01 + 0.005,
        colorVal: 255,
      });
    }

    function detonateAt(x: number, y: number) {
      flashIntensity = 1;
      // immediate high-velocity burst
      for (let i = 0; i < 100; i++) addSmoke(x, y, 'burst', 2);

      // continuous updraft (mushroom)
      let count = 0;
      const seq = setInterval(() => {
        for (let i = 0; i < 10; i++) {
          // stalk
          addSmoke(x + (Math.random() - 0.5) * 30, y - count * 2, 'stalk', 1);
          // cap
          if (count > 15) {
            addSmoke(x + (Math.random() - 0.5) * 100, y - count * 8, 'burst', 0.5);
          }
        }
        if (count++ > 50) clearInterval(seq);
      }, 30);
    }

    explosionTriggerRef.current = (pos) => {
      detonateAt(pos.x, pos.y);
    };

    let frameId: number;
    const loop = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // subtle dark veil
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, w, h);

      // update + draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        p.vy *= 0.98;
        p.life -= p.decay;
        p.size += 1.2;
        if (p.life < 0.7) p.colorVal -= 5;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = p.life;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        const c = Math.max(0, p.colorVal);
        if (p.life > 0.8) {
          g.addColorStop(0, '#fff');
          g.addColorStop(0.4, '#ffaa00');
        } else {
          g.addColorStop(0, `rgb(${c},${c},${c})`);
        }
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      }

      // screen flash
      if (flashIntensity > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flashIntensity})`;
        ctx.fillRect(0, 0, w, h);
        flashIntensity -= 0.05;
      }

      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(frameId);
      explosionTriggerRef.current = null;
    };
  }, []);

  // trigger explosions when sim marks exploded
  useEffect(() => {
    if (!localSim.exploded || prevExplodedRef.current) {
      prevExplodedRef.current = localSim.exploded;
      return;
    }
    prevExplodedRef.current = true;

    const canvas = explosionCanvasRef.current;
    const trigger = explosionTriggerRef.current;
    if (!canvas || !trigger) return;
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;

    // approximate positions: cell (left), gas tank (right)
    trigger({ x: w * 0.38, y: h * 0.7 });
    const id = setTimeout(() => {
      const t2 = explosionTriggerRef.current;
      const c2 = explosionCanvasRef.current;
      if (!t2 || !c2) return;
      const w2 = c2.clientWidth || c2.width;
      const h2 = c2.clientHeight || c2.height;
      t2({ x: w2 * 0.72, y: h2 * 0.7 });
    }, 1000);
    return () => clearTimeout(id);
  }, [localSim.exploded]);

  // When the local simulation records an explosion, show a fullscreen failure summary with artwork.
  useEffect(() => {
    if (localSim.exploded) {
      setShowFailureModal(true);
    }
  }, [localSim.exploded]);

  return (
    <div className="app-root">
      <div className="experiment-toolbar">
        <button onClick={handleStartExperiment} disabled={isRunning}>
          Start experiment
        </button>
        <button
          onClick={() => setIsRunning((r) => !r)}
          disabled={!experiment}
        >
          {isRunning ? 'Pause' : 'Resume'}
        </button>
        <button onClick={handleEndExperiment} disabled={!experiment}>
          End experiment
        </button>
      </div>
      {showIntroModal && (
        <div
          className="intro-modal-backdrop"
          onClick={() => {
            setShowIntroModal(false);
          }}
        >
          <div
            className="intro-modal"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <h2>Sodium Plant Simulation – Read Before You Start</h2>
            <p className="intro-section-label">Purpose</p>
            <ul>
              <li>
                Explore how an industrial sodium electrolysis cell responds to different voltage,
                power, and NaOH feed settings.
              </li>
              <li>Visualize gas production, electrode wear, and dangerous failure modes.</li>
            </ul>
            <p className="intro-section-label">Constraints & model limits</p>
            <ul>
              <li>
                The model is simplified and tuned for teaching – it does <strong>not</strong> match a
                specific real plant design.
              </li>
              <li>
                Current is limited to about 50 kA; electrode life, NaOH capacity (500 kg), and gas
                output are approximate.
              </li>
              <li>Graphs show recent history only (most recent 400 samples) for clarity.</li>
            </ul>
            <p className="intro-section-label">Cautions</p>
            <ul>
              <li>
                This simulation is for educational use only and must <strong>not</strong> be used for
                engineering decisions or safety planning.
              </li>
              <li>
                Failure events (warnings, countdown, explosions, and destroyed‑factory view) are
                illustrative, not real safety guidance.
              </li>
              <li>
                By continuing you acknowledge that this is a visualization tool only and carries no
                warranty.
              </li>
            </ul>
            <button
              className="intro-primary-button"
              onClick={() => {
                setShowIntroModal(false);
              }}
            >
              I understand – start experiment
            </button>
          </div>
        </div>
      )}

      {showFailureModal && (
        <div
          className="intro-modal-backdrop"
          onClick={() => {
            setShowFailureModal(false);
          }}
        >
          <div
            className="intro-modal"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <h2>Experiment Failed – Plant Destroyed</h2>
            <p>
              The simulated cell has exceeded safe limits and suffered a catastrophic failure. The
              scene below is a stylized view of the fully destroyed factory after the event.
            </p>
            <p className="intro-section-label">What this means</p>
            <ul>
              <li>Electrode life or current limit was exceeded for long enough to trigger failure.</li>
              <li>Further operation is disabled until you reset and configure a safer operating point.</li>
            </ul>
            {/* Place your destroyed‑factory illustration in the public folder as `destroyed-factory.png`. */}
            <div className="destroyed-factory-frame">
              <img src="/destroyed-factory.png" alt="Destroyed sodium plant after explosion" />
            </div>
            <button
              className="intro-primary-button"
              onClick={() => {
                setShowFailureModal(false);
              }}
            >
              Close and review settings
            </button>
          </div>
        </div>
      )}
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
            <span>Power target (kW, optional)</span>
            <input
              type="number"
              step="0.1"
              value={powerKWInput}
              onChange={(e) => setPowerKWInput(e.target.value)}
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
            <button onClick={handleEstimateTime}>Estimate time</button>
            <button onClick={() => setShowGraphModal(true)}>View graphs</button>
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
            </>
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
          running={isRunning && !localSim.exploded}
          h2Kg={h2Kg}
          activeModel={activeModel}
          warningActive={localSim.warningActive}
          exploded={localSim.exploded}
          warningElapsed_s={localSim.warningElapsed_s}
          onCathodeClick={() => setReactionFocus('cathode')}
          onAnodeClick={() => setReactionFocus('anode')}
          onElectrolyteClick={() => setReactionFocus('electrolyte')}
        />
        <canvas ref={explosionCanvasRef} className="explosion-overlay" />
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

      {showGraphModal && (
        <div className="graph-modal-backdrop" onClick={() => setShowGraphModal(false)}>
          <div
            className="graph-modal"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="graph-modal-header">
              <h2>Production graphs</h2>
              <button onClick={() => setShowGraphModal(false)}>Close</button>
            </div>
            <div className="graph-modal-body">
              <svg className="graph-svg">
                <g transform="translate(40,10)">
                  {(() => {
                    const series = localSim.history;
                    if (!series.length) return null;
                    const t0 = series[0].t;
                    const tLast = series[series.length - 1].t || t0 + 1;
                    const width = 600;
                    const height = 140;
                    const naYs = series.map((p) => p.naKg);
                    const minY = Math.min(...naYs, 0);
                    const maxY = Math.max(...naYs, 1e-6);
                    const path = series
                      .map((p, i) => {
                        const x = ((p.t - t0) / (tLast - t0 || 1)) * (width - 50);
                        const normY = (p.naKg - minY) / (maxY - minY || 1);
                        const y = height - 20 - normY * (height - 40);
                        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
                      })
                      .join(' ');
                    return (
                      <>
                        <line x1={0} y1={height - 20} x2={width - 40} y2={height - 20} stroke="#4b5563" />
                        <line x1={0} y1={0} x2={0} y2={height - 20} stroke="#4b5563" />
                        {Array.from({ length: 6 }).map((_, i) => {
                          const frac = i / 5;
                          const tVal = t0 + (tLast - t0) * frac;
                          const x = ((tVal - t0) / (tLast - t0 || 1)) * (width - 50);
                          const y = height - 20;
                          return (
                            <g key={`na-x-${i}`}>
                              <line x1={x} y1={y} x2={x} y2={y + 4} stroke="#6b7280" />
                              <text x={x} y={y + 12} fill="#6b7280" fontSize={8} textAnchor="middle">
                                {tVal.toFixed(0)}
                              </text>
                            </g>
                          );
                        })}
                        {Array.from({ length: 5 }).map((_, i) => {
                          const frac = i / 4;
                          const v = minY + (maxY - minY) * frac;
                          const normY = (v - minY) / (maxY - minY || 1);
                          const y = height - 20 - normY * (height - 40);
                          return (
                            <g key={`na-y-${i}`}>
                              <line x1={-3} y1={y} x2={0} y2={y} stroke="#6b7280" />
                              <text x={-5} y={y + 3} fill="#6b7280" fontSize={8} textAnchor="end">
                                {v.toFixed(3)}
                              </text>
                            </g>
                          );
                        })}
                        <path d={path} stroke="#22c55e" strokeWidth={2} fill="none" />
                        <text x={(width - 40) / 2} y={height - 4} fill="#9ca3af" fontSize={10}>
                          Time (s)
                        </text>
                        <text x={-30} y={10} fill="#9ca3af" fontSize={10}>
                          Na (kg)
                        </text>
                      </>
                    );
                  })()}
                </g>
              </svg>

              <svg className="graph-svg">
                <g transform="translate(40,10)">
                  {(() => {
                    const series = localSim.history;
                    if (!series.length) return null;
                    const t0 = series[0].t;
                    const tLast = series[series.length - 1].t || t0 + 1;
                    const width = 600;
                    const height = 140;
                    const h2Ys = series.map((p) => p.h2Kg);
                    const minY = Math.min(...h2Ys, 0);
                    const maxY = Math.max(...h2Ys, 1e-9);
                    const path = series
                      .map((p, i) => {
                        const x = ((p.t - t0) / (tLast - t0 || 1)) * (width - 50);
                        const normY = (p.h2Kg - minY) / (maxY - minY || 1);
                        const y = height - 20 - normY * (height - 40);
                        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
                      })
                      .join(' ');
                    return (
                      <>
                        <line x1={0} y1={height - 20} x2={width - 40} y2={height - 20} stroke="#4b5563" />
                        <line x1={0} y1={0} x2={0} y2={height - 20} stroke="#4b5563" />
                        {Array.from({ length: 6 }).map((_, i) => {
                          const frac = i / 5;
                          const tVal = t0 + (tLast - t0) * frac;
                          const x = ((tVal - t0) / (tLast - t0 || 1)) * (width - 50);
                          const y = height - 20;
                          return (
                            <g key={`h2-x-${i}`}>
                              <line x1={x} y1={y} x2={x} y2={y + 4} stroke="#6b7280" />
                              <text x={x} y={y + 12} fill="#6b7280" fontSize={8} textAnchor="middle">
                                {tVal.toFixed(0)}
                              </text>
                            </g>
                          );
                        })}
                        {Array.from({ length: 5 }).map((_, i) => {
                          const frac = i / 4;
                          const v = minY + (maxY - minY) * frac;
                          const normY = (v - minY) / (maxY - minY || 1);
                          const y = height - 20 - normY * (height - 40);
                          return (
                            <g key={`h2-y-${i}`}>
                              <line x1={-3} y1={y} x2={0} y2={y} stroke="#6b7280" />
                              <text x={-5} y={y + 3} fill="#6b7280" fontSize={8} textAnchor="end">
                                {v.toExponential(1)}
                              </text>
                            </g>
                          );
                        })}
                        <path d={path} stroke="#38bdf8" strokeWidth={2} fill="none" />
                        <text x={(width - 40) / 2} y={height - 4} fill="#9ca3af" fontSize={10}>
                          Time (s)
                        </text>
                        <text x={-30} y={10} fill="#9ca3af" fontSize={10}>
                          H₂ (kg)
                        </text>
                      </>
                    );
                  })()}
                </g>
              </svg>

              <svg className="graph-svg">
                <g transform="translate(40,10)">
                  {(() => {
                    const series = localSim.history;
                    if (!series.length) return null;
                    const t0 = series[0].t;
                    const tLast = series[series.length - 1].t || t0 + 1;
                    const width = 600;
                    const height = 140;
                    const currents = series.map((p) => Math.abs(p.currentA));
                    const minY = 0;
                    const maxY = Math.max(...currents, 1);
                    const path = series
                      .map((p, i) => {
                        const x = ((p.t - t0) / (tLast - t0 || 1)) * (width - 50);
                        const normY = (Math.abs(p.currentA) - minY) / (maxY - minY || 1);
                        const y = height - 20 - normY * (height - 40);
                        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
                      })
                      .join(' ');
                    return (
                      <>
                        <line x1={0} y1={height - 20} x2={width - 40} y2={height - 20} stroke="#4b5563" />
                        <line x1={0} y1={0} x2={0} y2={height - 20} stroke="#4b5563" />
                        {Array.from({ length: 6 }).map((_, i) => {
                          const frac = i / 5;
                          const tVal = t0 + (tLast - t0) * frac;
                          const x = ((tVal - t0) / (tLast - t0 || 1)) * (width - 50);
                          const y = height - 20;
                          return (
                            <g key={`i-x-${i}`}>
                              <line x1={x} y1={y} x2={x} y2={y + 4} stroke="#6b7280" />
                              <text x={x} y={y + 12} fill="#6b7280" fontSize={8} textAnchor="middle">
                                {tVal.toFixed(0)}
                              </text>
                            </g>
                          );
                        })}
                        {Array.from({ length: 5 }).map((_, i) => {
                          const frac = i / 4;
                          const v = minY + (maxY - minY) * frac;
                          const normY = (v - minY) / (maxY - minY || 1);
                          const y = height - 20 - normY * (height - 40);
                          return (
                            <g key={`i-y-${i}`}>
                              <line x1={-3} y1={y} x2={0} y2={y} stroke="#6b7280" />
                              <text x={-5} y={y + 3} fill="#6b7280" fontSize={8} textAnchor="end">
                                {v.toFixed(0)}
                              </text>
                            </g>
                          );
                        })}
                        <path d={path} stroke="#f97316" strokeWidth={2} fill="none" />
                        <text x={(width - 40) / 2} y={height - 4} fill="#9ca3af" fontSize={10}>
                          Time (s)
                        </text>
                        <text x={-40} y={10} fill="#9ca3af" fontSize={10}>
                          Current (A)
                        </text>
                      </>
                    );
                  })()}
                </g>
              </svg>

              <svg className="graph-svg">
                <g transform="translate(40,10)">
                  {(() => {
                    const series = localSim.history;
                    if (!series.length) return null;
                    const t0 = series[0].t;
                    const tLast = series[series.length - 1].t || t0 + 1;
                    const width = 600;
                    const height = 140;
                    const healths = series.map((p) => p.electrodeHealth * 100);
                    const minY = 0;
                    const maxY = 100;
                    const path = series
                      .map((p, i) => {
                        const x = ((p.t - t0) / (tLast - t0 || 1)) * (width - 50);
                        const normY = ((p.electrodeHealth * 100) - minY) / (maxY - minY || 1);
                        const y = height - 20 - normY * (height - 40);
                        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
                      })
                      .join(' ');
                    return (
                      <>
                        <line x1={0} y1={height - 20} x2={width - 40} y2={height - 20} stroke="#4b5563" />
                        <line x1={0} y1={0} x2={0} y2={height - 20} stroke="#4b5563" />
                        {Array.from({ length: 6 }).map((_, i) => {
                          const frac = i / 5;
                          const tVal = t0 + (tLast - t0) * frac;
                          const x = ((tVal - t0) / (tLast - t0 || 1)) * (width - 50);
                          const y = height - 20;
                          return (
                            <g key={`h-x-${i}`}>
                              <line x1={x} y1={y} x2={x} y2={y + 4} stroke="#6b7280" />
                              <text x={x} y={y + 12} fill="#6b7280" fontSize={8} textAnchor="middle">
                                {tVal.toFixed(0)}
                              </text>
                            </g>
                          );
                        })}
                        {Array.from({ length: 5 }).map((_, i) => {
                          const frac = i / 4;
                          const v = minY + (maxY - minY) * frac;
                          const normY = (v - minY) / (maxY - minY || 1);
                          const y = height - 20 - normY * (height - 40);
                          return (
                            <g key={`h-y-${i}`}>
                              <line x1={-3} y1={y} x2={0} y2={y} stroke="#6b7280" />
                              <text x={-5} y={y + 3} fill="#6b7280" fontSize={8} textAnchor="end">
                                {v.toFixed(0)}
                              </text>
                            </g>
                          );
                        })}
                        <path d={path} stroke="#a855f7" strokeWidth={2} fill="none" />
                        <text x={(width - 40) / 2} y={height - 4} fill="#9ca3af" fontSize={10}>
                          Time (s)
                        </text>
                        <text x={-60} y={10} fill="#9ca3af" fontSize={10}>
                          Electrode health (%)
                        </text>
                      </>
                    );
                  })()}
                </g>
              </svg>
            </div>
          </div>
        </div>
      )}

      {showReportModal && experiment && (
        <div
          className="intro-modal-backdrop"
          onClick={() => {
            setShowReportModal(false);
          }}
        >
          <div
            className="intro-modal"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <h2>Experiment report preview</h2>
            <p className="intro-section-label">Summary</p>
            <ul>
              <li>Start: {new Date(experiment.startedAt).toLocaleString()}</li>
              {experiment.endedAt && <li>End: {new Date(experiment.endedAt).toLocaleString()}</li>}
              <li>NaOH feed: {experiment.initialNaohKg.toFixed(3)} kg</li>
              <li>Voltage: {experiment.initialVoltageV.toFixed(2)} V</li>
              <li>Power target: {experiment.initialPowerKW.toFixed(2)} kW</li>
              <li>Initial current (approx): {experiment.initialCurrentA.toFixed(0)} A</li>
              <li>
                Outcome:{' '}
                {experiment.failed
                  ? `FAILED – ${experiment.failureReason ?? 'model safety limits exceeded'}`
                  : 'Completed without triggering model failure'}
              </li>
            </ul>
            <p className="intro-section-label">Data included in PDF</p>
            <ul>
              <li>Purpose, equipment, reagents, and principles of the experiment</li>
              <li>Detailed initial conditions and run time</li>
              <li>Sampled table of Na and H₂ production, current, and power vs time</li>
              <li>Failure analysis with comparison to expected reaction time (if failure occurred)</li>
            </ul>
            <button className="intro-primary-button" onClick={handleDownloadReport}>
              Download PDF report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

