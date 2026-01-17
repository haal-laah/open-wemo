/**
 * Open Wemo PWA - Main Application
 */

import { api } from "./api.js";
import {
  AuthMode,
  EncryptType,
  EncryptionMethod,
  NetworkMode,
  TEST_NAMES,
  WEMO_SETUP_URL,
  createDeviceInfoObjectTag,
  detectNetworkMode,
  formatTestResults,
  parseDeviceInfoFromText,
  runAllTests,
  sendWifiSetupCommand,
} from "./setup-mode.js";

// ============================================
// State Management
// ============================================

const state = {
  devices: [],
  loading: true,
  error: null,
  isOffline: false,
  lastUpdated: null,
  networkMode: NetworkMode.NORMAL,
  testResults: [],
  testsRunning: false,
  // Device setup state
  deviceInfo: {
    serial: null,
    mac: null,
    raw: {},
    pastedText: "",
  },
  // WiFi setup form state
  wifiSetup: {
    ssid: "",
    password: "",
    securityType: "WPA2/AES", // Default to most common
    sending: false,
    sent: false,
    error: null,
  },
  settings: {
    refreshInterval: 30000,
    theme: "dark",
  },
};

// ============================================
// PWA Install State
// ============================================

const pwaState = {
  deferredPrompt: null,
  isInstalled: false,
  isIOS: false,
  isStandalone: false,
  installBannerDismissed: false,
};

const INSTALL_BANNER_DISMISSED_KEY = "open-wemo-install-dismissed";
const INSTALL_BANNER_DISMISS_DAYS = 14;
const APP_INSTALLED_KEY = "open-wemo-app-installed";

// ============================================
// DOM Elements
// ============================================

const $app = document.getElementById("app");
const $initialLoading = document.getElementById("initial-loading");
const $refreshBtn = document.getElementById("refresh-btn");
const $toastContainer = document.getElementById("toast-container");
const $addDeviceBtn = document.getElementById("add-device-btn");
const $discoveryModal = document.getElementById("discovery-modal");
const $discoveryContent = document.getElementById("discovery-content");
const $discoveryFooter = document.getElementById("discovery-footer");
const $discoveryClose = document.getElementById("discovery-close");
const $settingsBtn = document.getElementById("settings-btn");
const $settingsModal = document.getElementById("settings-modal");
const $settingsClose = document.getElementById("settings-close");
const $bridgeStatus = document.getElementById("bridge-status");
const $installBanner = document.getElementById("install-banner");
const $installBannerBtn = document.getElementById("install-banner-btn");
const $installBannerClose = document.getElementById("install-banner-close");
const $iosModal = document.getElementById("ios-install-modal");
const $iosModalClose = document.getElementById("ios-install-close");
const $settingsInstallBtn = document.getElementById("settings-install-btn");
const $settingsInstallRow = document.getElementById("settings-install-row");
const $settingsShareBtn = document.getElementById("settings-share-btn");
const $qrModal = document.getElementById("qr-modal");
const $qrModalClose = document.getElementById("qr-modal-close");
const $qrCodeContainer = document.getElementById("qr-code-container");
const $qrModalUrl = document.getElementById("qr-modal-url");
const $setupInstructionsModal = document.getElementById("setup-instructions-modal");
const $setupInstructionsClose = document.getElementById("setup-instructions-close");
const $setupInstructionsCancel = document.getElementById("setup-instructions-cancel");
const $setupInstructionsContinue = document.getElementById("setup-instructions-continue");

// ============================================
// Service Worker Registration
// ============================================

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      console.log("[App] Service worker registered:", registration.scope);

      // Handle updates
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            showToast("App update available. Refresh to update.", "info");
          }
        });
      });
    } catch (error) {
      console.error("[App] Service worker registration failed:", error);
    }
  }
}

// ============================================
// PWA Install Detection & Handling
// ============================================

/**
 * Detects if the current device is iOS.
 */
function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/**
 * Checks if the app was previously installed (persisted in localStorage).
 */
