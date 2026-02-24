"""Integration layer between the MATBG-SIB-Simulation project and this plant model.

This module provides a thin wrapper that:
- adds the MATBG-SIB-Simulation src folder to sys.path
- runs the CompleteDatasetGenerator to produce battery performance data
- extracts a few key metrics (capacity and voltage) for use in the plant model

We keep this as an on-demand helper so that the heavy MATBG simulation is only
run when explicitly requested (not on every plant step).
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any


# Path to the MATBG-SIB-Simulation src folder relative to this file
MATBG_SRC = (Path(__file__).resolve().parent / "MATBG-SIB-Simulation" / "src").resolve()


def _ensure_matbg_on_path() -> None:
    """Make sure the MATBG simulation code can be imported."""
    matbg_str = str(MATBG_SRC)
    if matbg_str not in sys.path:
        sys.path.append(matbg_str)


@dataclass
class BatteryPerformanceSummary:
    """Key MATBG-based Na-ion battery metrics for use in the plant model."""

    practical_capacity_mAh_g: float
    average_voltage_V: float
    energy_density_Wh_kg: float
    capacities_vs_c_rate: Dict[float, float]  # C-rate -> capacity (mAh/g)


def run_matbg_simulation(
    twist_angle_deg: float = 1.1,
    temperature_K: float = 298.15,
    output_dir: str | Path = "matbg_simulation_dataset_revised",
) -> BatteryPerformanceSummary:
    """
    Run the MATBG-SIB-Simulation generator once and return a compact summary.

    This calls CompleteDatasetGenerator.generate_complete_dataset(), which
    writes a full dataset to disk. We then extract a few headline metrics
    that are useful when choosing reasonable cell voltage / capacity values
    for the larger plant model.
    """
    _ensure_matbg_on_path()

    # Import lazily so normal plant runs don't require MATBG dependencies.
    from complete_dataset_generator_revised import CompleteDatasetGenerator  # type: ignore[import]

    generator = CompleteDatasetGenerator(
        twist_angle=twist_angle_deg,
        temperature=temperature_K,
        output_dir=str(output_dir),
    )
    sim_data: Dict[str, Any] = generator.generate_complete_dataset()

    electro = sim_data["electrochemical"]
    voltage_metrics = electro["voltage_metrics"]
    rate_data = electro["rate_data"]

    capacities_vs_c = {
        float(c): float(cap)
        for c, cap in zip(rate_data["c_rates"], rate_data["capacities"])
    }

    return BatteryPerformanceSummary(
        practical_capacity_mAh_g=float(generator.electrochemical_sim.get_practical_capacity()),
        average_voltage_V=float(voltage_metrics["average_voltage_V"]),
        energy_density_Wh_kg=float(voltage_metrics["energy_density_Wh_kg"]),
        capacities_vs_c_rate=capacities_vs_c,
    )


if __name__ == "__main__":
    summary = run_matbg_simulation()
    print("MATBG Na-ion battery performance summary:")
    print(f"  Practical capacity: {summary.practical_capacity_mAh_g:.1f} mAh/g")
    print(f"  Average voltage:    {summary.average_voltage_V:.2f} V")
    print(f"  Energy density:     {summary.energy_density_Wh_kg:.1f} Wh/kg")
    print("  Capacities vs C-rate (mAh/g):")
    for c, cap in sorted(summary.capacities_vs_c_rate.items()):
        print(f"    {c}C: {cap:.1f}")

