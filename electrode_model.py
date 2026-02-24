"""Electrode life and performance model for the sodium cell.

Tracks cumulative amp-hours and maps remaining life to an effective cell
resistance multiplier and an efficiency penalty.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ElectrodeConfig:
    """Configuration parameters for electrode wear and performance."""

    amp_hours_limit: float = 1.0e6  # total amp-hours at which electrode is "spent"
    min_life_fraction_for_operation: float = 0.1  # below this, force maintenance

    # How resistance grows as electrodes wear (simple linear model).
    resistance_multiplier_at_end_of_life: float = 2.0

    # How faradaic efficiency drops with wear (simple linear model).
    efficiency_at_new: float = 0.90
    efficiency_at_end_of_life: float = 0.75


@dataclass
class ElectrodeState:
    """Dynamic state of an electrode set in the cell."""

    cumulative_amp_hours: float = 0.0
    in_maintenance: bool = False

    def remaining_life_fraction(self, cfg: ElectrodeConfig) -> float:
        if cfg.amp_hours_limit <= 0:
            return 1.0
        frac = 1.0 - (self.cumulative_amp_hours / cfg.amp_hours_limit)
        return max(0.0, min(1.0, frac))

    def effective_resistance_multiplier(self, cfg: ElectrodeConfig) -> float:
        """Map remaining life to a resistance multiplier."""
        life = self.remaining_life_fraction(cfg)
        # Linear interpolation between 1.0 and resistance_multiplier_at_end_of_life
        end_mult = cfg.resistance_multiplier_at_end_of_life
        return 1.0 + (1.0 - life) * (end_mult - 1.0)

    def effective_efficiency(self, cfg: ElectrodeConfig) -> float:
        """Map remaining life to faradaic efficiency."""
        life = self.remaining_life_fraction(cfg)
        eff_new = cfg.efficiency_at_new
        eff_end = cfg.efficiency_at_end_of_life
        return eff_end + (eff_new - eff_end) * life

    def step(self, cfg: ElectrodeConfig, current_a: float, dt_hours: float) -> None:
        """Advance electrode usage by dt_hours at current_a."""
        if self.in_maintenance or dt_hours <= 0 or current_a <= 0:
            return
        self.cumulative_amp_hours += current_a * dt_hours

        # If life is below minimum fraction, mark cell as needing maintenance.
        if self.remaining_life_fraction(cfg) <= cfg.min_life_fraction_for_operation:
            self.in_maintenance = True

    def reset_after_maintenance(self) -> None:
        """Simulate electrode replacement."""
        self.cumulative_amp_hours = 0.0
        self.in_maintenance = False


if __name__ == "__main__":
    cfg = ElectrodeConfig()
    st = ElectrodeState()
    st.step(cfg, current_a=50_000.0, dt_hours=100.0)
    print("Remaining life:", st.remaining_life_fraction(cfg))
    print("Resistance multiplier:", st.effective_resistance_multiplier(cfg))
    print("Effective efficiency:", st.effective_efficiency(cfg))