function wasAppInstalled() {
  try {
    return localStorage.getItem(APP_INSTALLED_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Marks the app as installed in localStorage.
 */
function markAppAsInstalled() {
  try {
    localStorage.setItem(APP_INSTALLED_KEY, "true");
  } catch {
    // Ignore storage errors
  }
}

/**
 * Detects if the app is running in standalone mode (already installed).
 */
function isRunningStandalone() {
  // Check display-mode media query (works on most browsers)
  const standaloneMedia = window.matchMedia("(display-mode: standalone)").matches;

  // Check iOS Safari standalone property
  const iosStandalone = window.navigator.standalone === true;

  // Check Android TWA
  const androidTWA = document.referrer.includes("android-app://");

  // Check fullscreen mode (some PWAs use this)
  const fullscreenMedia = window.matchMedia("(display-mode: fullscreen)").matches;

  // Check minimal-ui mode
  const minimalUIMedia = window.matchMedia("(display-mode: minimal-ui)").matches;

  // Check if we previously recorded a successful installation
  const previouslyInstalled = wasAppInstalled();

  const isStandalone =
    standaloneMedia ||
    iosStandalone ||
    androidTWA ||
    fullscreenMedia ||
    minimalUIMedia ||
    previouslyInstalled;

  console.log("[PWA] Standalone detection:", {
    standaloneMedia,
    iosStandalone,
    androidTWA,
    fullscreenMedia,
    minimalUIMedia,
    previouslyInstalled,
    result: isStandalone,
  });

  return isStandalone;
}

/**
 * Checks if the install banner was recently dismissed.
 */
function wasInstallBannerDismissed() {
  try {
    const dismissed = localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY);
    if (!dismissed) return false;

    const dismissedDate = new Date(dismissed);
    const now = new Date();
    const daysSinceDismissed = (now - dismissedDate) / (1000 * 60 * 60 * 24);

    return daysSinceDismissed < INSTALL_BANNER_DISMISS_DAYS;
  } catch {
    return false;
  }
}

/**
 * Marks the install banner as dismissed.
 */
function dismissInstallBanner() {
  try {
    localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, new Date().toISOString());
  } catch {
    // Ignore storage errors
  }
  pwaState.installBannerDismissed = true;
  hideInstallBanner();
}

/**
 * Shows the install banner (for Android/Chrome).
 */
function showInstallBanner() {
  if ($installBanner && !pwaState.isStandalone && !pwaState.installBannerDismissed) {
    $installBanner.classList.remove("hidden");
    console.log("[PWA] Showing install banner");
  }
}

/**
 * Hides the install banner.
 */
function hideInstallBanner() {
  if ($installBanner) {
    $installBanner.classList.add("hidden");
  }
}

/**
 * Shows the iOS install instructions modal.
 */
function showIOSInstallModal() {
  if ($iosModal) {
    $iosModal.classList.remove("hidden");
    trapFocus($iosModal);
    announceToScreenReader("iOS installation instructions opened");
  }
}

/**
 * Hides the iOS install instructions modal.
 */
function hideIOSInstallModal() {
  if ($iosModal) {
    $iosModal.classList.add("hidden");
  }
}

/**
 * Shows generic install instructions modal (for browsers without beforeinstallprompt).
 */
function showGenericInstallModal() {
  const $genericModal = document.getElementById("generic-install-modal");
  if ($genericModal) {
    $genericModal.classList.remove("hidden");
    trapFocus($genericModal);
    announceToScreenReader("Installation instructions opened");
  }
}

/**
 * Hides the generic install instructions modal.
 */
function hideGenericInstallModal() {
  const $genericModal = document.getElementById("generic-install-modal");
  if ($genericModal) {
    $genericModal.classList.add("hidden");
  }
}

/**
 * Triggers the native install prompt (Android/Chrome).
 */
async function triggerInstallPrompt() {
  if (!pwaState.deferredPrompt) {
    console.log("[PWA] No deferred prompt available");
    // If on iOS, show the iOS modal instead
    if (pwaState.isIOS) {
      showIOSInstallModal();
    }
    return;
  }

  try {
    // Show the install prompt
    pwaState.deferredPrompt.prompt();

    // Wait for the user to respond
    const { outcome } = await pwaState.deferredPrompt.userChoice;
    console.log(`[PWA] User response to install prompt: ${outcome}`);

    if (outcome === "accepted") {
      showToast("Installing app...", "success");
    }

    // Clear the deferred prompt - it can only be used once
    pwaState.deferredPrompt = null;
    hideInstallBanner();
    updateSettingsInstallButton();
  } catch (error) {
    console.error("[PWA] Install prompt failed:", error);
    showToast("Installation failed. Please try again.", "error");
  }
}

/**
 * Updates the install button visibility in Settings.
 */
function updateSettingsInstallButton() {
  if (!$settingsInstallRow) return;

  // Hide only if already installed in standalone mode
  if (pwaState.isStandalone) {
    $settingsInstallRow.classList.add("hidden");
  } else {
    // Always show install option - we'll handle the appropriate action based on platform
    $settingsInstallRow.classList.remove("hidden");
  }
}

/**
 * Sets up PWA install event listeners.
 */
function setupPWAInstall() {
  // Check current state
  pwaState.isStandalone = isRunningStandalone();
  pwaState.isIOS = isIOSDevice();
  pwaState.installBannerDismissed = wasInstallBannerDismissed();

  console.log("[PWA] State:", {
    isStandalone: pwaState.isStandalone,
    isIOS: pwaState.isIOS,
    installBannerDismissed: pwaState.installBannerDismissed,
  });

  // If already installed, nothing more to do
  if (pwaState.isStandalone) {
    console.log("[PWA] App is already installed (standalone mode)");
    hideInstallBanner();
    return;
  }

  // Listen for display mode changes (in case standalone is detected late)
  window.matchMedia("(display-mode: standalone)").addEventListener("change", (e) => {
    if (e.matches) {
      console.log("[PWA] Display mode changed to standalone");
      pwaState.isStandalone = true;
      hideInstallBanner();
      updateSettingsInstallButton();
    }
  });

  // Listen for beforeinstallprompt (Chrome/Edge/Samsung Internet)
  window.addEventListener("beforeinstallprompt", (e) => {
    // Prevent the mini-infobar from appearing
    e.preventDefault();

    // Store the event for later use
    pwaState.deferredPrompt = e;
    console.log("[PWA] beforeinstallprompt event captured");

    // Show our custom install banner (if not dismissed)
    if (!pwaState.installBannerDismissed) {
      showInstallBanner();
    }

    // Update settings button
    updateSettingsInstallButton();
  });

  // Listen for successful installation
  window.addEventListener("appinstalled", () => {
    console.log("[PWA] App was installed successfully");
    pwaState.isInstalled = true;
    pwaState.isStandalone = true;
    pwaState.deferredPrompt = null;
    markAppAsInstalled();
    hideInstallBanner();
    updateSettingsInstallButton();
    showToast("App installed successfully!", "success");
  });

  // Show banner for first-time users (regardless of platform)
  // For iOS: Shows immediately with instructions
  // For Android/Chrome: Shows immediately, native prompt triggers on Install click
  // For other browsers: Shows with generic instructions
  if (!pwaState.installBannerDismissed) {
    showInstallBanner();
  }

  // Set up banner button handlers
  if ($installBannerBtn) {
    $installBannerBtn.addEventListener("click", () => {
      // Always hide the banner first
      hideInstallBanner();

      if (pwaState.isIOS) {
        // Mark as installed since they're following instructions
        markAppAsInstalled();
        showIOSInstallModal();
      } else if (pwaState.deferredPrompt) {
        triggerInstallPrompt();
      } else {
        // No native prompt - show generic instructions
        // Mark as installed since they're following instructions
        markAppAsInstalled();
        showGenericInstallModal();
      }
    });
  }

  if ($installBannerClose) {
    $installBannerClose.addEventListener("click", dismissInstallBanner);
  }

  // Set up iOS modal close
  if ($iosModalClose) {
    $iosModalClose.addEventListener("click", hideIOSInstallModal);
  }

  // Close iOS modal on backdrop click
  $iosModal?.querySelector(".modal-backdrop")?.addEventListener("click", hideIOSInstallModal);

  // Set up generic install modal close handlers
  const $genericModal = document.getElementById("generic-install-modal");
  const $genericModalClose = document.getElementById("generic-install-close");
  if ($genericModalClose) {
    $genericModalClose.addEventListener("click", hideGenericInstallModal);
  }
  $genericModal
    ?.querySelector(".modal-backdrop")
    ?.addEventListener("click", hideGenericInstallModal);

  // Set up settings install button
  if ($settingsInstallBtn) {
    $settingsInstallBtn.addEventListener("click", () => {
      if (pwaState.isIOS) {
        markAppAsInstalled();
        closeSettingsModal();
        showIOSInstallModal();
      } else if (pwaState.deferredPrompt) {
        triggerInstallPrompt();
      } else {
        // No native prompt available - show generic instructions
        markAppAsInstalled();
        closeSettingsModal();
        showGenericInstallModal();
      }
    });
  }

  // Initial settings button state
  updateSettingsInstallButton();
}

// ============================================
// Toast Notifications
// ============================================

let toastTimeout = null;

function showToast(message, type = "info") {
  // Clear existing toast
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  // Clear container and add new toast
  $toastContainer.innerHTML = "";
  $toastContainer.appendChild(toast);

  // Auto-remove after 4 seconds
  toastTimeout = setTimeout(() => {
    toast.remove();
  }, 4000);
}

// ============================================
// Rendering Functions
// ============================================

/**
 * Renders the device list.
 */
function renderDevices() {
  if (state.loading) {
    return; // Keep showing initial loading
  }

  // Hide initial loading
  $initialLoading.classList.add("hidden");

  // Check for setup mode first
  if (state.networkMode === NetworkMode.SETUP_MODE) {
    $app.innerHTML = renderSetupMode();
    attachSetupModeListeners();
    return;
  }

  // If offline with no cached data, show offline state
  if (state.isOffline && state.devices.length === 0) {
    $app.innerHTML = renderOfflineState();
    startRetryTimer();
    return;
  }

  // Show devices (possibly with offline banner)
  let offlineBanner = "";
  if (state.isOffline) {
    offlineBanner = renderOfflineBanner();
    startRetryTimer();
  } else {
    stopRetryTimer();
  }

  if (state.devices.length === 0) {
    $app.innerHTML = renderEmptyState();
    attachDeviceListeners();
    return;
  }

  $app.innerHTML = `
    ${offlineBanner}
    <div class="device-list">
      ${state.devices.map(renderDeviceCard).join("")}
    </div>
  `;

  // Attach event listeners
  attachDeviceListeners();

  // Fetch power stats for Insight devices (only if online)
  if (!state.isOffline) {
    fetchInsightStats();
  }
}

/**
 * Renders a single device card.
 */
function renderDeviceCard(device) {
  const isOn = device.state === 1;
  const isStandby = device.state === 8;
  const isOffline = !device.isOnline;
  const isInsight = device.deviceType === "Insight";

  let statusText = "Off";
  let statusClass = "";

  if (isOffline) {
    statusText = "Offline";
    statusClass = "is-offline";
  } else if (isOn) {
    statusText = "On";
    statusClass = "is-on";
  } else if (isStandby) {
    statusText = "Standby";
    statusClass = "";
  }

  const iconClass = isOn ? "is-on" : isStandby ? "is-standby" : "";

  // Power stats section for Insight devices
  const powerStatsHtml =
    isInsight && !isOffline
      ? `
      <div class="power-stats" data-power-stats="${escapeHtml(device.id)}">
        <div class="power-stat">
          <div class="power-stat-value" data-power-current>--</div>
          <div class="power-stat-label">Watts</div>
        </div>
        <div class="power-stat">
          <div class="power-stat-value" data-power-today>--</div>
          <div class="power-stat-label">kWh Today</div>
        </div>
      </div>
    `
      : "";

  return `
    <div class="card device-card ${isInsight ? "device-card-insight" : ""}" data-device-id="${escapeHtml(device.id)}" data-device-type="${escapeHtml(device.deviceType)}">
      <div class="device-card-main">
        <div class="device-icon ${iconClass}">
          ${getDeviceIcon(device.deviceType)}
        </div>
        <div class="device-info">
          <div class="device-name">${escapeHtml(device.name)}</div>
          <div class="device-status ${statusClass}">${statusText}</div>
        </div>
        <label class="toggle">
          <input 
            type="checkbox" 
            ${isOn ? "checked" : ""} 
            ${isOffline ? "disabled" : ""}
            data-action="toggle"
          >
          <span class="toggle-track"></span>
        </label>
      </div>
      ${powerStatsHtml}
    </div>
  `;
}

/**
 * Gets the icon SVG for a device type.
 */
function getDeviceIcon(_deviceType) {
  // Power plug icon for all types
  return `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2v10"/>
      <path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>
    </svg>
  `;
}

/**
 * Renders the empty state with first-run setup options.
 */
function renderEmptyState() {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v10"/>
          <path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>
        </svg>
      </div>
      <h2 class="empty-state-title">Welcome to Open Wemo</h2>
      <p class="empty-state-text">
        Get started by adding your WeMo devices.
      </p>
      <div class="empty-state-actions">
        <button class="btn btn-primary" id="discover-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
          Find Devices on Network
        </button>
        <button class="btn" id="setup-new-device-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
          Set Up New Device
        </button>
      </div>
      <p class="empty-state-hint">
        <strong>Find Devices</strong> - For WeMo devices already on your WiFi<br>
        <strong>Set Up New Device</strong> - For brand new or factory-reset devices
      </p>
    </div>
  `;
}

/**
 * Renders an error state.
 * @param {Error|{message?: string}} error - The error to display
 * @returns {string} HTML string for the error state
 */
// biome-ignore lint/correctness/noUnusedVariables: May be used for error boundary expansion
function renderError(error) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon text-error">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h2 class="empty-state-title">Connection Error</h2>
      <p class="empty-state-text">
        ${escapeHtml(error.message || "Unable to connect to the bridge.")}
      </p>
      <button class="btn btn-primary" id="retry-btn">
        Try Again
      </button>
    </div>
  `;
}

/**
 * Renders the offline state (no cached data).
 */
function renderOfflineState() {
  return `
    <div class="empty-state offline-state">
      <div class="empty-state-icon text-error">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <line x1="12" y1="20" x2="12.01" y2="20"/>
        </svg>
      </div>
      <h2 class="empty-state-title">Bridge Offline</h2>
      <p class="empty-state-text">
        Make sure Open Wemo is running on your computer and connected to the same network.
      </p>
      <button class="btn btn-primary" id="retry-connection-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
        Retry Connection
      </button>
      <p class="offline-retry-hint">Automatically retrying every 10 seconds...</p>
    </div>
  `;
}

/**
 * Renders the offline banner (when we have cached data).
 */
function renderOfflineBanner() {
  const timeAgo = formatRelativeTime(state.lastUpdated);

  return `
    <div class="offline-banner">
      <div class="offline-banner-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        </svg>
      </div>
      <div class="offline-banner-text">
        <strong>Bridge Offline</strong>
        <span>Last updated ${timeAgo}</span>
      </div>
      <button class="btn btn-sm" id="retry-connection-btn">Retry</button>
    </div>
  `;
}

// ============================================
// Setup Mode Rendering
// ============================================

/**
 * Renders the setup mode UI for configuring new Wemo devices.
 */
function renderSetupMode() {
  const deviceInfoPanelHtml = renderDeviceInfoPanel();
  const parsedInfoHtml = renderParsedDeviceInfo();
  const wifiFormHtml = renderWifiCredentialsForm();

  return `
    <div class="setup-mode">
      <div class="setup-mode-header">
        <div class="setup-mode-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
        </div>
        <h1 class="setup-mode-title">Device Setup Mode</h1>
        <p class="setup-mode-subtitle">
          Connected to Wemo device access point. Follow the steps below to configure your device.
        </p>
        <div class="setup-mode-target">${WEMO_SETUP_URL}</div>
      </div>

      ${deviceInfoPanelHtml}

      <div class="device-info-paste-section">
        <label class="device-info-paste-label" for="device-info-paste">
          Step 2: Paste the copied text here
        </label>
        <textarea 
          id="device-info-paste" 
          class="device-info-paste-area" 
          placeholder="Select all the text shown above, copy it, then paste here..."
          aria-describedby="paste-instructions"
        >${escapeHtml(state.deviceInfo.pastedText)}</textarea>
        <span id="paste-instructions" class="sr-only">
          After copying the device information from the panel above, paste it here to extract the serial number and MAC address.
        </span>
      </div>

      ${parsedInfoHtml}

      ${wifiFormHtml}

      <div class="setup-mode-back">
        <button class="btn" id="back-to-normal-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Device List
        </button>
      </div>
    </div>
  `;
}

/**
 * Renders the device info panel with object tag for setup.xml.
 */
function renderDeviceInfoPanel() {
  return `
    <div class="device-info-panel">
      <h2 class="device-info-panel-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        Step 1: Copy Device Information
      </h2>
      <div class="device-info-instructions">
        <p>The device information is displayed below. Due to browser security, we cannot read it directly.</p>
        <ol>
          <li><strong>Long-press</strong> (mobile) or <strong>triple-click</strong> (desktop) to select all text in the box below</li>
          <li><strong>Copy</strong> the selected text</li>
          <li><strong>Paste</strong> it into the text area in Step 2</li>
        </ol>
      </div>
      <div class="device-info-object-container" id="device-info-object-container">
        <span class="device-info-object-label">Device Info (setup.xml)</span>
        <!-- Object tag will be inserted here by JS -->
      </div>
    </div>
  `;
}

/**
 * Renders the parsed device info display.
 */
function renderParsedDeviceInfo() {
  const { serial, mac, raw } = state.deviceInfo;

  // If nothing parsed yet
  if (!serial && !mac && !state.deviceInfo.pastedText) {
    return "";
  }

  // If text was pasted but nothing found
  if (state.deviceInfo.pastedText && !serial && !mac) {
    return `
      <div class="device-info-parsed is-error">
        <div class="device-info-parsed-title is-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          Could not find device info
        </div>
        <p style="font-size: var(--font-size-sm); color: var(--color-text-muted); margin-top: var(--spacing-sm);">
          Make sure you copied all the text from the device info panel above. 
          The text should contain SerialNumber and MacAddress values.
        </p>
      </div>
    `;
  }

  // Show parsed results
  const friendlyName = raw.friendlyName || "Unknown";

  return `
    <div class="device-info-parsed is-success">
      <div class="device-info-parsed-title is-success">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Device Information Found
      </div>
      ${
        serial
          ? `
        <div class="device-info-parsed-row">
          <span class="device-info-parsed-label">Serial Number</span>
          <span class="device-info-parsed-value">${escapeHtml(serial)}</span>
        </div>
      `
          : ""
      }
      ${
        mac
          ? `
        <div class="device-info-parsed-row">
          <span class="device-info-parsed-label">MAC Address</span>
          <span class="device-info-parsed-value">${escapeHtml(mac)}</span>
        </div>
      `
          : ""
      }
      ${
        raw.friendlyName
          ? `
        <div class="device-info-parsed-row">
          <span class="device-info-parsed-label">Device Name</span>
          <span class="device-info-parsed-value">${escapeHtml(friendlyName)}</span>
        </div>
      `
          : ""
      }
      ${
        raw.modelName
          ? `
        <div class="device-info-parsed-row">
          <span class="device-info-parsed-label">Model</span>
          <span class="device-info-parsed-value">${escapeHtml(raw.modelName)}</span>
        </div>
      `
          : ""
      }
    </div>
  `;
}

/**
 * Renders the WiFi credentials form.
 * Only shows when device info (serial and MAC) has been parsed.
 */
function renderWifiCredentialsForm() {
  const { serial, mac } = state.deviceInfo;
  const { ssid, password, securityType, sending, sent, error } = state.wifiSetup;

  // Don't show form until we have device info
  if (!serial || !mac) {
    return "";
  }

  // If setup was sent successfully, show success message
  if (sent) {
    return `
      <div class="wifi-setup-success">
        <div class="wifi-setup-success-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h3 class="wifi-setup-success-title">Setup Command Sent!</h3>
        <p class="wifi-setup-success-text">
          The device is now attempting to connect to <strong>${escapeHtml(ssid)}</strong>.
        </p>
        <div class="wifi-setup-next-steps">
          <h4>Next Steps:</h4>
          <ol>
            <li>Wait about <strong>30 seconds</strong> for the device to connect</li>
            <li>Switch your phone back to your <strong>home WiFi</strong> network</li>
            <li>Return to this app and tap <strong>"Discover Devices"</strong></li>
          </ol>
        </div>
        <div class="wifi-setup-actions">
          <button class="btn btn-primary" id="wifi-setup-done-btn">
            Got It - Back to Home
          </button>
        </div>
      </div>
    `;
  }

  return `
    <div class="wifi-setup-form-panel">
      <h2 class="wifi-setup-form-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <line x1="12" y1="20" x2="12.01" y2="20"/>
        </svg>
        Step 3: Enter Your WiFi Credentials
      </h2>
      
      ${error ? `<div class="wifi-setup-error">${escapeHtml(error)}</div>` : ""}

      <form id="wifi-setup-form" class="wifi-setup-form">
        <div class="wifi-setup-disclaimer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>Enter your WiFi credentials <strong>exactly</strong> as they appear, including uppercase letters, numbers, and spaces.</span>
        </div>

        <div class="wifi-setup-field">
          <label for="wifi-ssid" class="wifi-setup-label">WiFi Network Name (SSID)</label>
          <input 
            type="text" 
            id="wifi-ssid" 
            class="wifi-setup-input"
            value="${escapeHtml(ssid)}"
            placeholder="Enter your WiFi network name exactly"
            required
            autocomplete="off"
            ${sending ? "disabled" : ""}
          />
          <span class="wifi-setup-hint">Case-sensitive - must match exactly</span>
        </div>

        <div class="wifi-setup-field">
          <label for="wifi-password" class="wifi-setup-label">WiFi Password</label>
          <div class="wifi-setup-password-wrapper">
            <input 
              type="password" 
              id="wifi-password" 
              class="wifi-setup-input wifi-setup-password-input"
              value="${escapeHtml(password)}"
              placeholder="Enter your WiFi password"
              minlength="8"
              required
              autocomplete="off"
              ${sending ? "disabled" : ""}
            />
            <button 
              type="button" 
              class="wifi-setup-password-toggle" 
              id="wifi-password-toggle"
              aria-label="Show password"
              ${sending ? "disabled" : ""}
            >
              <svg class="icon-eye" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg class="icon-eye-off hidden" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
          <span class="wifi-setup-hint">Password must be at least 8 characters</span>
        </div>

        <div class="wifi-setup-field">
          <label for="wifi-security" class="wifi-setup-label">Security Type</label>
          <select id="wifi-security" class="wifi-setup-select" ${sending ? "disabled" : ""}>
            <option value="WPA2/AES" ${securityType === "WPA2/AES" ? "selected" : ""}>WPA2 / AES (Recommended)</option>
            <option value="WPA/TKIP" ${securityType === "WPA/TKIP" ? "selected" : ""}>WPA / TKIP</option>
            <option value="WPA/AES" ${securityType === "WPA/AES" ? "selected" : ""}>WPA / AES</option>
            <option value="OPEN/NONE" ${securityType === "OPEN/NONE" ? "selected" : ""}>Open (No Password)</option>
          </select>
        </div>

        <div class="wifi-setup-device-info">
          <span class="wifi-setup-device-info-label">Configuring device:</span>
          <span class="wifi-setup-device-info-value">${escapeHtml(serial)}</span>
        </div>

        <div class="wifi-setup-actions">
          <button type="submit" class="btn btn-primary wifi-setup-submit" ${sending ? "disabled" : ""}>
            ${sending ? '<span class="spinner spinner-sm"></span> Sending...' : "Connect Device to WiFi"}
          </button>
        </div>
      </form>
    </div>
  `;
}

/**
 * Renders the test results list.
 */
function renderTestResults() {
  if (state.testResults.length === 0 && !state.testsRunning) {
    return `
      <div class="test-result-item">
        <div class="test-result-icon is-pending">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div class="test-result-content">
          <div class="test-result-name">Tests not run yet</div>
          <div class="test-result-message">Click "Run Tests Again" to start connectivity tests</div>
        </div>
      </div>
    `;
  }

  // Define all tests in order (using shared constants)
  const allTests = [
    { name: TEST_NAMES.NO_CORS_GET },
    { name: TEST_NAMES.CORS_GET },
    { name: TEST_NAMES.FETCH_SCRIPT_TAG },
    { name: TEST_NAMES.FETCH_OBJECT_TAG },
    { name: TEST_NAMES.JSONP_CALLBACK },
    { name: TEST_NAMES.SOAP_POST },
    { name: TEST_NAMES.SOAP_TEXT_PLAIN },
    { name: TEST_NAMES.SOAP_FORM_URLENCODED },
    { name: TEST_NAMES.SEND_BEACON },
    { name: TEST_NAMES.WEBSOCKET_PROBE },
    { name: TEST_NAMES.WIFI_SETUP },
  ];

  return allTests
    .map((test) => {
      const result = state.testResults.find((r) => r.name === test.name);

      if (!result) {
        // Test hasn't run yet
        const isPending = state.testsRunning;
        return `
          <div class="test-result-item ${isPending ? "is-running" : ""}">
            <div class="test-result-icon ${isPending ? "is-running" : "is-pending"}">
              ${
                isPending
                  ? '<span class="spinner spinner-sm"></span>'
                  : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                </svg>`
              }
            </div>
            <div class="test-result-content">
              <div class="test-result-name">${escapeHtml(test.name)}</div>
              <div class="test-result-message">${isPending ? "Waiting..." : "Pending"}</div>
            </div>
          </div>
        `;
      }

      const statusClass = result.success ? "is-pass" : "is-fail";
      const iconSvg = result.success
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>`;

      const detailsHtml = result.details
        ? `<div class="test-result-details">${escapeHtml(result.details)}</div>`
        : "";

      const durationHtml = result.duration
        ? `<span class="test-result-duration">${result.duration}ms</span>`
        : "";

      return `
        <div class="test-result-item ${statusClass}">
          <div class="test-result-icon ${statusClass}">
            ${iconSvg}
          </div>
          <div class="test-result-content">
            <div class="test-result-name">${escapeHtml(result.name)}</div>
            <div class="test-result-message">${escapeHtml(result.message)}</div>
            ${detailsHtml}
          </div>
          ${durationHtml}
        </div>
      `;
    })
    .join("");
}

/**
 * Renders the test summary.
 * @deprecated Kept for potential future CORS test UI restoration
 */
// biome-ignore lint/correctness/noUnusedVariables: Preserved for potential debug UI
function renderTestSummary() {
  if (state.testResults.length === 0) {
    return "";
  }

  const passCount = state.testResults.filter((r) => r.success).length;
  const failCount = state.testResults.filter((r) => !r.success).length;

  return `
    <div class="test-summary">
      <div class="test-summary-stat">
        <div class="test-summary-value is-pass">${passCount}</div>
        <div class="test-summary-label">Passed</div>
      </div>
      <div class="test-summary-stat">
        <div class="test-summary-value is-fail">${failCount}</div>
        <div class="test-summary-label">Failed</div>
      </div>
    </div>
  `;
}

/**
 * Attaches event listeners for setup mode UI.
 */
function attachSetupModeListeners() {
  const backBtn = document.getElementById("back-to-normal-btn");
  const pasteArea = document.getElementById("device-info-paste");
  const objectContainer = document.getElementById("device-info-object-container");
  const wifiForm = document.getElementById("wifi-setup-form");
  const wifiDoneBtn = document.getElementById("wifi-setup-done-btn");

  if (backBtn) {
    backBtn.addEventListener("click", handleBackToNormal);
  }

  // Set up paste textarea listener
  if (pasteArea) {
    pasteArea.addEventListener("input", handleDeviceInfoPaste);
    // Also handle paste event for immediate processing
    pasteArea.addEventListener("paste", (e) => {
      // Let the default paste happen, then process
      setTimeout(() => handleDeviceInfoPaste(e), 0);
    });
  }

  // Insert the object tag for displaying setup.xml
  if (objectContainer) {
    const objectTag = createDeviceInfoObjectTag();
    objectContainer.appendChild(objectTag);

    // Handle object load error
    objectTag.onerror = () => {
      console.warn("[SetupMode] Failed to load device info via object tag");
      objectContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--color-text-muted);">
          <p>Unable to load device information.</p>
          <p style="font-size: var(--font-size-sm);">Make sure you're connected to the Wemo device's WiFi network.</p>
        </div>
      `;
    };
  }

  // WiFi credentials form submission
  if (wifiForm) {
    wifiForm.addEventListener("submit", handleWifiFormSubmit);

    // Track form field changes
    const ssidInput = document.getElementById("wifi-ssid");
    const passwordInput = document.getElementById("wifi-password");
    const securitySelect = document.getElementById("wifi-security");

    if (ssidInput) {
      ssidInput.addEventListener("input", (e) => {
        state.wifiSetup.ssid = e.target.value;
      });
    }
    if (passwordInput) {
      passwordInput.addEventListener("input", (e) => {
        state.wifiSetup.password = e.target.value;
      });
    }
    if (securitySelect) {
      securitySelect.addEventListener("change", (e) => {
        state.wifiSetup.securityType = e.target.value;
      });
    }
  }

  // "Done" button after successful setup
  if (wifiDoneBtn) {
    wifiDoneBtn.addEventListener("click", handleWifiSetupDone);
  }
}

/**
 * Handles paste/input in the device info textarea.
 */
function handleDeviceInfoPaste(event) {
  const textarea = event.target;
  const text = textarea.value;

  // Update state
  state.deviceInfo.pastedText = text;

  // Parse the text
  const parsed = parseDeviceInfoFromText(text);
  state.deviceInfo.serial = parsed.serial;
  state.deviceInfo.mac = parsed.mac;
  state.deviceInfo.raw = parsed.raw;

  // Update the parsed info display
  const parsedContainer = document.querySelector(".device-info-parsed");
  if (parsedContainer) {
    parsedContainer.outerHTML = renderParsedDeviceInfo();
  } else {
    // Insert after paste section if not present
    const pasteSection = document.querySelector(".device-info-paste-section");
    if (pasteSection) {
      pasteSection.insertAdjacentHTML("afterend", renderParsedDeviceInfo());
    }
  }

  // Announce to screen readers
  if (parsed.serial || parsed.mac) {
    announceToScreenReader(
      `Found device info: Serial ${parsed.serial || "not found"}, MAC ${parsed.mac || "not found"}`
    );
  }

  // Show WiFi form if device info found (re-render to add the form)
  if (parsed.serial && parsed.mac) {
    const wifiFormContainer = document.querySelector(".wifi-setup-form-panel");
    if (!wifiFormContainer) {
      // Insert WiFi form after parsed info
      const parsedInfo = document.querySelector(".device-info-parsed");
      if (parsedInfo) {
        parsedInfo.insertAdjacentHTML("afterend", renderWifiCredentialsForm());
        // Re-attach listeners for the new form
        attachWifiFormListeners();

        // Smooth scroll to show the WiFi form
        setTimeout(() => {
          const wifiForm = document.querySelector(".wifi-setup-form-panel");
          if (wifiForm) {
            wifiForm.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 100);
      }
    }
  }
}

/**
 * Attaches event listeners specifically for the WiFi form.
 * Called after form is dynamically inserted.
 */
function attachWifiFormListeners() {
  const wifiForm = document.getElementById("wifi-setup-form");
  const ssidInput = document.getElementById("wifi-ssid");
  const passwordInput = document.getElementById("wifi-password");
  const passwordToggle = document.getElementById("wifi-password-toggle");
  const securitySelect = document.getElementById("wifi-security");

  if (wifiForm) {
    wifiForm.addEventListener("submit", handleWifiFormSubmit);
  }
  if (ssidInput) {
    ssidInput.addEventListener("input", (e) => {
      state.wifiSetup.ssid = e.target.value;
    });
  }
  if (passwordInput) {
    passwordInput.addEventListener("input", (e) => {
      state.wifiSetup.password = e.target.value;
    });
  }
  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";

      // Toggle icons
      const eyeIcon = passwordToggle.querySelector(".icon-eye");
      const eyeOffIcon = passwordToggle.querySelector(".icon-eye-off");
      if (eyeIcon && eyeOffIcon) {
        eyeIcon.classList.toggle("hidden", !isPassword);
        eyeOffIcon.classList.toggle("hidden", isPassword);
      }

      // Update aria-label
      passwordToggle.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
    });
  }
  if (securitySelect) {
    securitySelect.addEventListener("change", (e) => {
      state.wifiSetup.securityType = e.target.value;
    });
  }
}

/**
 * Handles WiFi credentials form submission.
 */
async function handleWifiFormSubmit(event) {
  event.preventDefault();

  const { ssid, password, securityType } = state.wifiSetup;
  const { serial, mac } = state.deviceInfo;

  // Validate
  if (!ssid.trim()) {
    state.wifiSetup.error = "Please enter your WiFi network name";
    updateWifiFormUI();
    return;
  }

  if (securityType !== "OPEN/NONE" && password.length < 8) {
    state.wifiSetup.error = "Password must be at least 8 characters";
    updateWifiFormUI();
    return;
  }

  // Parse security type
  const [auth, encrypt] = securityType.split("/");
  const authMode = auth === "OPEN" ? AuthMode.OPEN : auth === "WPA" ? AuthMode.WPA : AuthMode.WPA2;
  const encryptType =
    encrypt === "NONE" ? EncryptType.NONE : encrypt === "TKIP" ? EncryptType.TKIP : EncryptType.AES;

  // Clear error and set sending state
  state.wifiSetup.error = null;
  state.wifiSetup.sending = true;
  updateWifiFormUI();

  console.log("[App] Sending WiFi setup command...", {
    ssid,
    auth: authMode,
    encrypt: encryptType,
  });

  // Send the setup command
  const result = await sendWifiSetupCommand({
    ssid: ssid.trim(),
    password,
    mac,
    serial,
    auth: authMode,
    encrypt: encryptType,
    channel: 0, // Auto
    // Use method 3 with lengths for devices with binaryOption=1 (common for newer devices)
    method: EncryptionMethod.METHOD_3,
    addLengths: true,
  });

  state.wifiSetup.sending = false;

  if (result.success) {
    state.wifiSetup.sent = true;
    showToast("Setup command sent!", "success");
    announceToScreenReader(
      "WiFi setup command sent successfully. Follow the next steps to complete setup."
    );
  } else {
    state.wifiSetup.error = result.message;
    showToast(result.message, "error");
  }

  updateWifiFormUI();
}

/**
 * Updates the WiFi form UI without full re-render.
 */
function updateWifiFormUI() {
  const formPanel = document.querySelector(".wifi-setup-form-panel");

  if (state.wifiSetup.sent) {
    // Replace form with success message
    if (formPanel) {
      formPanel.outerHTML = renderWifiCredentialsForm();
      // Attach done button listener
      const doneBtn = document.getElementById("wifi-setup-done-btn");
      if (doneBtn) {
        doneBtn.addEventListener("click", handleWifiSetupDone);
      }
    }
  } else if (formPanel) {
    // Update error display
    const errorDiv = formPanel.querySelector(".wifi-setup-error");
    if (state.wifiSetup.error) {
      if (errorDiv) {
        errorDiv.textContent = state.wifiSetup.error;
      } else {
        const title = formPanel.querySelector(".wifi-setup-form-title");
        if (title) {
          title.insertAdjacentHTML(
            "afterend",
            `<div class="wifi-setup-error">${escapeHtml(state.wifiSetup.error)}</div>`
          );
        }
      }
    } else if (errorDiv) {
      errorDiv.remove();
    }

    // Update button state
    const submitBtn = formPanel.querySelector(".wifi-setup-submit");
    if (submitBtn) {
      submitBtn.disabled = state.wifiSetup.sending;
      submitBtn.innerHTML = state.wifiSetup.sending
        ? '<span class="spinner spinner-sm"></span> Sending...'
        : "Connect Device to WiFi";
    }

    // Update input states
    const inputs = formPanel.querySelectorAll("input, select");
    for (const input of inputs) {
      input.disabled = state.wifiSetup.sending;
    }
  }
}

/**
 * Handles the "Done" button after successful WiFi setup.
 */
function handleWifiSetupDone() {
  // Reset setup state
  state.wifiSetup = {
    ssid: "",
    password: "",
    securityType: "WPA2/AES",
    sending: false,
    sent: false,
    error: null,
  };
  state.deviceInfo = {
    serial: null,
    mac: null,
    raw: {},
    pastedText: "",
  };

  // Go back to normal mode
  handleBackToNormal();
}

/**
 * Runs the CORS connectivity tests.
 */
async function handleRunTests() {
  // Guard against double-click race condition
  if (state.testsRunning) return;

  state.testsRunning = true;
  state.testResults = [];
  renderDevices();

  try {
    for await (const result of runAllTests()) {
      state.testResults.push(result);
      // Update UI after each test
      const listEl = document.getElementById("test-results-list");
      if (listEl) {
        listEl.innerHTML = renderTestResults();
      }
      // Announce result to screen readers
      const status = result.success ? "passed" : "failed";
      announceToScreenReader(`Test ${result.name} ${status}`);
    }
  } catch (error) {
    console.error("[App] Test error:", error);
    showToast(`Test error: ${error.message}`, "error");
  } finally {
    state.testsRunning = false;
    renderDevices();
  }
}

/**
 * Copies test results to clipboard.
 * @deprecated Kept for potential future CORS test UI restoration
 */
// biome-ignore lint/correctness/noUnusedVariables: Preserved for potential debug UI
async function handleCopyResults() {
  try {
    const text = formatTestResults(state.testResults);
    await navigator.clipboard.writeText(text);
    showToast("Results copied to clipboard", "success");
  } catch (error) {
    console.error("[App] Copy failed:", error);
    showToast("Failed to copy results", "error");
  }
}

/**
 * Returns to normal mode (device list).
 */
function handleBackToNormal() {
  state.networkMode = NetworkMode.NORMAL;
  state.testResults = [];
  state.testsRunning = false;
  loadDevices();
}

/**
 * Enters setup mode manually (for testing or when Add Device detects Wemo AP).
 */
function enterSetupMode() {
  state.networkMode = NetworkMode.SETUP_MODE;
  state.testResults = [];
  state.testsRunning = false;
  state.loading = false;
  renderDevices();
  // Auto-start tests
  handleRunTests();
}

// ============================================
// Power Stats (Insight Devices)
// ============================================

/**
 * Fetches power stats for all Insight devices.
 */
async function fetchInsightStats() {
  const insightDevices = state.devices.filter((d) => d.deviceType === "Insight" && d.isOnline);

  // Fetch in parallel
  await Promise.all(insightDevices.map(fetchDevicePowerStats));
}

/**
 * Fetches and displays power stats for a single device.
 */
async function fetchDevicePowerStats(device) {
  const statsEl = document.querySelector(`[data-power-stats="${device.id}"]`);
  if (!statsEl) return;

  try {
    const result = await api.getInsightData(device.id);
    const { power } = result;

    // Update the display
    const currentEl = statsEl.querySelector("[data-power-current]");
    const todayEl = statsEl.querySelector("[data-power-today]");

    if (currentEl) {
      currentEl.textContent = formatPower(power.currentWatts);
    }
    if (todayEl) {
      todayEl.textContent = formatEnergy(power.todayKwh);
    }
  } catch (error) {
    console.warn(`[App] Failed to fetch power stats for ${device.id}:`, error);
    // Leave as "--" on error
  }
}

/**
 * Formats power value (watts) for display.
 */
function formatPower(watts) {
  if (watts < 1) {
    return "< 1";
  }
  if (watts < 10) {
    return watts.toFixed(1);
  }
  return Math.round(watts).toString();
}

/**
 * Formats energy value (kWh) for display.
 */
function formatEnergy(kwh) {
  if (kwh < 0.01) {
    return "< 0.01";
  }
  if (kwh < 1) {
    return kwh.toFixed(2);
  }
  if (kwh < 10) {
    return kwh.toFixed(1);
  }
  return Math.round(kwh).toString();
}

// ============================================
// Event Handlers
// ============================================

/**
 * Attaches event listeners to device cards.
 */
function attachDeviceListeners() {
  // Toggle switches
  for (const toggle of $app.querySelectorAll('[data-action="toggle"]')) {
    toggle.addEventListener("change", handleToggle);
  }

  // Discover button
  const discoverBtn = document.getElementById("discover-btn");
  if (discoverBtn) {
    discoverBtn.addEventListener("click", handleDiscover);
  }

  // Setup new device button (for devices in AP mode)
  const setupNewDeviceBtn = document.getElementById("setup-new-device-btn");
  if (setupNewDeviceBtn) {
    setupNewDeviceBtn.addEventListener("click", handleSetupNewDevice);
  }

  // Retry button (error state)
  const retryBtn = document.getElementById("retry-btn");
  if (retryBtn) {
    retryBtn.addEventListener("click", loadDevices);
  }

  // Retry connection button (offline state)
  const retryConnectionBtn = document.getElementById("retry-connection-btn");
  if (retryConnectionBtn) {
    retryConnectionBtn.addEventListener("click", handleRetryConnection);
  }
}

/**
 * Handles device toggle.
 */
async function handleToggle(event) {
  const toggle = event.target;
  const card = toggle.closest("[data-device-id]");
  const deviceId = card.dataset.deviceId;

  // Haptic feedback on mobile
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }

  // Disable toggle while processing
  toggle.disabled = true;

  try {
    const result = await api.toggle(deviceId);

    // Update local state
    const device = state.devices.find((d) => d.id === deviceId);
    if (device) {
      device.state = result.state;
      device.isOnline = true;
    }

    // Update UI
    toggle.checked = result.isOn;
    updateDeviceCardState(card, result.state);

    // Success haptic
    if (navigator.vibrate) {
      navigator.vibrate([10, 50, 10]);
    }
  } catch (error) {
    console.error("[App] Toggle failed:", error);

    // Revert toggle state
    toggle.checked = !toggle.checked;

    // Error haptic
    if (navigator.vibrate) {
      navigator.vibrate([50, 50, 50]);
    }

    showToast(error.message || "Failed to toggle device", "error");
  } finally {
    toggle.disabled = false;
  }
}

/**
 * Updates a device card's visual state.
 */
function updateDeviceCardState(card, binaryState) {
  const isOn = binaryState === 1;
  const isStandby = binaryState === 8;

  const icon = card.querySelector(".device-icon");
  const status = card.querySelector(".device-status");

  icon.classList.remove("is-on", "is-standby");
  status.classList.remove("is-on", "is-offline");

  if (isOn) {
    icon.classList.add("is-on");
    status.classList.add("is-on");
    status.textContent = "On";
  } else if (isStandby) {
    icon.classList.add("is-standby");
    status.textContent = "Standby";
  } else {
    status.textContent = "Off";
  }
}

// ============================================
// Discovery Modal
// ============================================

let discoveredDevices = [];
const selectedDeviceIds = new Set();

/**
 * Opens the discovery modal.
 */
function openDiscoveryModal() {
  discoveredDevices = [];
  selectedDeviceIds.clear();
  renderDiscoveryScanning();
  $discoveryModal.classList.remove("hidden");
  trapFocus($discoveryModal);
  startDiscovery();
  announceToScreenReader("Device discovery started");
}

/**
 * Closes the discovery modal.
 */
function closeDiscoveryModal() {
  $discoveryModal.classList.add("hidden");
}

/**
 * Renders the scanning state.
 */
function renderDiscoveryScanning() {
  $discoveryContent.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Scanning network for WeMo devices...</p>
    </div>
  `;
  $discoveryFooter.innerHTML = `
    <button class="btn" id="discovery-cancel">Cancel</button>
  `;
  document.getElementById("discovery-cancel")?.addEventListener("click", closeDiscoveryModal);
}

/**
 * Renders the discovery results.
 */
function renderDiscoveryResults() {
  if (discoveredDevices.length === 0) {
    $discoveryContent.innerHTML = `
      <div class="empty-state">
        <p class="text-muted">No devices found on the network.</p>
        <p class="text-muted" style="font-size: var(--font-size-sm);">
          Make sure your WeMo devices are powered on and connected to the same network.
        </p>
      </div>
    `;
    $discoveryFooter.innerHTML = `
      <button class="btn" id="discovery-retry">Scan Again</button>
      <button class="btn" id="discovery-close-btn">Close</button>
    `;
    document.getElementById("discovery-retry")?.addEventListener("click", () => {
      renderDiscoveryScanning();
      startDiscovery();
    });
    document.getElementById("discovery-close-btn")?.addEventListener("click", closeDiscoveryModal);
    return;
  }

  const savedIds = new Set(state.devices.map((d) => d.id));

  $discoveryContent.innerHTML = `
    <div class="discovery-list">
      ${discoveredDevices
        .map((device) => {
          const isSaved = savedIds.has(device.id);
          return `
          <label class="discovery-item ${isSaved ? "is-saved" : ""}">
            <input 
              type="checkbox" 
              class="discovery-checkbox"
              data-device-id="${escapeHtml(device.id)}"
              ${isSaved ? "disabled" : ""}
              ${selectedDeviceIds.has(device.id) ? "checked" : ""}
            >
            <div class="discovery-info">
              <div class="discovery-name">${escapeHtml(device.name)}</div>
              <div class="discovery-details">${escapeHtml(device.host)} - ${escapeHtml(device.deviceType)}</div>
            </div>
            ${isSaved ? '<span class="discovery-badge is-saved">Saved</span>' : ""}
          </label>
        `;
        })
        .join("")}
    </div>
  `;

  const newDevices = discoveredDevices.filter((d) => !savedIds.has(d.id));
  const hasNewDevices = newDevices.length > 0;

  $discoveryFooter.innerHTML = `
    <button class="btn" id="discovery-retry">Scan Again</button>
    <button class="btn btn-primary" id="discovery-add" ${!hasNewDevices ? "disabled" : ""}>
      Add Selected
    </button>
  `;

  // Attach listeners
  document.getElementById("discovery-retry")?.addEventListener("click", () => {
    renderDiscoveryScanning();
    startDiscovery();
  });
  document.getElementById("discovery-add")?.addEventListener("click", handleAddSelected);

  // Checkbox listeners
  for (const checkbox of $discoveryContent.querySelectorAll(".discovery-checkbox")) {
    checkbox.addEventListener("change", (e) => {
      const id = e.target.dataset.deviceId;
      if (e.target.checked) {
        selectedDeviceIds.add(id);
      } else {
        selectedDeviceIds.delete(id);
      }
      updateAddButton();
    });
  }
}

/**
 * Updates the Add Selected button state.
 */
function updateAddButton() {
  const addBtn = document.getElementById("discovery-add");
  if (addBtn) {
    addBtn.disabled = selectedDeviceIds.size === 0;
  }
}

/**
 * Starts the discovery process.
 */
async function startDiscovery() {
  try {
    const result = await api.discover(10);
    discoveredDevices = result.devices;

    // Auto-select all new devices
    const savedIds = new Set(state.devices.map((d) => d.id));
    for (const device of discoveredDevices) {
      if (!savedIds.has(device.id)) {
        selectedDeviceIds.add(device.id);
      }
    }

    renderDiscoveryResults();
  } catch (error) {
    console.error("[App] Discovery failed:", error);
    $discoveryContent.innerHTML = `
      <div class="empty-state">
        <p class="text-error">${escapeHtml(error.message || "Discovery failed")}</p>
      </div>
    `;
    $discoveryFooter.innerHTML = `
      <button class="btn" id="discovery-retry">Try Again</button>
      <button class="btn" id="discovery-close-btn">Close</button>
    `;
    document.getElementById("discovery-retry")?.addEventListener("click", () => {
      renderDiscoveryScanning();
      startDiscovery();
    });
    document.getElementById("discovery-close-btn")?.addEventListener("click", closeDiscoveryModal);
  }
}

/**
 * Handles adding selected devices.
 */
async function handleAddSelected() {
  const addBtn = document.getElementById("discovery-add");
  if (addBtn) {
    addBtn.disabled = true;
    addBtn.innerHTML = '<span class="spinner spinner-sm"></span> Adding...';
  }

  try {
    const devicesToAdd = discoveredDevices.filter((d) => selectedDeviceIds.has(d.id));

    for (const device of devicesToAdd) {
      await api.saveDevice({
        id: device.id,
        name: device.name,
        host: device.host,
        port: device.port,
        deviceType: device.deviceType,
      });
    }

    showToast(`Added ${devicesToAdd.length} device(s)`, "success");
    closeDiscoveryModal();
    await loadDevices();
  } catch (error) {
    console.error("[App] Failed to add devices:", error);
    showToast(error.message || "Failed to add devices", "error");
    if (addBtn) {
      addBtn.disabled = false;
      addBtn.textContent = "Add Selected";
    }
  }
}

/**
 * Handles device discovery (from empty state button or Add Device button).
 * First checks if we're connected to a Wemo AP for setup mode.
 */
async function handleDiscover() {
  // Check if we might be on a Wemo AP
  const networkMode = await detectNetworkMode();

  if (networkMode === NetworkMode.SETUP_MODE) {
    // User is connected to Wemo AP - enter setup mode
    showToast("Detected Wemo device AP - entering setup mode", "info");
    enterSetupMode();
    return;
  }

  // Normal discovery flow
  openDiscoveryModal();
}

/**
 * Handles "Set Up New Device" button click.
 * Shows instructions for connecting to Wemo AP and enters setup mode.
 */
function handleSetupNewDevice() {
  // Show instructions modal for connecting to Wemo AP
  showSetupInstructionsModal();
}

// ============================================
// Setup Instructions Modal
// ============================================

/**
 * Shows the setup instructions modal.
 */
function showSetupInstructionsModal() {
  if ($setupInstructionsModal) {
    $setupInstructionsModal.classList.remove("hidden");
    trapFocus($setupInstructionsModal);
    announceToScreenReader("Setup instructions opened");
  }
}

/**
 * Hides the setup instructions modal.
 */
function hideSetupInstructionsModal() {
  if ($setupInstructionsModal) {
    $setupInstructionsModal.classList.add("hidden");
  }
}

/**
 * Handles "I'm Connected" button - checks if on Wemo AP and enters setup mode.
 */
async function handleSetupInstructionsContinue() {
  hideSetupInstructionsModal();

  // Show loading toast
  showToast("Checking connection...", "info");

  // Check if we're now on the Wemo AP
  const networkMode = await detectNetworkMode();

  if (networkMode === NetworkMode.SETUP_MODE) {
    showToast("Connected to WeMo device!", "success");
    enterSetupMode();
  } else if (networkMode === NetworkMode.NORMAL) {
    showToast("Still connected to home network. Please connect to the WeMo WiFi first.", "error");
    showSetupInstructionsModal();
  } else {
    showToast(
      "Unable to detect WeMo device. Make sure you're connected to the WeMo WiFi.",
      "error"
    );
    showSetupInstructionsModal();
  }
}

/**
 * Sets up setup instructions modal event listeners.
 */
function setupSetupInstructionsListeners() {
  if ($setupInstructionsClose) {
    $setupInstructionsClose.addEventListener("click", hideSetupInstructionsModal);
  }
  if ($setupInstructionsCancel) {
    $setupInstructionsCancel.addEventListener("click", hideSetupInstructionsModal);
  }
  if ($setupInstructionsContinue) {
    $setupInstructionsContinue.addEventListener("click", handleSetupInstructionsContinue);
  }
  // Close on backdrop click
  $setupInstructionsModal
    ?.querySelector(".modal-backdrop")
    ?.addEventListener("click", hideSetupInstructionsModal);
}

/**
 * Handles refresh button click.
 */
async function handleRefresh() {
  $refreshBtn.disabled = true;
  $refreshBtn.classList.add("animate-pulse");

  try {
    await loadDevices();
    showToast("Devices refreshed", "success");
  } catch (_error) {
    // Error already shown by loadDevices
  } finally {
    $refreshBtn.disabled = false;
    $refreshBtn.classList.remove("animate-pulse");
  }
}

// ============================================
// Data Loading
// ============================================

/**
 * Loads devices from the API.
 */
async function loadDevices() {
  state.loading = true;
  state.error = null;

  try {
    const result = await api.getDevices(true);
    state.devices = result.devices;
    state.error = null;
    state.isOffline = false;
    state.networkMode = NetworkMode.NORMAL;
    state.lastUpdated = Date.now();

    // Cache devices to localStorage
    cacheDevices(result.devices);
  } catch (error) {
    console.error("[App] Failed to load devices:", error);
    state.error = error;
    state.isOffline = true;

    // Detect network mode - are we on Wemo AP?
    const networkMode = await detectNetworkMode();
    state.networkMode = networkMode;

    if (networkMode === NetworkMode.SETUP_MODE) {
      console.log("[App] Detected Wemo AP - entering setup mode");
      state.loading = false;
      renderDevices();
      // Auto-start tests when entering setup mode
      handleRunTests();
      return;
    }

    // Try to load from cache
    const cached = loadCachedDevices();
    if (cached) {
      state.devices = cached.devices;
      state.lastUpdated = cached.timestamp;
      console.log("[App] Loaded cached devices from", new Date(cached.timestamp).toLocaleString());
    } else {
      state.devices = [];
    }
  } finally {
    state.loading = false;
    renderDevices();
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Escapes HTML special characters.
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// Auto-Refresh
// ============================================

let autoRefreshTimer = null;

/**
 * Starts auto-refresh timer.
 */
function startAutoRefresh() {
  stopAutoRefresh();

  const interval = state.settings.refreshInterval;
  if (interval <= 0) {
    console.log("[App] Auto-refresh disabled");
    return;
  }

  autoRefreshTimer = setInterval(async () => {
    // Skip refresh in setup mode - user is selecting text
    if (state.networkMode === NetworkMode.SETUP_MODE) {
      console.log("[App] Auto-refresh skipped (setup mode)");
      return;
    }
    // Only refresh if page is visible
    if (document.visibilityState === "visible" && !state.loading) {
      console.log("[App] Auto-refreshing devices...");
      await loadDevices();
    }
  }, interval);

  console.log(`[App] Auto-refresh started (${interval / 1000}s)`);
}

/**
 * Stops auto-refresh timer.
 */
function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

// ============================================
// Settings Management
// ============================================

const SETTINGS_KEY = "open-wemo-settings";

/**
 * Loads settings from localStorage.
 */
function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      state.settings = { ...state.settings, ...parsed };
    }
  } catch (error) {
    console.warn("[App] Failed to load settings:", error);
  }

  // Apply settings
  applyTheme(state.settings.theme);
  updateSettingsUI();
}

/**
 * Saves settings to localStorage.
 */
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (error) {
    console.warn("[App] Failed to save settings:", error);
  }
}

