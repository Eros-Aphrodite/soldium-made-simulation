"""FastAPI backend exposing the sodium plant simulation to a web frontend.

Usage:
    uvicorn api_server:app --reload

Endpoints (JSON):
    POST /api/reset
        body: { "current_a": float, "dt_hours": float }
        resets the plant to time 0 with given operating point

    POST /api/step
        body: { "steps": int }   # optional, default 1
        advances the simulation by steps * dt_hours
        returns the latest step result
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from plant_model import PlantConfig, SodiumPlant
from sodium_logic import time_hours_for_naoh_mass


class ResetRequest(BaseModel):
    current_a: float = 10_000.0
    dt_hours: float = 1.0


class StepRequest(BaseModel):
    steps: int = 1


class TimeRequest(BaseModel):
    current_a: float
    naoh_mass_kg: float
    efficiency: float = 0.90


app = FastAPI(title="Sodium Plant Simulation API")

# Allow frontend(s) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> Dict[str, Any]:
    """Simple root endpoint so platform health checks don't 502 on '/'."""
    return {"status": "ok", "service": "sodium-plant-api"}


@app.get("/health")
def health() -> Dict[str, Any]:
    """Lightweight healthcheck endpoint."""
    return {"status": "ok"}

_plant: Optional[SodiumPlant] = None
_current_a: float = 10_000.0
_dt_hours: float = 1.0


def _ensure_plant() -> SodiumPlant:
    global _plant
    if _plant is None:
        _plant = SodiumPlant(PlantConfig())
    return _plant


@app.post("/api/reset")
def reset(req: ResetRequest) -> Dict[str, Any]:
    """Reset plant state and set operating point."""
    global _plant, _current_a, _dt_hours
    _plant = SodiumPlant(PlantConfig())
    _current_a = req.current_a
    _dt_hours = req.dt_hours
    return {"status": "ok", "current_a": _current_a, "dt_hours": _dt_hours}


@app.post("/api/step")
def step(req: StepRequest) -> Dict[str, Any]:
    """Advance the simulation by N steps and return the last result."""
    plant = _ensure_plant()
    result: Dict[str, Any] = {}
    for _ in range(max(1, req.steps)):
        result = plant.step(requested_current_a=_current_a, dt_hours=_dt_hours)
    return result


@app.get("/api/state")
def state() -> Dict[str, Any]:
    """Return a simplified snapshot of the plant state."""
    plant = _ensure_plant()
    st = plant.state
    return {
        "time_hours": st.time_hours,
        "cumulative_na_kg": st.cumulative_na_produced_kg,
        "cumulative_naoh_kg": st.cumulative_naoh_kg,
        "cumulative_cl2_kg": st.cumulative_cl2_kg,
        "cumulative_h2_kg": st.cumulative_h2_kg,
        "cumulative_revenue": st.cumulative_revenue,
        "cumulative_cost": st.cumulative_cost,
        "current_a": _current_a,
        "dt_hours": _dt_hours,
    }


@app.post("/api/reaction_time")
def reaction_time(req: TimeRequest) -> Dict[str, Any]:
    """
    Approximate electrolysis time needed to consume a given NaOH mass
    at the specified current (Castner process approximation).
    """
    hours = time_hours_for_naoh_mass(
        current_a=req.current_a,
        naoh_mass_kg=req.naoh_mass_kg,
        efficiency=req.efficiency,
    )
    return {
        "hours": hours,
        "seconds": hours * 3600.0,
        "current_a": req.current_a,
        "naoh_mass_kg": req.naoh_mass_kg,
        "efficiency": req.efficiency,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True)

