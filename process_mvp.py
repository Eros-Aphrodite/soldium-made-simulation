"""End-to-end MVP orchestrator for the sodium production simulation.

This script uses the higher-level `SodiumPlant` model which ties together:
- core Faraday math
- electrical constraints
- electrode life model
- sodium loss fractions

Run it from a terminal:
    python process_mvp.py
"""

from __future__ import annotations

from dataclasses import dataclass

from plant_model import PlantConfig, SodiumPlant


@dataclass
class Scenario:
    """Simple scenario definition for a time-based run."""

    current_a: float = 10_000.0
    total_hours: float = 24.0
    dt_hours: float = 1.0


def run_mvp(scenario: Scenario | None = None) -> None:
    """Run a simple time-based MVP simulation and print results."""
    scenario = scenario or Scenario()

    plant = SodiumPlant(PlantConfig())

    steps = int(scenario.total_hours / scenario.dt_hours)
    print("=== Sodium Plant MVP Simulation ===")
    print(
        f"Requested current: {scenario.current_a:,.0f} A, "
        f"duration: {scenario.total_hours:.1f} h, "
        f"step: {scenario.dt_hours:.2f} h"
    )

    for i in range(steps):
        result = plant.step(
            requested_current_a=scenario.current_a,
            dt_hours=scenario.dt_hours,
        )
        if not result:
            continue

        print(
            f"t={result['time_hours']:.1f} h | "
            f"I={result['actual_current_a']:,.0f} A | "
            f"V={result['cell_voltage_v']:.2f} V | "
            f"Na step={result['na_collected_kg']:.3f} kg | "
            f"Na cum={result['cumulative_na_kg']:.2f} kg"
        )

    print("\n=== Summary ===")
    print(f"Total time:       {plant.state.time_hours:.1f} h")
    print(f"Total Na:         {plant.state.cumulative_na_produced_kg:,.2f} kg")
    print(f"Total revenue:    ${plant.state.cumulative_revenue:,.2f}")
    print(f"Total power cost: ${plant.state.cumulative_cost:,.2f}")


if __name__ == "__main__":
    run_mvp()

