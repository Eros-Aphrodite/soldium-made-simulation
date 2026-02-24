"""Thin DWSIM bridge for the MVP sodium electrolysis simulation.

This module is written so that it runs even when DWSIM/.NET is not available.
In that case it falls back to a "dry-run" mode which simply echoes inputs and
returns simple calculated values based on the core sodium logic.

Once DWSIM Automation is configured on your machine you can:
- point ``dwsim_bin_path`` to the folder that contains DWSIM's .NET assemblies
- replace the TODO blocks with real Automation2 calls (load flowsheet,
  set variables, run, and read back results).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

from sodium_logic import calculate_sodium_production

try:
    import clr  # type: ignore[import]
except ImportError:  # pragma: no cover - environment without .NET
    clr = None  # type: ignore[assignment]


@dataclass
class DWSIMConfig:
    """Configuration for locating and running a DWSIM flowsheet."""

    flowsheet_path: Path = Path("process.dwxml")
    dwsim_bin_path: Optional[Path] = None

    # Optional names for key objects in your flowsheet. Adjust these when you
    # wire in real Automation so the bridge can find the right units.
    electrolyzer_name: str = "Electrolyzer"
    sodium_splitter_name: str = "NaSplitter"
    temperature_variable_name: str = "Electrolyzer_T"


class DWSIMBridge:
    """Minimal wrapper around DWSIM Automation or a dry-run stub."""

    def __init__(self, config: Optional[DWSIMConfig] = None) -> None:
        self.config = config or DWSIMConfig()
        self._automation = None
        self._flowsheet = None

        # Try to attach to DWSIM Automation if pythonnet and paths are available.
        if clr is not None and self.config.dwsim_bin_path is not None:
            self._attach_to_dwsim()
        else:
            # Safe to run without DWSIM; we just emit text and use pure math.
            print("DWSIMBridge: running in dry-run mode (no Automation attached).")

    def _attach_to_dwsim(self) -> None:
        """Attempt to import and initialise DWSIM's Automation interface."""
        from sys import path as sys_path

        bin_path = Path(self.config.dwsim_bin_path)
        bin_path_str = str(bin_path)
        if bin_path_str not in sys_path:
            sys_path.append(bin_path_str)

        # Load by full path so .NET can find the DLL (AddReference by name often fails)
        dll_name = "DWSIM.Automation.dll"
        dll_path = bin_path / dll_name
        if not dll_path.exists():
            # Some installs use a subfolder or different name
            for candidate in [bin_path / dll_name, bin_path.parent / "bin" / dll_name]:
                if candidate.exists():
                    dll_path = candidate
                    break
            else:
                print(
                    f"DWSIMBridge: {dll_name} not found in {bin_path}. "
                    "Set dwsim_bin_path to the folder that contains DWSIM.Automation.dll."
                )
                return

        try:
            clr.AddReference(str(dll_path.resolve()))  # type: ignore[union-attr]
            from DWSIM.Automation import Automation2  # type: ignore[import]
        except Exception as exc:  # pragma: no cover - depends on local install
            print(f"Failed to attach to DWSIM Automation, staying in dry-run mode: {exc}")
            return

        self._automation = Automation2()
        try:
            self._flowsheet = self._automation.LoadFlowsheet(str(self.config.flowsheet_path))
            print(f"DWSIMBridge: attached to DWSIM Automation and loaded {self.config.flowsheet_path}.")
        except Exception as exc:  # pragma: no cover
            print(f"DWSIMBridge: Automation attached but failed to load flowsheet: {exc}")
            self._flowsheet = None

    # --------------------------------------------------------------------- #
    # Public API
    # --------------------------------------------------------------------- #
    def get_electrolyzer_temperature(self, default_temp_c: float = 600.0) -> float:
        """
        Try to read the electrolyzer temperature from the flowsheet.

        In dry-run mode or if any error occurs, return `default_temp_c`.
        """
        if self._flowsheet is None:
            return default_temp_c

        try:  # pragma: no cover - depends on real flowsheet object structure
            # NOTE: The exact API here depends on your DWSIM version and flowsheet.
            # The example below is indicative only and may need adjustment:
            #   unit = self._flowsheet.SimulationObjects[self.config.electrolyzer_name]
            #   return float(unit.Temperature) - 273.15  # assume K to °C
            unit = self._flowsheet.SimulationObjects[self.config.electrolyzer_name]
            temp_k = float(unit.GetPropertyValue("Temperature"))  # placeholder call
            return temp_k - 273.15
        except Exception as exc:
            print(f"DWSIMBridge: failed to read electrolyzer temperature, using default: {exc}")
            return default_temp_c

    def set_sodium_loss_splits(
        self,
        f_collected: float,
        f_recombined: float,
        f_evap: float,
    ) -> None:
        """
        Optionally inform a Splitter or equivalent object about Na split fractions.

        In dry-run mode this does nothing. When Automation is configured, adjust
        this logic to match your splitter/stream naming.
        """
        if self._flowsheet is None:
            return

        try:  # pragma: no cover - depends on real flowsheet object structure
            splitter = self._flowsheet.SimulationObjects[self.config.sodium_splitter_name]
            # Placeholder API; replace with real property names or methods:
            splitter.SetSplitFraction(0, f_collected)
            splitter.SetSplitFraction(1, f_recombined)
            splitter.SetSplitFraction(2, f_evap)
        except Exception as exc:
            print(f"DWSIMBridge: failed to set sodium loss splits: {exc}")

    def run_electrolysis(
        self,
        current_a: float,
        hours: float,
        efficiency: float = 0.90,
    ) -> Dict[str, Any]:
        """
        Run (or emulate) the electrolysis flowsheet and return key results.

        For the MVP we expose:
        - sodium_mass_kg: calculated from Faraday's law
        - current_a, hours, efficiency: echo of the operating point
        - mode: "dry-run" or "dwsim"
        """
        sodium_mass_kg = calculate_sodium_production(current_a, hours, efficiency)

        if self._automation is None or self._flowsheet is None:
            # No live DWSIM – return a self-consistent mathematical result.
            return {
                "mode": "dry-run",
                "current_a": current_a,
                "hours": hours,
                "efficiency": efficiency,
                "sodium_mass_kg": sodium_mass_kg,
            }

        # When Automation is available, try to push the operating point into
        # the flowsheet and run it. The exact variable and object names must
        # match your DWSIM file; adjust as needed.
        fs = self._flowsheet
        extra: Dict[str, Any] = {}

        try:  # pragma: no cover - depends on real flowsheet details
            # Example: set global flowsheet variables if you created them
            # in DWSIM with these names.
            try:
                fs.SetFlowsheetVariable("Current_A", current_a)
                fs.SetFlowsheetVariable("Hours", hours)
            except Exception:
                # If these variables don't exist, ignore – user can wire them later.
                pass

            # Run the simulation
            fs.Run()

            # Read electrolyzer temperature (°C)
            temp_c = self.get_electrolyzer_temperature()
            extra["electrolyzer_temp_c"] = temp_c

            # Optionally, try to read sodium mass flow from a product stream.
            # Replace "NaProduct" and property access with your real names.
            try:
                na_stream = fs.MaterialStreams["NaProduct"]
                # Placeholder: total mass flow kg/h; adjust method as needed.
                total_mass_flow_kg_per_h = float(
                    na_stream.GetMassFlow()  # type: ignore[attr-defined]
                )
                extra["na_mass_flow_kg_per_h"] = total_mass_flow_kg_per_h
            except Exception:
                pass
        except Exception as exc:
            print(f"DWSIMBridge: error while running Automation flowsheet: {exc}")

        result: Dict[str, Any] = {
            "mode": "dwsim",
            "current_a": current_a,
            "hours": hours,
            "efficiency": efficiency,
            "sodium_mass_kg": sodium_mass_kg,
        }
        result.update(extra)
        return result


if __name__ == "__main__":
    # Tiny manual smoke test
    bridge = DWSIMBridge()
    res = bridge.run_electrolysis(current_a=10_000.0, hours=24.0)
    print(res)

