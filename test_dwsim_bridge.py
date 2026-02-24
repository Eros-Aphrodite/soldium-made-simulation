from __future__ import annotations

from pathlib import Path

from dwsim_interface import DWSIMBridge, DWSIMConfig

# Folder that contains DWSIM.Automation.dll on your machine
DWSIM_BIN = Path(r"C:\Users\jupiter\AppData\Local\DWSIM")


def main() -> None:
    cfg = DWSIMConfig(
        flowsheet_path=Path(r"F:\sodium\process.dwxml"),
        dwsim_bin_path=DWSIM_BIN,
    )

    bridge = DWSIMBridge(cfg)

    # Simple 1‑hour run at 10 kA
    res = bridge.run_electrolysis(current_a=10_000.0, hours=1.0)
    print("DWSIM bridge result:")
    print(res)


if __name__ == "__main__":
    main()