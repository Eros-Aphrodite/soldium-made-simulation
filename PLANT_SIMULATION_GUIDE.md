## Sodium Plant Digital Twin – Full Simulation Guide

This guide describes how to build a realistic sodium production simulator using:

- **Python** – central control, constraints, and long‑term plant behaviour
- **DWSIM** – thermodynamics, reactions, and unit operations
- **FreeCAD** – 3D representation of equipment and plant layout

It assumes you already have the MVP code in this folder (`sodium_logic.py`, `dwsim_interface.py`, `freecad_interface.py`, `process_mvp.py`).

---

## 1. High‑Level Architecture

- **Python (central nervous system)**
  - Owns the full plant state: operating point, equipment health, electrode life, on/off states.
  - Calls into DWSIM via Automation (`pythonnet`) to:
    - Load the master flowsheet (`process.dwxml`).
    - Push setpoints (feeds, temperatures, current / power).
    - Run the simulation and pull resulting stream properties and compositions.
  - Enforces physical and operational constraints:
    - Current density limits, temperature windows, voltage ranges.
    - Solid feed limits for NaCl and NaOH.
    - Equipment trips and maintenance logic.

- **DWSIM (process brain)**
  - Holds the **process flowsheet**:
    - Solid feed handling for NaCl and NaOH.
    - Pre‑treatment / melting / dissolution.
    - Electrolyzer with reactions and heat balance.
    - Downstream gas handling (H₂ and Cl₂ trains).
    - Liquid metal and brine recirculation, cooling, and product handling.
  - Provides rigorous mass and energy balances and phase equilibrium.

- **FreeCAD (body)**
  - Holds 3D models of:
    - Electrolyzers
    - Transformer/rectifier and busbars
    - Gas scrubbers, compressors, vessels
  - Reads process state from Python and:
    - Updates colours, annotations, and dimensions to reflect the live operating point.
    - Allows a user to “walk around” a reasonably realistic plant model.

---

## 2. Define the Real Plant Reference

Before implementing anything complex, define the **real plant** you’re emulating.

- **Collect core design data:**
  - **Electrolyzer:**
    - Electrode material (graphite or other), geometry, and arrangement.
    - Electrode area and spacing (needed for current density).
    - Nominal operating current and voltage; typical cell voltage vs. current data.
    - Normal temperature window (min / max) and typical setpoint.
  - **Feeds (solids):**
    - NaCl purity, grain size, moisture.
    - NaOH purity, form (flakes, pellets), moisture.
    - Design feed rates (kg/h or t/day).
  - **Products and by‑products:**
    - Target sodium production rate (kg/h or t/day).
    - Cl₂ and H₂ typical flows per kg Na (stoichiometric and expected deviations).
  - **Electrical system:**
    - Transformer rating (kVA), steps, and rectifier efficiency.
    - Maximum DC bus current and voltage.

- **Define operating envelope:**
  - Min/max current and cell voltage.
  - Allowed current density range (A/m²).
  - Allowed brine composition range and temperature limits.

Keep these data in a separate document or JSON/YAML file so Python can read them as “design constraints.”

---

## 3. DWSIM Core: Electrolyzer and Immediate Surroundings

### 3.1 Create a dedicated electrolyzer flowsheet

In DWSIM:

1. Create a new simulation.
2. Add streams:
   - **Feeds:**
     - `NaCl_solid_in` – solid or very concentrated solution (depending on model choice).
     - `NaOH_solid_in` – solid or concentrated solution.
     - An optional **utility/energy stream** to represent electrical power input.
   - **Products:**
     - `Na_liquid` (liquid sodium or mixture).
     - `Cl2_gas` and `H2_gas` (and any side products like O₂ or water vapour if you include them).
3. Add a **reactor unit** to represent the electrolyzer:
   - Start with a **Conversion Reactor**.
   - Define reactions, at minimum:
     - \( 2\text{NaCl} \rightarrow 2\text{Na} + \text{Cl}_2 \)
   - If using NaOH route as well, add additional reactions that properly produce Na and gases.
4. Choose a **thermodynamic package**:
   - For initial development, you may start with a simple model (e.g. ideal or activity‑coefficient‑based).
   - Later, upgrade to an electrolyte‑capable model if available and appropriate.

### 3.2 Link to Faraday‑based production

Your Python `sodium_logic.calculate_sodium_production` provides a **theoretical production** from Faraday’s law:

