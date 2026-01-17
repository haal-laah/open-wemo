# Build script for Windows - compiles and patches exe for GUI subsystem
# This hides the console window when running the app

param(
    [switch]$SkipEditbin
)

$ErrorActionPreference = "Stop"

Write-Host "=== Open Wemo Windows Build ===" -ForegroundColor Cyan

# Get version from package.json
$packageJson = Get-Content -Path "package.json" -Raw | ConvertFrom-Json
$version = $packageJson.version
Write-Host "Version: $version" -ForegroundColor White

# Step 1: Compile with Bun
Write-Host "`n[1/2] Compiling with Bun..." -ForegroundColor Yellow
$outFile = "dist/open-wemo-$version-win"
bun build src/main.ts --compile --outfile=$outFile
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

$exePath = "$outFile.exe"
if (-not (Test-Path $exePath)) {
    Write-Host "Error: $exePath not found after build" -ForegroundColor Red
    exit 1
}

Write-Host "Compiled: $exePath" -ForegroundColor Green

# Step 2: Patch with editbin to change subsystem from CONSOLE to WINDOWS
if ($SkipEditbin) {
    Write-Host "`n[2/2] Skipping editbin (console window will be visible)" -ForegroundColor Yellow
} else {
    Write-Host "`n[2/2] Patching subsystem with editbin..." -ForegroundColor Yellow
    
    # Find editbin in Visual Studio installation
    $editbinPaths = @(
        "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Tools\MSVC\*\bin\Hostx64\x64\editbin.exe",
        "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\*\bin\Hostx64\x64\editbin.exe",
        "C:\Program Files\Microsoft Visual Studio\2019\*\VC\Tools\MSVC\*\bin\Hostx64\x64\editbin.exe",
        "C:\Program Files\Microsoft Visual Studio\2022\*\VC\Tools\MSVC\*\bin\Hostx64\x64\editbin.exe"
    )
    
    $editbin = $null
    foreach ($pattern in $editbinPaths) {
        $found = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) {
            $editbin = $found.FullName
            break
        }
    }
    
    if (-not $editbin) {
        Write-Host "Warning: editbin.exe not found. Console window will be visible." -ForegroundColor Yellow
        Write-Host "Install Visual Studio Build Tools for GUI mode." -ForegroundColor Yellow
    } else {
        Write-Host "Using: $editbin" -ForegroundColor Gray
        
        # editbin requires vcvars to be set up for DLL paths
        $vcvarsPath = Split-Path (Split-Path (Split-Path (Split-Path (Split-Path $editbin))))
        $vcvarsPath = Join-Path $vcvarsPath "..\..\..\..\Auxiliary\Build\vcvars64.bat"
        $vcvarsPath = (Resolve-Path $vcvarsPath -ErrorAction SilentlyContinue).Path
        
        if ($vcvarsPath -and (Test-Path $vcvarsPath)) {
            # Run editbin in a cmd shell with vcvars
            $cmd = "call `"$vcvarsPath`" >nul 2>&1 && `"$editbin`" /SUBSYSTEM:WINDOWS `"$exePath`""
            cmd /c $cmd
        } else {
            # Try running editbin directly
            & $editbin /SUBSYSTEM:WINDOWS $exePath
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Patched to GUI subsystem (no console window)" -ForegroundColor Green
        } else {
            Write-Host "Warning: editbin failed. Console window will be visible." -ForegroundColor Yellow
        }
    }
}

# Show result
$size = (Get-Item $exePath).Length / 1MB
Write-Host "`n=== Build Complete ===" -ForegroundColor Cyan
Write-Host "Output: $exePath" -ForegroundColor White
Write-Host "Size: $([math]::Round($size, 2)) MB" -ForegroundColor White