/**
 * Updates the settings UI to reflect current state.
 */
function updateSettingsUI() {
  // Update refresh interval radios
  const refreshRadios = document.querySelectorAll('input[name="refresh-interval"]');
  for (const radio of refreshRadios) {
    radio.checked = Number.parseInt(radio.value, 10) === state.settings.refreshInterval;
  }

  // Update theme radios
  const themeRadios = document.querySelectorAll('input[name="theme"]');
  for (const radio of themeRadios) {
    radio.checked = radio.value === state.settings.theme;
  }
}

/**
 * Applies the selected theme.
 */
function applyTheme(theme) {
  const html = document.documentElement;

  if (theme === "system") {
    // Check system preference
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    html.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else {
    html.setAttribute("data-theme", theme);
  }

  // Update meta theme-color for mobile browsers
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    const isDark = html.getAttribute("data-theme") === "dark";
    metaTheme.setAttribute("content", isDark ? "#1a1a2e" : "#ffffff");
  }
}

/**
 * Opens the settings modal.
 */
function openSettingsModal() {
  updateSettingsUI();
  updateBridgeStatus();
  $settingsModal.classList.remove("hidden");
}

/**
 * Closes the settings modal.
 */
function closeSettingsModal() {
  $settingsModal.classList.add("hidden");
}

