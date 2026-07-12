# One-command backend start (Windows). First run creates the venv and installs deps.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv")) {
    Write-Host "Setting up venv (first run)..."
    if (Get-Command uv -ErrorAction SilentlyContinue) {
        uv venv --python 3.12 .venv
        uv pip install -p .venv\Scripts\python.exe -r requirements.txt
    } else {
        py -3.12 -m venv .venv
        .venv\Scripts\python.exe -m pip install -r requirements.txt
    }
}

.venv\Scripts\python.exe -m uvicorn app.main:app --port 8787
