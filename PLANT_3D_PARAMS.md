## Plant 3D parameters (FreeCAD + Python)

This file defines the **spreadsheet aliases** that Python will write into your FreeCAD models.

Create a spreadsheet named **`Params`** in each `.FCStd` file and set these aliases on the value cells.

Python will then update them automatically during `run_mvp()` / `process_mvp.py`.

---

## Electrolyzer model (`electrolyzer.FCStd`)

### Required aliases (written by Python)

- `Na_cum_kg` – cumulative sodium (kg)
- `NaOH_cum_kg` – cumulative sodium hydroxide (kg)
- `Cl2_cum_kg` – cumulative chlorine (kg)
- `H2_cum_kg` – cumulative hydrogen (kg)
- `I_a` – actual cell current (A)
- `V_v` – cell voltage (V)
- `P_kw` – DC power (kW)

### Suggested geometry-driving aliases (you control)

- `NaOH_L` – NaOH pocket length (mm)
- `NaOH_W` – NaOH pocket width (mm)
- `NaOH_H` – NaOH pocket height (mm)
- `Electrode_Gap_mm` – electrode gap (mm)
- `Body_D` – body diameter (mm)
- `Body_H` – body height (mm)

---

## Feeder model (`feeder.FCStd`) (future)

### Suggested aliases

- `NaCl_feed_kgph`
- `NaOH_feed_kgph`
- `Raw_purity_frac` (0–1)

---

## Scrubber / gas handling (`scrubber.FCStd`) (future)

### Suggested aliases

- `Cl2_cum_kg`
- `H2_cum_kg`
- `Cl2_flow_kgph`
- `H2_flow_kgph`

---

## Transformer / rectifier (`transformer.FCStd`) (future)

### Suggested aliases

- `I_a`
- `V_v`
- `P_kw`
- `Eff_rectifier` (0–1)