/**
 * Handles refresh interval change.
 */
function handleRefreshIntervalChange(event) {
  const value = Number.parseInt(event.target.value, 10);
  state.settings.refreshInterval = value;
  saveSettings();

  // Restart auto-refresh with new interval
  stopAutoRefresh();
  if (value > 0) {
    startAutoRefresh();
  }

  showToast(`Auto-refresh ${value > 0 ? "updated" : "disabled"}`, "success");
}

/**
 * Handles theme change.
 */
function handleThemeChange(event) {
  const theme = event.target.value;
  state.settings.theme = theme;
  saveSettings();
  applyTheme(theme);
  showToast("Theme updated", "success");
}

/**
 * Updates the bridge status display.
 */
async function updateBridgeStatus() {
  try {
    const response = await fetch("/api/health");
    if (response.ok) {
      $bridgeStatus.innerHTML = `
        <span class="status-dot status-dot-connected"></span>
        Connected
      `;
    } else {
      throw new Error("Not OK");
    }
  } catch {
    $bridgeStatus.innerHTML = `
      <span class="status-dot status-dot-disconnected"></span>
      Disconnected
    `;
  }
}

// ============================================
// Offline Support & Caching
// ============================================

const DEVICES_CACHE_KEY = "open-wemo-devices-cache";
const RETRY_INTERVAL = 10000; // 10 seconds
let retryTimer = null;

