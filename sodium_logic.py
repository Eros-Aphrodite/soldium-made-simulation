"""Core sodium production and simple finance logic.

This module is intentionally kept free of any DWSIM/FreeCAD logic so it can be
used as the mathematical "brain" from different front-ends (CLI, GUI, etc.).
"""


def calculate_sodium_production(amperes: float, hours: float, efficiency: float = 0.90) -> float:
    """
    Calculate sodium mass (kg) using Faraday's Law.

    m = (I * t * M) / (n * F)
    """
    FARADAY_CONSTANT = 96485.0  # Coulombs/mol
    MOLAR_MASS_SODIUM = 22.99   # g/mol
    VALENCY = 1.0               # n

    seconds = hours * 3600.0
    mass_grams = (amperes * seconds * MOLAR_MASS_SODIUM) / (VALENCY * FARADAY_CONSTANT)
    return (mass_grams / 1000.0) * efficiency


def calculate_finances(
    kg_produced: float,
    power_kw: float,
    hours: float,
    electricity_cost_per_kwh: float,
    sodium_price_per_kg: float,
) -> tuple[float, float, float]:
    """
    Calculate total revenue, total operating cost, and margin for a batch.
    """
    total_revenue = kg_produced * sodium_price_per_kg
    total_energy_kwh = power_kw * hours
    total_cost = total_energy_kwh * electricity_cost_per_kwh
    margin = total_revenue - total_cost
    return total_revenue, total_cost, margin


def example_daily_run() -> None:
    """Small self-test / example for a single industrial cell."""
    amps = 10000.0  # 10 kA industrial cell
    hours = 24.0    # 1 day
    power_kw = 50.0
    electricity_cost_per_kwh = 0.12
    sodium_price_per_kg = 3.50

    produced = calculate_sodium_production(amps, hours)
    revenue, cost, profit = calculate_finances(
        produced,
        power_kw=power_kw,
        hours=hours,
        electricity_cost_per_kwh=electricity_cost_per_kwh,
        sodium_price_per_kg=sodium_price_per_kg,
    )

    print(f"Daily Production: {produced:.2f} kg")
    print(f"Daily Revenue:   ${revenue:,.2f}")
    print(f"Daily Cost:      ${cost:,.2f}")
    print(f"Daily Profit:    ${profit:,.2f}")


if __name__ == "__main__":
    example_daily_run()
