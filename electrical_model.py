"""Electrical model for transformer/rectifier and cell power.

This module stays independent from DWSIM and FreeCAD. It takes a desired
current, applies equipment limits, and returns the resulting cell voltage,
power, and constraint flags.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass
class ElectricalConfig:
    """Configuration for the DC supply and cell."""

    # Nameplate / design data
    max_dc_current_a: float = 100_000.0  # maximum allowable DC current
    max_power_kw: float = 5_000.0       # transformer/rectifier kW rating

    # Cell behaviour (simple linear model around nominal point)
    base_cell_voltage_v: float = 6.0    # nominal cell voltage at reference current
    base_current_a: float = 50_000.0    # reference current for base_cell_voltage_v
    cell_resistance_ohm: float = 1.0e-4  # additional effective resistance term

    # Operating limits
    min_cell_voltage_v: float = 4.0
    max_cell_voltage_v: float = 9.0

    # Rectifier efficiency (electrical losses)
    rectifier_efficiency: float = 0.96


@dataclass
class ElectricalState:
    """Result of attempting to supply a given current."""

    requested_current_a: float
    actual_current_a: float
    cell_voltage_v: float
    dc_power_kw: float
    ac_power_kw: float
    constrained: bool
    constraint_reason: Literal["none", "current_limit", "power_limit", "voltage_limit"]


def compute_electrical_state(
    requested_current_a: float,
    config: ElectricalConfig,
    effective_cell_resistance_ohm: float | None = None,
) -> ElectricalState:
    """
    Compute actual current/voltage/power, enforcing equipment limits.

    `effective_cell_resistance_ohm` allows you to inject electrode wear effects:
    when electrodes age, this resistance can be increased to reflect higher
    overpotentials and losses.
    """
    constrained = False
    reason: Literal["none", "current_limit", "power_limit", "voltage_limit"] = "none"

    # 1) Apply current limit
    actual_current = min(requested_current_a, config.max_dc_current_a)
    if actual_current < requested_current_a:
        constrained = True
        reason = "current_limit"

    # 2) Estimate voltage with a simple linear + resistive model
    r_cell = effective_cell_resistance_ohm if effective_cell_resistance_ohm is not None else config.cell_resistance_ohm

    # Linear scaling around base point plus ohmic term
    if config.base_current_a > 0:
        scaling = actual_current / config.base_current_a
    else:
        scaling = 1.0

    v_cell = config.base_cell_voltage_v * scaling + actual_current * r_cell

    # 3) Enforce voltage limits
    if v_cell < config.min_cell_voltage_v:
        v_cell = config.min_cell_voltage_v
        constrained = True
        reason = "voltage_limit"
    elif v_cell > config.max_cell_voltage_v:
        v_cell = config.max_cell_voltage_v
        constrained = True
        reason = "voltage_limit"

    # 4) Compute power and enforce power limit
    dc_power_kw = (actual_current * v_cell) / 1000.0
    ac_power_kw = dc_power_kw / max(config.rectifier_efficiency, 1e-6)

    if ac_power_kw > config.max_power_kw:
        # Reduce current proportionally to respect power limit.
        scale = config.max_power_kw / ac_power_kw
        actual_current *= scale
        dc_power_kw *= scale
        ac_power_kw = config.max_power_kw
        constrained = True
        reason = "power_limit"

    return ElectricalState(
        requested_current_a=requested_current_a,
        actual_current_a=actual_current,
        cell_voltage_v=v_cell,
        dc_power_kw=dc_power_kw,
        ac_power_kw=ac_power_kw,
        constrained=constrained,
        constraint_reason=reason,
    )


if __name__ == "__main__":
    cfg = ElectricalConfig()
    state = compute_electrical_state(80_000.0, cfg)
    print(state)