- Use Python to compute the target sodium production for a given:
  - Current (A)
  - Time (h)
  - Cell efficiency
- In DWSIM, connect this to:
  - Reaction conversion fractions, OR
  - A specification that adjusts feed / reaction extent so that the DWSIM sodium flow matches the theoretical value over the selected time window.

This ensures that your DWSIM reactions are consistent with the electrochemistry.

---

## 4. Electrical & Operational Constraints

You want realistic behaviour of the **transformer, rectifier, and electrolyzer** under constraints.

### 4.1 Electrical model in Python

Implement a simple electrical model in Python that represents:

- **Transformer / rectifier:**
  - Inputs:
    - Supply voltage and frequency.
    - Tap settings (if modelled).
    - Desired DC current setpoint.
  - Outputs:
    - DC cell voltage estimate, using:
      - \( V_{\text{cell}} = V_{\text{base}} + R_{\text{cell}} \times I \)
    - DC power:
      - \( P = I \times V_{\text{cell}} \times \eta_{\text{rectifier}} \)

- **Constraints:**
  - Maximum transformer kVA and maximum current:
    - If `I` requested exceeds rating, cap it and mark a constraint hit.
  - Acceptable cell voltage window:
    - If computed voltage exceeds allowed range, either:
      - Reduce current, or
      - Mark an abnormal operating state.

This model remains in **Python** and is not strictly required in DWSIM. DWSIM just receives the resulting power, temperatures, and feed conditions.

### 4.2 Feeding power into DWSIM

- Use the **power** from the electrical model as:
  - A heat duty in the electrolyzer, or
  - A temperature setpoint with a connected heater/cooler.
- Through Automation:
  - Set energy or temperature specifications on the electrolyzer unit for each timestep.
  - Run the flowsheet and read the resulting stream conditions.

---

## 5. Electrode Life Cycle and Constraints

Graphite electrode life is critical for realism.

### 5.1 Track electrode usage in Python

Use an amp‑hour‑based life model:

- For each electrode (or for the cell as a whole), track:
  - `cumulative_amp_hours += I * dt_hours`
- Define a design limit:
  - `amp_hours_limit` (from vendor or experience).
- Define remaining life fraction:
  - `remaining_life = 1 - cumulative_amp_hours / amp_hours_limit`

### 5.2 Link wear to performance

As `remaining_life` drops:

- Increase effective cell resistance:
  - \( R_{\text{cell}} = R_{\text{new}} \times f(\text{remaining_life}) \)
- This increases required voltage for the same current.
- Optionally change efficiency (more side reactions, more heat losses).

### 5.3 Maintenance and failure logic

- When `remaining_life` goes below a threshold:
  - Force the cell into an OFF / MAINTENANCE state.
  - Simulate downtime:
    - For a certain number of hours, the cell is not allowed to operate.
  - After maintenance:
    - Reset `cumulative_amp_hours` and resistance to “as new.”

All of this logic lives in Python and is applied **before** each DWSIM run.

---

## 6. Solid NaCl and NaOH Handling

You want to explicitly include **solid feeds**.

### 6.1 Upstream solids in DWSIM

In DWSIM:

- Add unit ops for:
  - Solid feeders for NaCl and NaOH.
  - Melters / dissolvers:
    - Convert solids to molten salt or brine.
    - Adjust temperature and composition.
  - Filters or separators if you want to include impurities.

- The outlet of this section becomes the **inlet to the electrolyzer**.

### 6.2 Control by Python

In Python:

- Keep track of:
  - Solid feed setpoints (kg/h of NaCl and NaOH).
  - Inventory of solids (optional, if you want warehouse realism).
- Enforce:
  - That requested current doesn’t exceed what feed rates can support.
  - If feed is insufficient, reduce current or conversion, and log a constraint violation.

---

## 7. Hydrogen and Chlorine Gas Handling

Realistic handling of H₂ and Cl₂ is important for safety and realism.

### 7.1 Gas handling flowsheet in DWSIM

From the electrolyzer outlet streams in DWSIM:

- Route `Cl2_gas` to:
  - Gas cooler
  - Scrubber (e.g. with caustic solution) if desired
  - Compressor
  - Storage tank or vent header

- Route `H2_gas` to:
  - Gas cooler
  - Burner, fuel cell, or vent header

Apply appropriate thermodynamic models for the gas mixtures and design the unit specs.

### 7.2 Constraints in Python

Via Automation, Python periodically checks:

