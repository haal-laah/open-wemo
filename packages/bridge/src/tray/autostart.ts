/**
 * Auto-Start on Login
 *
 * Implements platform-specific auto-start functionality:
 * - Windows: Registry key in HKCU\Software\Microsoft\Windows\CurrentVersion\Run
 * - macOS: LaunchAgent plist in ~/Library/LaunchAgents
 * - Linux: .desktop file in ~/.config/autostart
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { getDatabase } from "../db";
import { getInstalledExePath, isAlreadyInstalled } from "../install";

/** Settings key for auto-start preference */
const AUTOSTART_SETTING_KEY = "autostart_enabled";

/** Application name used in startup entries */
const APP_NAME = "Open Wemo";

/** Application identifier (no spaces, lowercase) */
const APP_ID = "open-wemo";

/**
 * Checks if we're running as a compiled binary (not dev mode).
 */
function isCompiledBinary(): boolean {
  // In compiled binaries, import.meta.dir contains "~BUN"
  // In dev mode, it's a normal filesystem path
  return import.meta.dir.includes("~BUN") || import.meta.dir.startsWith("$bunfs");
}

/**
 * Gets the executable path for autostart.
 * Uses the installed path if available, otherwise returns null.
 */
function getExecutablePath(): string | null {
  if (!isCompiledBinary()) {
    console.warn("[Autostart] Running in dev mode - autostart requires compiled binary");
    return null;
  }

  // Always use the installed path for autostart
  // This ensures the registry points to the stable location
  if (isAlreadyInstalled()) {
    return getInstalledExePath();
  }

  // Fallback to current path if not installed yet
  // (this shouldn't happen since install runs before autostart can be enabled)
  return process.execPath;
}

// ==================== Windows Implementation ====================

/**
 * Windows: Sets auto-start via registry.
 * Uses PowerShell to modify registry since Node doesn't have native registry access.
 */
