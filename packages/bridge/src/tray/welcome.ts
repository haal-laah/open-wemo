/**
 * First Launch / Welcome Experience
 *
 * Shows a welcome window on first launch to help users set up the app.
 * Includes QR code for phone setup and options for auto-start.
 */

import { getDatabase } from "../db";
import { generateQRCode, getPreferredIp, getServerUrl } from "./qr-window";

/** Settings key for first launch completed */
const FIRST_LAUNCH_KEY = "first_launch_completed";

/** Settings key for "don't show again" preference */
const DONT_SHOW_WELCOME_KEY = "dont_show_welcome";

/**
 * Checks if this is the first launch of the application.
 */
export function isFirstLaunch(): boolean {
  try {
    const db = getDatabase();
    return !db.getBoolSetting(FIRST_LAUNCH_KEY, false);
  } catch {
    // If database fails, assume first launch
    return true;
  }
}

/**
 * Checks if the user has opted to skip the welcome screen.
 */
export function shouldShowWelcome(): boolean {
  try {
    const db = getDatabase();
    const dontShow = db.getBoolSetting(DONT_SHOW_WELCOME_KEY, false);
    const firstLaunchDone = db.getBoolSetting(FIRST_LAUNCH_KEY, false);

    // Show welcome if: first launch OR (not first launch AND user hasn't opted out)
    // Actually, per spec: only show on first launch, unless user dismisses
    return !firstLaunchDone && !dontShow;
  } catch {
    return true;
  }
}

/**
 * Marks the first launch as completed.
 */
export function markFirstLaunchComplete(): void {
  try {
    const db = getDatabase();
    db.setBoolSetting(FIRST_LAUNCH_KEY, true);
    console.log("[Welcome] First launch marked complete");
  } catch (error) {
    console.error("[Welcome] Failed to mark first launch:", error);
  }
}

/**
 * Sets the "don't show welcome again" preference.
 */
export function setDontShowWelcome(value: boolean): void {
  try {
    const db = getDatabase();
    db.setBoolSetting(DONT_SHOW_WELCOME_KEY, value);
  } catch (error) {
    console.error("[Welcome] Failed to save preference:", error);
  }
}

/**
 * Configuration for the welcome page.
 */
export interface WelcomeConfig {
  /** Server port */
  port: number;
  /** Current auto-start setting */
  autoStartEnabled: boolean;
}

/**
 * Generates the welcome page HTML.
 */
