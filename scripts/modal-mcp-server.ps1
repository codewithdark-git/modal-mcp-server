#!/usr/bin/env powershell
<#
PowerShell wrapper for modal-mcp-server
Provides better Windows support and handles path resolution
#>

param(
    [string[]]$ArgumentList
)

# Resolve the path to the actual Node.js module
# This handles both global and local installations

function Get-ModulePath {
    # Try to find the module in the same directory as this script
    $scriptDir = $PSScriptRoot
    $modulePath = Join-Path -Path $scriptDir -ChildPath "..\dist\index.js"
    
    if (Test-Path $modulePath) {
        return Resolve-Path $modulePath
    }
    
    # Try to find it via npm
    try {
        $npmPath = (Get-Command npm).Source
        $npmDir = Split-Path -Path $npmPath -Parent
        $globalNodeModules = Join-Path -Path $npmDir -ChildPath "..\node_modules\modal-mcp-server\dist\index.js"
        
        if (Test-Path $globalNodeModules) {
            return Resolve-Path $globalNodeModules
        }
    } catch {
        # npm not available, continue
    }
    
    # Try common global npm paths
    $possiblePaths = @(
        "$env:APPDATA\npm\node_modules\modal-mcp-server\dist\index.js",
        "$env:ProgramFiles\nodejs\node_modules\modal-mcp-server\dist\index.js",
        "$env:USERPROFILE\.npm-global\node_modules\modal-mcp-server\dist\index.js"
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            return Resolve-Path $path
        }
    }
    
    # Fallback to just using the command name
    return "modal-mcp-server"
}

# Get the path to node
function Get-NodePath {
    try {
        return (Get-Command node).Source
    } catch {
        return "node"
    }
}

# Main execution
$nodePath = Get-NodePath
$modulePath = Get-ModulePath

# Build the argument list
$args = @($modulePath) + $ArgumentList

# Execute
try {
    & $nodePath $args
    exit $LASTEXITCODE
} catch {
    Write-Error "Failed to execute modal-mcp-server: $_"
    exit 1
}