async function setWindowsAutostart(enabled: boolean): Promise<boolean> {
  const regKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

  try {
    if (enabled) {
      const exePath = getExecutablePath();
      if (!exePath) {
        console.error("[Autostart] Cannot enable autostart in dev mode - run the compiled binary");
        return false;
      }
      // Add registry entry - wrap path in quotes for paths with spaces
      const quotedPath = `"${exePath}"`;
      const cmd = `Set-ItemProperty -Path '${regKey}' -Name '${APP_NAME}' -Value '${quotedPath}'`;
      console.log("[Autostart] Running PowerShell command:", cmd);
      const proc = Bun.spawn(["powershell", "-Command", cmd], { stdout: "pipe", stderr: "pipe" });
      const stderr = await new Response(proc.stderr).text();
      await proc.exited;
      if (proc.exitCode !== 0) {
        console.error("[Autostart] PowerShell error:", stderr);
      }
      return proc.exitCode === 0;
    }
    // Remove registry entry (always allowed, even in dev mode)
    const removeCmd = `Remove-ItemProperty -Path '${regKey}' -Name '${APP_NAME}' -ErrorAction SilentlyContinue`;
    const removeProc = Bun.spawn(["powershell", "-Command", removeCmd], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await removeProc.exited;
    return true; // Don't fail if entry doesn't exist
  } catch (error) {
    console.error("[Autostart] Windows registry error:", error);
    return false;
  }
}

/**
 * Windows: Checks if auto-start is enabled in registry.
 */
async function getWindowsAutostartStatus(): Promise<boolean> {
  const regKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

  try {
    const cmd = `(Get-ItemProperty -Path '${regKey}' -Name '${APP_NAME}' -ErrorAction SilentlyContinue).'${APP_NAME}'`;
    const proc = Bun.spawn(["powershell", "-Command", cmd], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

// ==================== macOS Implementation ====================

/**
 * Gets the LaunchAgent plist path for macOS.
 */
function getMacLaunchAgentPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `com.${APP_ID}.plist`);
}

/**
 * macOS: Creates a LaunchAgent plist for auto-start.
 */
function setMacAutostart(enabled: boolean): boolean {
  const plistPath = getMacLaunchAgentPath();
  const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");

  try {
    if (enabled) {
      const exePath = getExecutablePath();
      if (!exePath) {
        console.error("[Autostart] Cannot enable autostart in dev mode - run the compiled binary");
        return false;
      }

      // Ensure LaunchAgents directory exists
      if (!existsSync(launchAgentsDir)) {
        mkdirSync(launchAgentsDir, { recursive: true });
      }
      const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.${APP_ID}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${exePath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${join(homedir(), "Library", "Logs", `${APP_ID}.log`)}</string>
    <key>StandardErrorPath</key>
    <string>${join(homedir(), "Library", "Logs", `${APP_ID}.error.log`)}</string>
</dict>
</plist>`;

      writeFileSync(plistPath, plistContent, "utf-8");
      return true;
    }
    // Remove plist if it exists
    if (existsSync(plistPath)) {
      unlinkSync(plistPath);
    }
    return true;
  } catch (error) {
    console.error("[Autostart] macOS LaunchAgent error:", error);
    return false;
  }
}

/**
 * macOS: Checks if LaunchAgent plist exists.
 */
function getMacAutostartStatus(): boolean {
  return existsSync(getMacLaunchAgentPath());
}

// ==================== Linux Implementation ====================

/**
 * Gets the .desktop file path for Linux auto-start.
 */
function getLinuxDesktopFilePath(): string {
  const autostartDir = join(homedir(), ".config", "autostart");
  return join(autostartDir, `${APP_ID}.desktop`);
}

/**
 * Linux: Creates a .desktop file for auto-start.
 */
function setLinuxAutostart(enabled: boolean): boolean {
  const desktopPath = getLinuxDesktopFilePath();
  const autostartDir = join(homedir(), ".config", "autostart");

  try {
    if (enabled) {
      const exePath = getExecutablePath();
      if (!exePath) {
        console.error("[Autostart] Cannot enable autostart in dev mode - run the compiled binary");
        return false;
      }

      // Ensure autostart directory exists
      if (!existsSync(autostartDir)) {
        mkdirSync(autostartDir, { recursive: true });
      }
      const desktopContent = `[Desktop Entry]
Type=Application
Name=${APP_NAME}
Comment=WeMo device controller
Exec="${exePath}"
Icon=${APP_ID}
Terminal=false
Categories=Utility;
StartupNotify=false
X-GNOME-Autostart-enabled=true
`;

      writeFileSync(desktopPath, desktopContent, "utf-8");
      return true;
    }
    // Remove .desktop file if it exists
    if (existsSync(desktopPath)) {
      unlinkSync(desktopPath);
    }
    return true;
  } catch (error) {
    console.error("[Autostart] Linux .desktop error:", error);
    return false;
  }
}

/**
 * Linux: Checks if .desktop file exists.
 */
function getLinuxAutostartStatus(): boolean {
  const desktopPath = getLinuxDesktopFilePath();
  if (!existsSync(desktopPath)) {
    return false;
  }

  // Also check if it's not disabled
  try {
    const content = readFileSync(desktopPath, "utf-8");
    // Check for X-GNOME-Autostart-enabled=false or Hidden=true
    if (content.includes("X-GNOME-Autostart-enabled=false") || content.includes("Hidden=true")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ==================== Public API ====================

/**
 * Enables or disables auto-start on login.
 *
 * @param enabled - Whether to enable auto-start
 * @returns Promise resolving to success status
 */
export async function setAutostart(enabled: boolean): Promise<boolean> {
  const os = platform();
  let success = false;

  switch (os) {
    case "win32":
      success = await setWindowsAutostart(enabled);
      break;
    case "darwin":
      success = setMacAutostart(enabled);
      break;
    case "linux":
      success = setLinuxAutostart(enabled);
      break;
    default:
      console.warn(`[Autostart] Unsupported platform: ${os}`);
      return false;
  }

  // Persist setting to database if successful
  if (success) {
    try {
      const db = getDatabase();
      db.setBoolSetting(AUTOSTART_SETTING_KEY, enabled);
      console.log(`[Autostart] ${enabled ? "Enabled" : "Disabled"} auto-start on login`);
    } catch (error) {
      console.error("[Autostart] Failed to persist setting:", error);
    }
  }

  return success;
}

/**
 * Gets the current auto-start status.
 * Checks both the system setting and the database.
 *
 * @returns Promise resolving to whether auto-start is enabled
 */
export async function getAutostartStatus(): Promise<boolean> {
  const os = platform();

  switch (os) {
    case "win32":
      return getWindowsAutostartStatus();
    case "darwin":
      return getMacAutostartStatus();
    case "linux":
      return getLinuxAutostartStatus();
    default:
      return false;
  }
}

/**
 * Gets the saved auto-start preference from the database.
 * This may differ from the actual system status if modified externally.
 */
export function getSavedAutostartPreference(): boolean {
  try {
    const db = getDatabase();
    return db.getBoolSetting(AUTOSTART_SETTING_KEY, false);
  } catch {
    return false;
  }
}

/**
 * Syncs the system auto-start status with the saved preference.
 * Call this on app startup to ensure consistency.
 */
export async function syncAutostart(): Promise<void> {
  const savedPreference = getSavedAutostartPreference();
  const actualStatus = await getAutostartStatus();

  if (savedPreference !== actualStatus) {
    console.log(`[Autostart] Syncing: preference=${savedPreference}, actual=${actualStatus}`);
    await setAutostart(savedPreference);
  }
}

/**
 * Checks if auto-start is supported on the current platform.
 */
export function isAutostartSupported(): boolean {
  const os = platform();
  return os === "win32" || os === "darwin" || os === "linux";
}