export async function generateWelcomeHtml(config: WelcomeConfig): Promise<string> {
  const ip = getPreferredIp();
  const url = getServerUrl(config.port, ip ?? undefined);
  const qrDataUrl = await generateQRCode(url);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Open Wemo</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .container {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 20px;
      padding: 40px;
      text-align: center;
      max-width: 500px;
      width: 100%;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .logo {
      width: 80px;
      height: 80px;
      margin: 0 auto 16px;
    }
    
    .logo svg {
      width: 100%;
      height: 100%;
    }
    
    h1 {
      font-size: 28px;
      margin-bottom: 8px;
      background: linear-gradient(135deg, #4ade80, #22d3ee);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .subtitle {
      color: #94a3b8;
      margin-bottom: 32px;
      font-size: 16px;
    }
    
    .step {
      display: flex;
      align-items: flex-start;
      text-align: left;
      margin-bottom: 24px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 12px;
    }
    
    .step-number {
      background: linear-gradient(135deg, #4ade80, #22d3ee);
      color: #000;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      margin-right: 16px;
      flex-shrink: 0;
    }
    
    .step-content h3 {
      font-size: 16px;
      margin-bottom: 4px;
    }
    
    .step-content p {
      color: #94a3b8;
      font-size: 14px;
    }
    
    .qr-section {
      margin: 24px 0;
    }
    
    .qr-container {
      background: #fff;
      padding: 16px;
      border-radius: 12px;
      display: inline-block;
      margin-bottom: 12px;
    }
    
    .qr-container img {
      display: block;
      width: 200px;
      height: 200px;
    }
    
    .url {
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 14px;
      color: #60a5fa;
      background: rgba(0, 0, 0, 0.3);
      padding: 8px 16px;
      border-radius: 6px;
      display: inline-block;
    }
    
    .options {
      margin: 24px 0;
      text-align: left;
    }
    
    .option {
      display: flex;
      align-items: center;
      padding: 12px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .option:hover {
      background: rgba(0, 0, 0, 0.3);
    }
    
    .option input[type="checkbox"] {
      width: 20px;
      height: 20px;
      margin-right: 12px;
      accent-color: #4ade80;
      cursor: pointer;
    }
    
    .option label {
      cursor: pointer;
      flex: 1;
    }
    
    .option .label-text {
      font-size: 14px;
    }
    
    .option .label-hint {
      font-size: 12px;
      color: #64748b;
    }
    
    .actions {
      margin-top: 24px;
    }
    
    .btn {
      padding: 14px 32px;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #4ade80, #22d3ee);
      color: #000;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(74, 222, 128, 0.3);
    }
    
    .footer {
      margin-top: 24px;
      font-size: 12px;
      color: #64748b;
    }
    
    .footer a {
      color: #60a5fa;
      text-decoration: none;
    }
    
    .footer a:hover {
      text-decoration: underline;
    }

    /* Toast notification */
    .toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #22c55e;
      color: #fff;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      opacity: 0;
      transition: all 0.3s ease;
      z-index: 1000;
    }
    
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
        <rect width="512" height="512" rx="96" fill="#1a1a2e"/>
        <g transform="translate(96, 96)">
          <path d="M160 32v64h-32V32h-48v64H48v48c0 53 43 96 96 96v80h32v-80c53 0 96-43 96-96v-48h-32V32h-48v64h-32V32z" fill="#4ade80"/>
          <circle cx="160" cy="288" r="24" fill="#4ade80"/>
        </g>
      </svg>
    </div>
    <h1>Welcome to Open Wemo!</h1>
    <p class="subtitle">Control your WeMo devices with ease</p>
    
    <div class="step">
      <div class="step-number">1</div>
      <div class="step-content">
        <h3>Bridge is Running</h3>
        <p>The app is now running in your system tray</p>
      </div>
    </div>
    
    <div class="step">
      <div class="step-number">2</div>
      <div class="step-content">
        <h3>Set Up Your Phone</h3>
        <p>Scan this QR code to install the control app</p>
      </div>
    </div>
    
    <div class="qr-section">
      <div class="qr-container">
        <img src="${qrDataUrl}" alt="QR Code">
      </div>
      <div class="url">${url}</div>
    </div>
    
    <div class="options">
      <div class="option" onclick="toggleCheckbox('autostart')">
        <input type="checkbox" id="autostart" ${config.autoStartEnabled ? "checked" : ""}>
        <label for="autostart">
          <div class="label-text">Start Open Wemo on login</div>
          <div class="label-hint">Recommended for always-on control</div>
        </label>
      </div>
      
      <div class="option" onclick="toggleCheckbox('dontshow')">
        <input type="checkbox" id="dontshow">
        <label for="dontshow">
          <div class="label-text">Don't show this again</div>
          <div class="label-hint">You can always access setup from the tray menu</div>
        </label>
      </div>
    </div>
    
    <div class="actions">
      <button class="btn btn-primary" onclick="getStarted()">Get Started</button>
    </div>
    
    <div class="footer">
      <p>Open source project • <a href="https://github.com/haal-laah/open-wemo" target="_blank">View on GitHub</a></p>
    </div>
  </div>
  
  <div class="toast" id="toast">Settings saved!</div>

  <script>
    function toggleCheckbox(id) {
      const checkbox = document.getElementById(id);
      if (event.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
    }
    
    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }
    
    async function getStarted() {
      const autostart = document.getElementById('autostart').checked;
      const dontshow = document.getElementById('dontshow').checked;
      
      try {
        // Save preferences via API
        const response = await fetch('/api/welcome/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ autostart, dontshow })
        });
        
        if (response.ok) {
          showToast('Settings saved!');
          // Close window after short delay
          setTimeout(() => window.close(), 1500);
        } else {
          showToast('Failed to save settings');
        }
      } catch (error) {
        console.error('Error:', error);
        showToast('Error saving settings');
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Creates the welcome page route handler.
 * This can be mounted in the Hono app.
 */
export function createWelcomeRoute(port: number, getAutoStartEnabled: () => boolean) {
  return async (): Promise<Response> => {
    const html = await generateWelcomeHtml({
      port,
      autoStartEnabled: getAutoStartEnabled(),
    });
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  };
}