/**
 * Caches devices to localStorage.
 */
function cacheDevices(devices) {
  try {
    const cache = {
      devices,
      timestamp: Date.now(),
    };
    localStorage.setItem(DEVICES_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn("[App] Failed to cache devices:", error);
  }
}

/**
 * Loads cached devices from localStorage.
 */
function loadCachedDevices() {
  try {
    const cached = localStorage.getItem(DEVICES_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.warn("[App] Failed to load cached devices:", error);
  }
  return null;
}

/**
 * Formats a relative time string.
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return "never";

  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 120) return "1 minute ago";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 7200) return "1 hour ago";
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return "a while ago";
}

/**
 * Starts the auto-retry timer for offline state.
 */
function startRetryTimer() {
  stopRetryTimer();

  retryTimer = setInterval(async () => {
    if (state.isOffline && document.visibilityState === "visible") {
      console.log("[App] Attempting to reconnect...");
      await loadDevices();

      if (!state.isOffline) {
        showToast("Reconnected to bridge", "success");
        stopRetryTimer();
      }
    }
  }, RETRY_INTERVAL);
}

/**
 * Stops the auto-retry timer.
 */
function stopRetryTimer() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

/**
 * Handles manual retry button click.
 */
async function handleRetryConnection() {
  showToast("Attempting to reconnect...", "info");
  await loadDevices();

  if (!state.isOffline) {
    showToast("Reconnected!", "success");
  } else {
    showToast("Still offline. Will keep trying.", "error");
  }
}

// ============================================
// Accessibility Helpers
// ============================================

/**
 * Traps focus within a modal dialog.
 */
function trapFocus(modal) {
  const focusableElements = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  // Focus first element
  firstFocusable?.focus();

  modal.addEventListener("keydown", function handleTabKey(e) {
    if (e.key === "Tab") {
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    }
  });
}

/**
 * Handles Escape key to close modals.
 */
function setupEscapeKeyHandler() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$settingsModal.classList.contains("hidden")) {
        closeSettingsModal();
      }
      if (!$discoveryModal.classList.contains("hidden")) {
        closeDiscoveryModal();
      }
      if ($iosModal && !$iosModal.classList.contains("hidden")) {
        hideIOSInstallModal();
      }
      const $genericModal = document.getElementById("generic-install-modal");
      if ($genericModal && !$genericModal.classList.contains("hidden")) {
        hideGenericInstallModal();
      }
      if ($qrModal && !$qrModal.classList.contains("hidden")) {
        hideQRModal();
      }
      if ($setupInstructionsModal && !$setupInstructionsModal.classList.contains("hidden")) {
        hideSetupInstructionsModal();
      }
    }
  });
}

