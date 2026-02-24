"""High-level plant model tying together electrical, electrodes, DWSIM, and FreeCAD.

This is a simplified "digital twin" core that runs a time-based simulation.
It is designed to work even when DWSIM and FreeCAD are not available, by
falling back to dry-run behaviour through the bridge modules.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Tuple

from dwsim_interface import DWSIMBridge, DWSIMConfig
from electrical_model import ElectricalConfig, ElectricalState, compute_electrical_state
from electrode_model import ElectrodeConfig, ElectrodeState
from freecad_interface import FreeCADBridge, FreeCADConfig
from sodium_logic import calculate_finances, calculate_sodium_production


@dataclass
class SodiumLossConfig:
    """Parameters controlling temperature-dependent sodium losses."""

    evap_loss_low_temp_fraction: float = 0.001
    evap_loss_mid_temp_fraction: float = 0.005
    evap_loss_high_temp_fraction: float = 0.02

    recombined_loss_fraction: float = 0.01

    low_temp_c: float = 500.0
    high_temp_c: float = 700.0


def sodium_loss_fractions(temp_c: float, cfg: SodiumLossConfig) -> Tuple[float, float, float]:
    """
    Compute (f_collected, f_recombined, f_evap) based on cell temperature.

    - f_recombined is taken as a small constant.
    - f_evap increases with temperature in a simple piecewise fashion.
    - Remaining fraction is collected sodium product.
    """
    if temp_c <= cfg.low_temp_c:
        f_evap = cfg.evap_loss_low_temp_fraction
    elif temp_c <= cfg.high_temp_c:
        f_evap = cfg.evap_loss_mid_temp_fraction
    else:
        f_evap = cfg.evap_loss_high_temp_fraction

    f_recombined = cfg.recombined_loss_fraction
    f_collected = max(0.0, 1.0 - f_recombined - f_evap)
    return f_collected, f_recombined, f_evap


@dataclass
class PlantConfig:
    """Top-level configuration for the plant."""

    electrical: ElectricalConfig = field(default_factory=ElectricalConfig)
    electrodes: ElectrodeConfig = field(default_factory=ElectrodeConfig)
    sodium_losses: SodiumLossConfig = field(default_factory=SodiumLossConfig)

    # Economic parameters for finance calculations
    power_cost_per_kwh: float = 0.12
    sodium_price_per_kg: float = 3.50


@dataclass
class PlantState:
    """Dynamic state of the plant."""

    time_hours: float = 0.0
    electrode_state: ElectrodeState = field(default_factory=ElectrodeState)
    cumulative_na_produced_kg: float = 0.0
    cumulative_revenue: float = 0.0
    cumulative_cost: float = 0.0


class SodiumPlant:
    """Central plant model class used by the main simulation."""

    def __init__(
        self,
        cfg: PlantConfig | None = None,
        dwsim_cfg: DWSIMConfig | None = None,
        freecad_cfg: FreeCADConfig | None = None,
    ) -> None:
        self.cfg = cfg or PlantConfig()
        self.state = PlantState()

        self.dwsim = DWSIMBridge(dwsim_cfg or DWSIMConfig())
        self.freecad = FreeCADBridge(freecad_cfg or FreeCADConfig())

    # ------------------------------------------------------------------ #
    # Core step logic
    # ------------------------------------------------------------------ #
    def step(self, requested_current_a: float, dt_hours: float) -> Dict[str, float]:
        """
        Advance the plant simulation by dt_hours at the requested current.

        Returns a dict of key values for logging/plotting.
        """
        if dt_hours <= 0:
            return {}

        # If in maintenance, skip production but advance time.
        if self.state.electrode_state.in_maintenance:
            self.state.time_hours += dt_hours
            return {
                "time_hours": self.state.time_hours,
                "status": "maintenance",
            }

        # 1) Electrical model with electrode-conditioned resistance
        resistance_multiplier = self.state.electrode_state.effective_resistance_multiplier(self.cfg.electrodes)
        effective_resistance = self.cfg.electrical.cell_resistance_ohm * resistance_multiplier

        elec_state: ElectricalState = compute_electrical_state(
            requested_current_a=requested_current_a,
            config=self.cfg.electrical,
            effective_cell_resistance_ohm=effective_resistance,
        )

        # 2) Electrode wear update
        self.state.electrode_state.step(self.cfg.electrodes, elec_state.actual_current_a, dt_hours)

        # 3) Faraday-based theoretical Na production (adjusted for electrode efficiency)
        eff = self.state.electrode_state.effective_efficiency(self.cfg.electrodes)
        na_theoretical_kg = calculate_sodium_production(
            amperes=elec_state.actual_current_a,
            hours=dt_hours,
            efficiency=eff,
        )

        # 4) Get an approximate cell temperature from DWSIM or assume a fixed value.
        # For now, we use a placeholder temperature until Automation is wired:
        cell_temp_c = 600.0

        f_collected, f_recombined, f_evap = sodium_loss_fractions(cell_temp_c, self.cfg.sodium_losses)
        na_collected_kg = na_theoretical_kg * f_collected
        na_recombined_kg = na_theoretical_kg * f_recombined
        na_evap_kg = na_theoretical_kg * f_evap

        # 5) Finance over this step
        # Power is DC power from the electrical model; assume hours=dt_hours
        revenue, cost, margin = calculate_finances(
            kg_produced=na_collected_kg,
            power_kw=elec_state.dc_power_kw,
            hours=dt_hours,
            electricity_cost_per_kwh=self.cfg.power_cost_per_kwh,
            sodium_price_per_kg=self.cfg.sodium_price_per_kg,
        )

        # 6) Cumulative updates
        self.state.time_hours += dt_hours
        self.state.cumulative_na_produced_kg += na_collected_kg
        self.state.cumulative_revenue += revenue
        self.state.cumulative_cost += cost

        # 7) Update FreeCAD for visualization (if available)
        self.freecad.build_simple_cell(sodium_mass_kg=self.state.cumulative_na_produced_kg)

        return {
            "time_hours": self.state.time_hours,
            "requested_current_a": requested_current_a,
            "actual_current_a": elec_state.actual_current_a,
            "cell_voltage_v": elec_state.cell_voltage_v,
            "dc_power_kw": elec_state.dc_power_kw,
            "ac_power_kw": elec_state.ac_power_kw,
            "constrained": float(elec_state.constrained),
            "na_theoretical_kg": na_theoretical_kg,
            "na_collected_kg": na_collected_kg,
            "na_recombined_kg": na_recombined_kg,
            "na_evap_kg": na_evap_kg,
            "step_revenue": revenue,
            "step_cost": cost,
            "step_margin": margin,
            "cumulative_na_kg": self.state.cumulative_na_produced_kg,
            "cumulative_revenue": self.state.cumulative_revenue,
            "cumulative_cost": self.state.cumulative_cost,
        }


if __name__ == "__main__":
    plant = SodiumPlant()
    for _ in range(24):
        result = plant.step(requested_current_a=10_000.0, dt_hours=1.0)
        print(result)

