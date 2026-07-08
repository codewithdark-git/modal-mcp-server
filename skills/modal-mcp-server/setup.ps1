<#PSScriptInfo
.VERSION 1.0.0
.GUID 8f3c1a2b-4e5d-6f7a-8b9c-0d1e2f3a4b5c
.AUTHOR modal-mcp-server contributors
.COPYRIGHT MIT License
.TAGS modal, mcp, gpu, python, setup
.LICENSEURI https://opensource.org/licenses/MIT
.PROJECTURI https://github.com/codewithdark-git/modal-mcp-server
#>

<#PSScriptInfo
.SYNOPSIS
    Automated setup script for modal-mcp-server
.DESCRIPTION
    Installs and configures modal-mcp-server for running GPU-dependent Python
    workloads on Modal.com from any MCP-compatible AI agent.
.PARAMETER Global
    Install globally with npm (default)
.PARAMETER Project
    Install locally in specified project directory
.PARAMETER SkipDoctor
    Skip authentication verification
.PARAMETER Help
    Show this help
.EXAMPLE
    .\setup.ps1
    # Global install
.EXAMPLE
    .\setup.ps1 --Project "C:\MyProject"
    # Install in specific project
.EXAMPLE
    .\setup.ps1 --SkipDoctor
    # Skip auth verification
#>

[CmdletBinding()]
param(
    [switch]$Global,
    [string]$Project,
    [switch]$SkipDoctor,
    [switch]$Help
)

if ($Help) {
    Get-Help $MyInvocation.MyCommand.Definition -Detailed
    exit 0
}

# Default to global if neither specified
if (-not $Global -and -not $Project) {
    $Global = $true
}

$ErrorActionPreference = 'Stop'

function Write-Step { param($Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Success { param($Message) Write-Host "✓ $Message" -ForegroundColor Green }
function Write-Warning { param($Message) Write-Host "⚠ $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "✗ $Message" -ForegroundColor Red }

# Check prerequisites
function Check-Prereqs {
    Write-Step "Checking prerequisites..."

    $missing = @()

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        $missing += "node (>=20)"
    } else {
        $nodeVersion = node --version
        $majorVersion = [int]($nodeVersion -replace '^v', '' -split '\.')[0]
        if ($majorVersion -lt 20) {
            $missing += "node >=20 (current: $nodeVersion)"
        }
    }

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        $missing += "npm"
    }

    if ($missing.Count -gt 0) {
        Write-Error "Missing prerequisites:"
        $missing | ForEach-Object { Write-Host "  - $_" }
        Write-Host ""
        Write-Host "Please install missing tools and re-run."
        exit 1
    }

    Write-Success "Prerequisites OK (node $(node --version), npm $(npm --version))"
}

# Setup environment file
function Setup-Env {
    Write-Step "Setting up environment..."

    $envFile = ".env"
    $exampleFile = "config/env.example"

    if (-not (Test-Path $exampleFile)) {
        Write-Warning "Example env file not found at $exampleFile"
        return
    }

    if (-not (Test-Path $envFile)) {
        Copy-Item $exampleFile $envFile
        Write-Success "Created .env from template"
        Write-Warning "Edit .env with your MODAL_TOKEN_ID and MODAL_TOKEN_SECRET"
    } else {
        Write-Success ".env already exists"
    }
}

# Install globally
function Install-Global {
    Write-Step "Installing modal-mcp-server globally..."
    npm install -g modal-mcp-server | Out-Host
    Write-Success "Global install complete"
    Write-Host "  Command: modal-mcp-server"
    Write-Host "  (Available in PATH after npm global install)"
}

# Install in project
function Install-Project {
    $targetDir = if ($Project) { $Project } else { Get-Location }

    Write-Step "Installing in project: $targetDir"
    Set-Location $targetDir

    if (-not (Test-Path "package.json")) {
        Write-Warning "No package.json found, creating minimal one..."
        @"
{
  "name": "my-project",
  "version": "1.0.0",
  "private": true,
  "devDependencies": {}
}
"@ | Set-Content package.json -Encoding utf8
    }

    npm install modal-mcp-server --save-dev | Out-Host
    Write-Success "Project install complete"
}

# Verify with doctor
function Verify-Doctor {
    if ($SkipDoctor) {
        Write-Warning "Skipping doctor check (--SkipDoctor)"
        return
    }

    Write-Step "Verifying Modal authentication..."

    try {
        $result = modal-mcp-server doctor 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Modal authentication OK"
        } else {
            throw "Doctor failed"
        }
    } catch {
        Write-Warning "Doctor check failed - check your .env tokens"
        Write-Host "Run: modal-mcp-server doctor"
        Write-Host "Or:  source .env && modal-mcp-server doctor"
    }
}

# Print next steps
function Print-NextSteps {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "Setup complete!" -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host ""
    Write-Host "1. Add to your agent config:" -ForegroundColor Yellow
    Write-Host "   See: agents/ for templates"
    Write-Host ""
    Write-Host "2. Test with CLI:" -ForegroundColor Yellow
    Write-Host "   modal-mcp-server run-tests -p /path/to/project -c \"python -c 'import torch; print(torch.cuda.is_available())'\" --gpu T4 --wait"
    Write-Host ""
    Write-Host "3. Verify MCP tools in agent:" -ForegroundColor Yellow
    Write-Host "   modal_check_environment -> Should return ok: true"
    Write-Host ""
    Write-Host "4. Run your first GPU job!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Full docs: https://github.com/codewithdark-git/modal-mcp-server" -ForegroundColor Cyan
    Write-Host "Skill docs: skills/modal-mcp-server/README.md" -ForegroundColor Cyan
    Write-Host ""
}

# Main
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     modal-mcp-server Automated Setup                     ║" -ForegroundColor Cyan
Write-Host "║     Run GPU Python workloads on Modal.com                ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Check-Prereqs

if ($Global) {
    Install-Global
} else {
    Install-Project
}

Setup-Env

Verify-Doctor

Print-NextSteps