/**
 * Announces message to screen readers.
 */
function announceToScreenReader(message) {
  const announcement = document.createElement("div");
  announcement.setAttribute("aria-live", "polite");
  announcement.setAttribute("aria-atomic", "true");
  announcement.className = "sr-only";
  announcement.textContent = message;
  document.body.appendChild(announcement);

  setTimeout(() => announcement.remove(), 1000);
}

/**
 * Sets up settings event listeners.
 */
function setupSettingsListeners() {
  // Open/close modal
  $settingsBtn.addEventListener("click", () => {
    openSettingsModal();
    trapFocus($settingsModal);
  });
  $settingsClose.addEventListener("click", closeSettingsModal);
  $settingsModal.querySelector(".modal-backdrop")?.addEventListener("click", closeSettingsModal);

  // Refresh interval change
  const refreshRadios = document.querySelectorAll('input[name="refresh-interval"]');
  for (const radio of refreshRadios) {
    radio.addEventListener("change", handleRefreshIntervalChange);
  }

  // Theme change
  const themeRadios = document.querySelectorAll('input[name="theme"]');
  for (const radio of themeRadios) {
    radio.addEventListener("change", handleThemeChange);
  }

  // Listen for system theme changes
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.settings.theme === "system") {
      applyTheme("system");
    }
  });

  // Share button (QR code)
  if ($settingsShareBtn) {
    $settingsShareBtn.addEventListener("click", () => {
      closeSettingsModal();
      showQRModal();
    });
  }

  // QR modal close
  if ($qrModalClose) {
    $qrModalClose.addEventListener("click", hideQRModal);
  }
  $qrModal?.querySelector(".modal-backdrop")?.addEventListener("click", hideQRModal);
}

