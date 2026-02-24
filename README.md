## Sodium Production MVP (DWSIM + FreeCAD + Python)

**Goal**: provide a minimal but end‑to‑end scaffold that links:
- **Python** – central logic and orchestration
- **DWSIM** – thermodynamics and process simulation
- **FreeCAD** – 3D representation of the electrolysis cell

### Files

- `sodium_logic.py` – core Faraday‑based sodium production and simple finance math.
- `dwsim_interface.py` – small bridge to DWSIM Automation (falls back to dry‑run).
- `freecad_interface.py` – small bridge to FreeCAD (falls back to dry‑run).
- `process_mvp.py` – orchestrator that ties everything together.
- `requirements.txt` – Python package dependencies.

### Setup

1. **Install Python dependencies** (from this folder):

   ```bash
   pip install -r requirements.txt
   ```

2. **Prepare DWSIM flowsheet** (optional but recommended):

   - In DWSIM, create a simple flowsheet where molten salt enters a **Conversion Reactor**
     and produces sodium and by‑products.
   - Save it as `process.dwxml` in this folder.
   - When you are ready to use Automation, update `DWSIMConfig` in `dwsim_interface.py`
     with the correct `dwsim_bin_path` and replace the TODO comments with real calls.

3. **FreeCAD**:

   - Install FreeCAD and verify that its Python console can run:

     ```python
     import Part
     box = Part.makeBox(10, 10, 10)
     Part.show(box)
     ```

   - If you run `process_mvp.py` **inside** FreeCAD's Python environment, the 3D
     model will be created as a document and saved as `sodium_cell_mvp.FCStd`.
   - If FreeCAD modules are not importable, the script will simply print what it
     would have modelled (no crash).

### Running the MVP

From a normal terminal in this folder:

```bash
python process_mvp.py
```

You should see:
- the calculated sodium production (kg)
- a basic revenue/cost/margin calculation
- either a note that FreeCAD/DWSIM ran in dry‑run mode, or confirmation that
  a 3D cell model / Automation call was made.

From here you can:
- plug real DWSIM variables into `DWSIMBridge.run_electrolysis`
- enrich the 3D model in `FreeCADBridge.build_simple_cell`
- wrap `run_mvp` in a PyQt6 GUI if desired.

