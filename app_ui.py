"""PyQt6 GUI for the sodium plant MVP.

This provides a simple desktop UI where you can:
- set electrical operating conditions and simulation time
- (optionally) specify NaCl and NaOH solid feed rates for documentation
- run a time-based simulation and see key results

Run from a terminal:
    python app_ui.py
"""

from __future__ import annotations

import sys
from dataclasses import dataclass

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QApplication,
    QDoubleSpinBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from plant_model import PlantConfig, SodiumPlant


@dataclass
class UIScenario:
    """Scenario parameters captured from the UI."""

    current_a: float
    total_hours: float
    dt_hours: float
    nacl_feed_kgph: float
    naoh_feed_kgph: float


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Sodium Plant MVP Simulator")
        self._build_ui()

    def _build_ui(self) -> None:
        central = QWidget(self)
        self.setCentralWidget(central)

        main_layout = QVBoxLayout()
        central.setLayout(main_layout)

        # Inputs
        form = QFormLayout()

        self.current_spin = QDoubleSpinBox()
        self.current_spin.setRange(0.0, 200_000.0)
        self.current_spin.setDecimals(0)
        self.current_spin.setValue(10_000.0)
        self.current_spin.setSuffix(" A")
        form.addRow("Cell current", self.current_spin)

        self.total_hours_spin = QDoubleSpinBox()
        self.total_hours_spin.setRange(0.1, 1_000.0)
        self.total_hours_spin.setDecimals(1)
        self.total_hours_spin.setValue(24.0)
        self.total_hours_spin.setSuffix(" h")
        form.addRow("Total simulation time", self.total_hours_spin)

        self.dt_hours_spin = QDoubleSpinBox()
        self.dt_hours_spin.setRange(0.01, 24.0)
        self.dt_hours_spin.setDecimals(2)
        self.dt_hours_spin.setValue(1.0)
        self.dt_hours_spin.setSuffix(" h")
        form.addRow("Time step", self.dt_hours_spin)

        self.nacl_feed_spin = QDoubleSpinBox()
        self.nacl_feed_spin.setRange(0.0, 10_000.0)
        self.nacl_feed_spin.setDecimals(1)
        self.nacl_feed_spin.setValue(1_000.0)
        self.nacl_feed_spin.setSuffix(" kg/h")
        form.addRow("NaCl solid feed", self.nacl_feed_spin)

        self.naoh_feed_spin = QDoubleSpinBox()
        self.naoh_feed_spin.setRange(0.0, 10_000.0)
        self.naoh_feed_spin.setDecimals(1)
        self.naoh_feed_spin.setValue(0.0)
        self.naoh_feed_spin.setSuffix(" kg/h")
        form.addRow("NaOH solid feed", self.naoh_feed_spin)

        main_layout.addLayout(form)

        # Run button
        button_row = QHBoxLayout()
        self.run_button = QPushButton("Run Simulation")
        self.run_button.clicked.connect(self.on_run_clicked)  # type: ignore[arg-type]
        button_row.addWidget(self.run_button)
        button_row.addStretch(1)
        main_layout.addLayout(button_row)

        # Output area
        main_layout.addWidget(QLabel("Simulation log:"))
        self.output = QTextEdit()
        self.output.setReadOnly(True)
        self.output.setLineWrapMode(QTextEdit.LineWrapMode.NoWrap)
        main_layout.addWidget(self.output, stretch=1)

        # Status bar
        self.statusBar().showMessage("Ready")

    def _collect_scenario(self) -> UIScenario:
        return UIScenario(
            current_a=self.current_spin.value(),
            total_hours=self.total_hours_spin.value(),
            dt_hours=self.dt_hours_spin.value(),
            nacl_feed_kgph=self.nacl_feed_spin.value(),
            naoh_feed_kgph=self.naoh_feed_spin.value(),
        )

    def on_run_clicked(self) -> None:
        scenario = self._collect_scenario()
        self.output.clear()

        plant = SodiumPlant(PlantConfig())

        steps = max(1, int(scenario.total_hours / scenario.dt_hours))
        self.output.append(
            f"Running scenario: I={scenario.current_a:.0f} A, "
            f"t={scenario.total_hours:.1f} h, dt={scenario.dt_hours:.2f} h, "
            f"NaCl feed={scenario.nacl_feed_kgph:.1f} kg/h, "
            f"NaOH feed={scenario.naoh_feed_kgph:.1f} kg/h"
        )
        self.output.append("")

        for i in range(steps):
            result = plant.step(
                requested_current_a=scenario.current_a,
                dt_hours=scenario.dt_hours,
            )
            if not result:
                continue

            line = (
                f"step {i+1:3d} | "
                f"t={result['time_hours']:.2f} h | "
                f"I={result['actual_current_a']:,.0f} A | "
                f"V={result['cell_voltage_v']:.2f} V | "
                f"Na_step={result['na_collected_kg']:.4f} kg | "
                f"Na_cum={result['cumulative_na_kg']:.2f} kg"
            )
            self.output.append(line)

        self.output.append("\nSummary:")
        self.output.append(
            f"  Total Na collected: {plant.state.cumulative_na_produced_kg:,.2f} kg"
        )
        self.output.append(
            f"  Total revenue:      ${plant.state.cumulative_revenue:,.2f}"
        )
        self.output.append(
            f"  Total power cost:   ${plant.state.cumulative_cost:,.2f}"
        )

        self.statusBar().showMessage("Simulation finished", 5000)


def main() -> None:
    app = QApplication(sys.argv)
    win = MainWindow()
    win.resize(900, 600)
    win.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()