// ============================================
// QR Code Modal
// ============================================

/**
 * Shows the QR code modal and generates the QR code.
 */
function showQRModal() {
  if (!$qrModal) return;

  $qrModal.classList.remove("hidden");
  trapFocus($qrModal);
  generateQRCode();
}

/**
 * Hides the QR code modal.
 */
function hideQRModal() {
  if ($qrModal) {
    $qrModal.classList.add("hidden");
  }
}

/**
 * Generates a QR code for the current URL.
 */
function generateQRCode() {
  if (!$qrCodeContainer || !$qrModalUrl) return;

  // Get the current URL (this will be the bridge URL)
  const url = window.location.origin;
  $qrModalUrl.textContent = url;

  // Clear previous QR code
  $qrCodeContainer.innerHTML = "";

  try {
    // Check if qrcode library is loaded
    if (typeof qrcode === "undefined") {
      throw new Error("QR code library not loaded");
    }

    // Generate QR code using qrcode-generator library
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();

    // Create the QR code as an image
    const img = document.createElement("img");
    img.src = qr.createDataURL(6, 0);
    img.alt = "QR code to install Open Wemo";
    $qrCodeContainer.appendChild(img);
  } catch (error) {
    console.error("[App] Failed to generate QR code:", error);
    $qrCodeContainer.innerHTML = `
      <div class="qr-code-error">
        <p>Could not generate QR code</p>
        <p class="text-muted">${url}</p>
      </div>
    `;
  }
}

// ============================================
// Initialization
// ============================================

async function init() {
  console.log("[App] Initializing Open Wemo...");

  // Load settings from localStorage
  loadSettings();

  // Register service worker
  await registerServiceWorker();

  // Set up PWA install handling
  setupPWAInstall();

  // Attach global event listeners
  $refreshBtn.addEventListener("click", handleRefresh);
  $addDeviceBtn.addEventListener("click", openDiscoveryModal);
  $discoveryClose.addEventListener("click", closeDiscoveryModal);

  // Close modal on backdrop click
  $discoveryModal.querySelector(".modal-backdrop")?.addEventListener("click", closeDiscoveryModal);

  // Set up settings listeners
  setupSettingsListeners();

  // Set up setup instructions modal listeners
  setupSetupInstructionsListeners();

  // Set up accessibility handlers
  setupEscapeKeyHandler();

  // Handle visibility change (pause auto-refresh when tab hidden)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      // Refresh immediately when becoming visible
      loadDevices();
    }
  });

  // Initial load
  await loadDevices();

  // Start auto-refresh (if enabled)
  startAutoRefresh();

  console.log("[App] Initialization complete");
}

// Start the app
init();