- **Cl₂ storage pressure / inventory:**
  - If tank pressure exceeds a limit:
    - Reduce cell current (less Cl₂ production), or
    - Simulate emergency vent with appropriate flags.

- **H₂ concentration in vent streams:**
  - If vent mixture composition exceeds flammability limits:
    - Trigger alarms and enforce automatic changes (e.g., reduce current, increase purge).

These checks are performed at each simulation step and may alter setpoints before the next DWSIM run.

---

## 8. Python Plant Model and Simulation Loop

Bring everything together in Python by modelling each device explicitly.

### 8.1 Device classes

Create high‑level classes such as:

- `Transformer`
- `Rectifier`
- `Electrolyzer`
- `SolidFeeder`
- `GasScrubber`
- `StorageTank`
- `Plant` (or `SodiumPlant`)

Each class should:

- Hold its own configuration and dynamic state (on/off, loading, temperatures, remaining life).
- Expose a `step(dt)` method that:
  - Updates its internals based on current setpoints.
  - Communicates with DWSIM (when applicable).

### 8.2 Central simulation loop

In a Python driver script:

- Initialize the `Plant` and all devices.
- For each timestep \( dt \) (e.g. 1 s, 10 s, or 1 min):
  - Compute or read operator setpoints (current, feed rates, etc.).
  - Apply constraints (current density, temperature, gas limitations).
  - Call `plant.step(dt)`:
    - The plant object:
      - Updates electrical model.
      - Calls DWSIM Automation to run the flowsheet at the new conditions.
      - Updates electrode life and all equipment statuses.
  - Log key outputs (Na production, gas flows, equipment status).

This loop is where the digital twin “lives,” and where a GUI or external control interface would connect.

---

## 9. FreeCAD Integration for Realistic Experience

### 9.1 Create detailed equipment models

In FreeCAD:

- Build parametric models of:
  - Electrolyzer (cell body, electrodes, busbars, insulation).
  - Transformers and rectifiers.
  - Gas scrubbers, vessels, and piping.

Use sketches and constraints so that dimensions can be driven by parameters (e.g. electrode area, cell spacing).

### 9.2 Connect Python state to FreeCAD

Extend your existing `freecad_interface.py` so that it can:

- Open or create plant documents (`FCStd`).
- Modify:
  - Parameter values (e.g. electrode length, gap).
  - Object colours and transparency (e.g. show hot equipment in red).
  - Text annotations showing live values (current, temperature, remaining electrode life).

Run the main plant loop either:

- **Inside FreeCAD** (using its Python console), or
- With **FreeCAD Remote** / a scripted FreeCAD session that is driven by your external Python controller.

---

## 10. Validation and Calibration

To get as close as possible to real production:

1. **Compare the model to plant or literature data:**
   - Sodium production vs. current and time.
   - Energy per tonne Na.
   - Gas production rates and compositions.
   - Electrode life vs. amp‑hours or operating hours.
2. **Tune model parameters:**
   - Adjust:
     - Heat loss coefficients.
     - Effective cell resistance and overpotentials.
     - Electrode wear constants.
3. **Iterate:**
   - Repeat simulation vs. data comparison.
   - Narrow discrepancies until they are within acceptable bounds for your use case (training, feasibility, design).

---

## 11. Roadmap from MVP to Full Plant Model

Starting from the existing MVP (`process_mvp.py` and related modules), a practical implementation sequence is:

1. **Electrolyzer DWSIM core**
   - Build and validate the electrolyzer and immediate streams in `process.dwxml`.
2. **Python–DWSIM Automation**
   - Implement real Automation code in `dwsim_interface.py` to:
     - Load `process.dwxml`.
     - Set current / power / feeds.
     - Run and retrieve sodium, Cl₂, and H₂ flows.
3. **Electrical and constraint layer**
   - Implement transformer/rectifier model and current density limits in Python.
4. **Electrode life model**
   - Track amp‑hours and adjust resistance and maintenance state.
5. **Solid feed and gas trains**
   - Add upstream solids handling and downstream gas handling units to DWSIM, controlled from Python.
6. **FreeCAD visualization**
   - Replace the simple MVP box with a parametric electrolyzer and plant layout, updating based on simulation state.
7. **Calibration**
   - Iterate until your simulation closely matches real or reference operation.

This path leads from a simple, mathematically correct MVP to a **high‑fidelity, plant‑like digital twin** that is close to real production experience.

