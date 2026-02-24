[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.18231510.svg)](https://doi.org/10.5281/zenodo.18231510)
# MATBG Sodium-Ion Battery Simulation System


## Code Structure

```
complete_revised_package/
├── README.md                              # This documentation file
├── requirements.txt                       # Python dependencies
├── src/                                   # Source code directory
│   ├── core_system_revised.py            # Core system (revised)
│   ├── electrochemical_simulation_revised.py  # Electrochemical simulation (revised)
│   ├── material_characterization.py       # Material characterization simulation
│   ├── insitu_analysis.py                # In-situ analysis simulation
│   └── complete_dataset_generator_revised.py  # Dataset generator (revised)
└── Sample_output/                         # Sample output data
    ├── electrochemical/                   # Electrochemical data
    ├── characterization/                  # Characterization data
    ├── insitu/                           # In-situ analysis data
    ├── figures/                          # Figures
    ├── reports/                          # Reports
    ├── simulation_metadata.json          # Simulation metadata
    └── structural_descriptors.csv        # Structural descriptors table
```

---

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run Complete Simulation

```bash
cd src
python complete_dataset_generator_revised.py
```

## Module Descriptions

### 1. core_system_revised.py
- Defines MATBG physical parameters
- **Correction**: DOS enhancement factor calculation constrained to 1.5-2.5 range
- **Addition**: Na atom adsorption site descriptions
- **Addition**: Structural descriptors table output functionality

### 2. electrochemical_simulation_revised.py
- Simulates CV, GCD, cycling stability, and rate performance
- **Correction**: Capacity calculation based on NaC8 coordination theory
- **Addition**: Voltage curve analysis functionality

### 3. material_characterization.py
- Simulates SEM, TEM, XRD, Raman, and AFM data
- No modifications required

### 4. insitu_analysis.py
- Simulates in-situ XRD, Raman, and EIS data
- No modifications required

### 5. complete_dataset_generator_revised.py
- Integrates all modules to generate complete dataset
- Uses revised core modules


## Contact

qinyou_yang@163.com

---

*Revision Date: January 2026*
*Version: 1.0*
