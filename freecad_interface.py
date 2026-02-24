"""FreeCAD bridge for visualising the sodium cell in 3D (MVP).

This module is written to be safe to import even when FreeCAD is not installed.
If FreeCAD cannot be imported it will fall back to a no-op implementation that
only prints what it *would* have done.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional


try:  # pragma: no cover - depends on local environment
    import FreeCAD  # type: ignore[import]
    import Part  # type: ignore[import]
except ImportError:  # pragma: no cover
    FreeCAD = None  # type: ignore[assignment]
    Part = None  # type: ignore[assignment]


@dataclass
class FreeCADConfig:
    """Basic configuration for working with the cell model.

    - `model_path` is the main electrolyzer model you create in FreeCAD,
      e.g. a detailed 3D cell saved as ``electrolyzer.FCStd`` in your
      project folder.
    - `output_path` is where an automatically generated/simple model
      would be saved if we fall back to the old behaviour.
    """

    base_dir: Path = Path(__file__).resolve().parent
    model_path: Path = base_dir / "electrolyzer.FCStd"
    output_path: Path = base_dir / "sodium_cell_mvp.FCStd"
    doc_name: str = "SodiumCellMVP"


class FreeCADBridge:
    """Very small abstraction over FreeCAD for the MVP."""

    def __init__(self, config: Optional[FreeCADConfig] = None) -> None:
        self.config = config or FreeCADConfig()

    def update_from_simulation(self, values: dict[str, Any]) -> None:
        """
        Open the model (or plant layout) and push simulation values into Params.

        Expected aliases (create them in FreeCAD spreadsheet named 'Params'):
        - Na_cum_kg, NaOH_cum_kg, Cl2_cum_kg, H2_cum_kg
        - I_a, V_v, P_kw
        """
        if FreeCAD is None:
            return

        try:  # pragma: no cover
            # Prefer the current active document when running inside FreeCAD.
            doc = getattr(FreeCAD, "ActiveDocument", None)
            if doc is None and self.config.model_path.exists():
                doc = FreeCAD.open(str(self.config.model_path))  # type: ignore[call-arg]
            if doc is None:
                return

            # In your current model the spreadsheet object is labelled "Params"
            # and the numeric cells we care about are fixed in column B:
            # B4..B10. We write directly to those cells for robustness.
            sheet = None
            for obj in getattr(doc, "Objects", []):
                if getattr(obj, "Label", "") == "Params":
                    sheet = obj
                    break
            if sheet is None:
                return

            changed = False
            mapping = [
                ("B4", "cumulative_na_kg"),
                ("B5", "cumulative_naoh_kg"),
                ("B6", "cumulative_cl2_kg"),
                ("B7", "cumulative_h2_kg"),
                ("B8", "actual_current_a"),
                ("B9", "cell_voltage_v"),
                ("B10", "dc_power_kw"),
            ]
            for cell, key in mapping:
                if key in values and values[key] is not None:
                    try:
                        sheet.set(cell, str(values[key]))
                        changed = True
                    except Exception:
                        pass

            if changed:
                doc.recompute()
        except Exception:
            return

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def build_simple_cell(self, sodium_mass_kg: float) -> None:
        """
        Build a very simple geometric representation of the electrolysis cell.

        MVP design:
        - one rectangular "cell" body
        - its size loosely scales with sodium production rate so you can see
          a geometric response when you change process conditions.
        """
        if FreeCAD is None or Part is None:
            print(
                "FreeCADBridge: FreeCAD not available in this Python environment. "
                "Skipping 3D model build."
            )
            print(
                f"(Would have opened or built a cell model under {self.config.base_dir} "
                f"for {sodium_mass_kg:.2f} kg Na/day.)"
            )
            return

        # Preferred path: open the detailed electrolyzer model the user created.
        try:  # type: ignore[pragma]
            doc = getattr(FreeCAD, "ActiveDocument", None)
            if doc is None and self.config.model_path.exists():
                doc = FreeCAD.open(str(self.config.model_path))  # type: ignore[call-arg]

            if doc is not None:
                print(f"FreeCADBridge: opened existing model {self.config.model_path}")
                # Keep backwards-compatible single-cell update for Na_cum_kg.
                try:
                    for obj in getattr(doc, "Objects", []):
                        if getattr(obj, "Label", "") == "Params":
                            obj.set("B4", str(sodium_mass_kg))
                            doc.recompute()
                            break
                except Exception:
                    pass
            else:
                # Fallback: create a simple parametric box if no detailed model exists yet.
                print(
                    f"FreeCADBridge: no detailed model at {self.config.model_path}, "
                    "creating a simple box instead."
                )
                # Heuristic scale: 1 kg/day -> 10 mm cell side
                base_side_mm = max(10.0, sodium_mass_kg * 10.0)
                height_mm = base_side_mm * 1.5

                doc = FreeCAD.newDocument(self.config.doc_name)  # type: ignore[call-arg]
                box = Part.makeBox(base_side_mm, base_side_mm, height_mm)  # type: ignore[call-arg]
                Part.show(box)  # type: ignore[call-arg]
                doc.saveAs(str(self.config.output_path))  # type: ignore[call-arg]
                print(f"FreeCADBridge: saved MVP cell model to {self.config.output_path}")
        except Exception as exc:  # pragma: no cover - FreeCAD-specific runtime issues
            print(f"FreeCADBridge: error while opening/creating model: {exc}")


if __name__ == "__main__":
    bridge = FreeCADBridge()
    bridge.build_simple_cell(sodium_mass_kg=100.0)

