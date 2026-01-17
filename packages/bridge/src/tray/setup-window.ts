/**
 * Device Setup Window
 *
 * Multi-step wizard for configuring a new Wemo device's WiFi connection.
 * This must be run from the bridge (laptop/desktop) because browsers cannot
 * send the required SOAP headers due to CORS restrictions.
 *
 * Flow:
 * 1. User connects laptop to Wemo AP (Wemo.XXX.XXX)
 * 2. Bridge detects device and reads setup.xml
 * 3. User enters home WiFi credentials
 * 4. Bridge sends encrypted SOAP command
 * 5. Device connects to home network
 */

/**
 * Setup page configuration.
 */
export interface SetupPageConfig {
  /** Server port for API calls */
  port: number;
}

/**
 * Generates the complete setup page HTML with all 4 steps.
 * Uses client-side JavaScript to manage step transitions.
 */
export function generateSetupPageHtml(config: SetupPageConfig): string {
  const { port } = config;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Open Wemo - Device Setup</title>
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
      max-width: 520px;
      width: 100%;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .logo {
      width: 64px;
      height: 64px;
      margin: 0 auto 16px;
    }
    
    .logo svg {
      width: 100%;
      height: 100%;
    }
    
    h1 {
      font-size: 24px;
      margin-bottom: 8px;
      background: linear-gradient(135deg, #4ade80, #22d3ee);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .subtitle {
      color: #94a3b8;
      margin-bottom: 24px;
      font-size: 14px;
    }
    
    /* Step Indicator */
    .step-indicator {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      margin-bottom: 32px;
    }
    
    .step-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #374151;
      transition: all 0.3s ease;
    }
    
    .step-dot.active {
      background: linear-gradient(135deg, #4ade80, #22d3ee);
      transform: scale(1.2);
    }
    
    .step-dot.completed {
      background: #4ade80;
    }
    
    .step-line {
      width: 24px;
      height: 2px;
      background: #374151;
      transition: background 0.3s ease;
    }
    
    .step-line.completed {
      background: #4ade80;
    }
    
    .step-label {
      font-size: 12px;
      color: #64748b;
      margin-top: 8px;
    }
    
    /* Step Content */
    .step-content {
      display: none;
      animation: fadeIn 0.3s ease;
    }
    
    .step-content.active {
      display: block;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .content {
      text-align: left;
      margin-bottom: 24px;
    }
    
    /* Instruction Box */
    .instruction-box {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    
    .instruction-box h3 {
      font-size: 16px;
      margin-bottom: 16px;
      color: #fff;
    }
    
    .instruction-list {
      list-style: none;
      padding: 0;
    }
    
    .instruction-list li {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 14px;
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.5;
    }
    
    .instruction-list li:last-child {
      margin-bottom: 0;
    }
    
    .instruction-number {
      background: linear-gradient(135deg, #4ade80, #22d3ee);
      color: #000;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 12px;
      flex-shrink: 0;
    }
    
    .instruction-list strong {
      color: #fff;
    }
    
    /* Warning/Info Boxes */
    .warning-box {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 13px;
      color: #fbbf24;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      text-align: left;
    }
    
    .warning-box svg {
      flex-shrink: 0;
      margin-top: 2px;
    }
    
    .info-box {
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 13px;
      color: #60a5fa;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      text-align: left;
    }
    
    .info-box svg {
      flex-shrink: 0;
      margin-top: 2px;
    }
    
    /* Device Info Card */
    .device-card {
      background: rgba(74, 222, 128, 0.1);
      border: 1px solid rgba(74, 222, 128, 0.3);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      text-align: left;
    }
    
    .device-card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    
    .device-card-icon {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #4ade80, #22d3ee);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .device-card-icon svg {
      color: #000;
    }
    
    .device-card-title {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
    }
    
    .device-card-subtitle {
      font-size: 13px;
      color: #94a3b8;
    }
    
    .device-card-details {
      display: grid;
      gap: 8px;
    }
    
    .device-detail {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
    }
    
    .device-detail-label {
      color: #94a3b8;
    }
    
    .device-detail-value {
      color: #fff;
      font-family: 'SF Mono', Monaco, monospace;
    }
    
    /* Form Styles */
    .form-group {
      margin-bottom: 20px;
      text-align: left;
    }
    
    .form-label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #fff;
      margin-bottom: 8px;
    }
    
    .form-input {
      width: 100%;
      padding: 12px 16px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid #374151;
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      transition: all 0.2s;
    }
    
    .form-input:focus {
      outline: none;
      border-color: #4ade80;
      box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.1);
    }
    
    .form-input::placeholder {
      color: #6b7280;
    }
    
    .form-select {
      width: 100%;
      padding: 12px 16px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid #374151;
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
    }
    
    .form-select:focus {
      outline: none;
      border-color: #4ade80;
    }
    
    .form-hint {
      font-size: 12px;
      color: #6b7280;
      margin-top: 6px;
    }
    
    .password-wrapper {
      position: relative;
    }
    
    .password-toggle {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      padding: 4px;
    }
    
    .password-toggle:hover {
      color: #9ca3af;
    }
    
    /* Buttons */
    .btn {
      padding: 14px 32px;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #4ade80, #22d3ee);
      color: #000;
    }
    
    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(74, 222, 128, 0.3);
    }
    
    .btn-secondary {
      background: transparent;
      border: 1px solid #374151;
      color: #94a3b8;
      margin-top: 12px;
    }
    
    .btn-secondary:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.05);
      border-color: #4b5563;
    }
    
    .btn-back {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 14px;
      cursor: pointer;
      padding: 8px 16px;
      margin-top: 16px;
    }
    
    .btn-back:hover {
      color: #fff;
    }
    
    /* Loading Spinner */
    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid transparent;
      border-top-color: currentColor;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* Success Icon */
    .success-icon {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #4ade80, #22d3ee);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      animation: scaleIn 0.3s ease;
    }
    
    @keyframes scaleIn {
      from { transform: scale(0); }
      to { transform: scale(1); }
    }
    
    .success-icon svg {
      color: #000;
      width: 40px;
      height: 40px;
    }
    
    /* Error State */
    .error-box {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
      text-align: left;
    }
    
    .error-box-title {
      color: #ef4444;
      font-weight: 600;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .error-box-message {
      color: #fca5a5;
      font-size: 14px;
    }
    
    /* Next Steps List */
    .next-steps {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 12px;
      padding: 20px;
      margin: 24px 0;
      text-align: left;
    }
    
    .next-steps h4 {
      font-size: 14px;
      color: #94a3b8;
      margin-bottom: 12px;
    }
    
    .next-steps ol {
      padding-left: 20px;
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.8;
    }
    
    .next-steps strong {
      color: #fff;
    }
    
    /* Toast */
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
    
    .toast.error {
      background: #ef4444;
    }
    
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    
    /* Hide class */
    .hidden {
      display: none !important;
    }
    
    /* Diagnostics Panel */
    .diag-panel {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid #374151;
      border-radius: 8px;
      margin-top: 20px;
      overflow: hidden;
    }
    
    .diag-header {
      background: rgba(0, 0, 0, 0.3);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      user-select: none;
    }
    
    .diag-header:hover {
      background: rgba(0, 0, 0, 0.4);
    }
    
    .diag-title {
      font-size: 13px;
      font-weight: 600;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .diag-toggle {
      color: #64748b;
      transition: transform 0.2s;
    }
    
    .diag-toggle.open {
      transform: rotate(180deg);
    }
    
    .diag-content {
      display: none;
      padding: 16px;
      max-height: 400px;
      overflow-y: auto;
    }
    
    .diag-content.open {
      display: block;
    }
    
    .diag-section {
      margin-bottom: 16px;
    }
    
    .diag-section:last-child {
      margin-bottom: 0;
    }
    
    .diag-section-title {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    
    .diag-code {
      background: rgba(0, 0, 0, 0.5);
      border-radius: 6px;
      padding: 12px;
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 11px;
      color: #a1a1aa;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 200px;
      overflow-y: auto;
    }
    
    .diag-code .success {
      color: #4ade80;
    }
    
    .diag-code .error {
      color: #ef4444;
    }
    
    .diag-code .warning {
      color: #fbbf24;
    }
    
    .diag-code .info {
      color: #60a5fa;
    }
    
    .diag-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    
    .diag-btn {
      padding: 6px 12px;
      font-size: 12px;
      border-radius: 6px;
      border: 1px solid #374151;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .diag-btn:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: #4b5563;
    }
    
    .diag-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      margin-bottom: 12px;
    }
    
    .diag-status.success {
      background: rgba(74, 222, 128, 0.1);
      border: 1px solid rgba(74, 222, 128, 0.3);
      color: #4ade80;
    }
    
    .diag-status.error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #ef4444;
    }
    
    .diag-status.warning {
      background: rgba(251, 191, 36, 0.1);
      border: 1px solid rgba(251, 191, 36, 0.3);
      color: #fbbf24;
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
    <h1>Setup New Device</h1>
    <p class="subtitle">Configure your Wemo device's WiFi connection</p>
    
    <!-- Step Indicator -->
    <div class="step-indicator">
      <div class="step-dot active" data-step="1"></div>
      <div class="step-line" data-line="1"></div>
      <div class="step-dot" data-step="2"></div>
      <div class="step-line" data-line="2"></div>
      <div class="step-dot" data-step="3"></div>
      <div class="step-line" data-line="3"></div>
      <div class="step-dot" data-step="4"></div>
    </div>
    
    <!-- Step 1: Connect to Wemo AP -->
    <div class="step-content active" id="step-1">
      <div class="content">
        <div class="instruction-box">
          <h3>Step 1 of 4: Connect to Device</h3>
          <ol class="instruction-list">
            <li>
              <span class="instruction-number">1</span>
              <span>Look for a WiFi network named <strong>Wemo.Mini.XXX</strong> or <strong>Wemo.Insight.XXX</strong></span>
            </li>
            <li>
              <span class="instruction-number">2</span>
              <span>Connect this computer to that network (no password required)</span>
            </li>
            <li>
              <span class="instruction-number">3</span>
              <span>Click the button below when connected</span>
            </li>
          </ol>
        </div>
        
        <div class="warning-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>You will temporarily lose internet access while connected to the Wemo device. This is normal.</span>
        </div>
      </div>
      
      <button class="btn btn-primary" id="btn-detect">
        I'm Connected to the Wemo WiFi
      </button>
      <button class="btn btn-secondary" onclick="window.close()">Cancel</button>
    </div>
    
    <!-- Step 2: Device Detected -->
    <div class="step-content" id="step-2">
      <div class="content">
        <div class="device-card">
          <div class="device-card-header">
            <div class="device-card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                <circle cx="12" cy="20" r="1"/>
              </svg>
            </div>
            <div>
              <div class="device-card-title" id="device-name">Wemo Device</div>
              <div class="device-card-subtitle">Device found and ready to configure</div>
            </div>
          </div>
          <div class="device-card-details">
            <div class="device-detail">
              <span class="device-detail-label">Serial Number</span>
              <span class="device-detail-value" id="device-serial">—</span>
            </div>
            <div class="device-detail">
              <span class="device-detail-label">MAC Address</span>
              <span class="device-detail-value" id="device-mac">—</span>
            </div>
            <div class="device-detail">
              <span class="device-detail-label">Model</span>
              <span class="device-detail-value" id="device-model">—</span>
            </div>
          </div>
        </div>
        
        <div class="info-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
          <span>Next, you'll enter your home WiFi credentials so this device can connect to your network.</span>
        </div>
      </div>
      
      <button class="btn btn-primary" id="btn-to-wifi">
        Continue to WiFi Setup
      </button>
      <button class="btn-back" id="btn-back-1">← Back</button>
    </div>
    
    <!-- Step 3: WiFi Credentials -->
    <div class="step-content" id="step-3">
      <div class="content">
        <div class="instruction-box">
          <h3>Step 3 of 4: Enter WiFi Credentials</h3>
          <p style="color: #94a3b8; font-size: 14px; margin-top: -8px;">Enter your home WiFi details exactly as they appear.</p>
        </div>
        
        <form id="wifi-form">
          <div class="form-group">
            <label class="form-label" for="ssid">WiFi Network Name (SSID)</label>
            <input type="text" id="ssid" class="form-input" placeholder="Enter your WiFi network name" required autocomplete="off">
            <p class="form-hint">Case-sensitive — enter exactly as it appears</p>
          </div>
          
          <div class="form-group">
            <label class="form-label" for="password">WiFi Password</label>
            <div class="password-wrapper">
              <input type="password" id="password" class="form-input" placeholder="Enter your WiFi password" required autocomplete="off" minlength="8">
              <button type="button" class="password-toggle" id="password-toggle" aria-label="Toggle password visibility">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-off-icon hidden">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
            <p class="form-hint">Must be at least 8 characters</p>
          </div>
          
          <div class="form-group">
            <label class="form-label" for="security">Security Type</label>
            <select id="security" class="form-select">
              <option value="WPA2/AES">WPA2 / AES (Recommended)</option>
              <option value="WPA/TKIP">WPA / TKIP</option>
              <option value="WPA/AES">WPA / AES</option>
              <option value="OPEN/NONE">Open (No Password)</option>
            </select>
          </div>
        </form>
        
        <div class="warning-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>Double-check your credentials. If incorrect, you'll need to factory reset the device and start over.</span>
        </div>
      </div>
      
      <button class="btn btn-primary" id="btn-connect">
        Connect Device to WiFi
      </button>
      <button class="btn-back" id="btn-back-2">← Back</button>
    </div>
    
    <!-- Step 4: Success -->
    <div class="step-content" id="step-4">
      <div class="success-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      
      <h2 style="font-size: 22px; margin-bottom: 8px;">Setup Command Sent!</h2>
      <p style="color: #94a3b8; font-size: 14px;">Your device is connecting to <strong id="success-ssid" style="color: #fff;">your WiFi</strong></p>
      
      <div class="next-steps">
        <h4>Next Steps:</h4>
        <ol>
          <li>Wait about <strong>30 seconds</strong> for the device to connect</li>
          <li>Reconnect this computer to your <strong>home WiFi</strong></li>
          <li>Return to Open Wemo and click <strong>"Discover Devices"</strong></li>
        </ol>
      </div>
      
      <button class="btn btn-primary" onclick="window.close()">
        Done
      </button>
      <button class="btn btn-secondary" id="btn-another">
        Set Up Another Device
      </button>
      
      <!-- Diagnostics Panel -->
      <div class="diag-panel" id="diag-panel">
        <div class="diag-header" id="diag-header">
          <span class="diag-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Diagnostics
          </span>
          <svg class="diag-toggle" id="diag-toggle" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div class="diag-content" id="diag-content">
          <div class="diag-status" id="diag-status">
            Waiting for data...
          </div>
          
          <div class="diag-section">
            <div class="diag-section-title">Response Status</div>
            <div class="diag-code" id="diag-response-status">—</div>
          </div>
          
          <div class="diag-section">
            <div class="diag-section-title">Response Body</div>
            <div class="diag-code" id="diag-response-body">—</div>
          </div>
          
          <div class="diag-section">
            <div class="diag-section-title">SOAP Request Payload</div>
            <div class="diag-code" id="diag-request-payload">—</div>
          </div>
          
          <div class="diag-section">
            <div class="diag-section-title">Encrypted Password</div>
            <div class="diag-code" id="diag-encrypted-password">—</div>
          </div>
          
          <div class="diag-actions">
            <button class="diag-btn" id="diag-btn-aplist">Get AP List</button>
            <button class="diag-btn" id="diag-btn-status">Network Status</button>
            <button class="diag-btn" id="diag-btn-copy">Copy All</button>
          </div>
          
          <div class="diag-section" style="margin-top: 16px;">
            <div class="diag-section-title">Additional Info</div>
            <div class="diag-code" id="diag-extra">—</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Error State (shown when detection/connection fails) -->
    <div class="step-content" id="step-error">
      <div class="error-box">
        <div class="error-box-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <span id="error-title">Connection Failed</span>
        </div>
        <p class="error-box-message" id="error-message">Could not connect to the device.</p>
      </div>
      
      <button class="btn btn-primary" id="btn-retry">
        Try Again
      </button>
      <button class="btn btn-secondary" onclick="window.close()">Cancel</button>
    </div>
  </div>
  
  <div class="toast" id="toast"></div>

  <script>
    // State
    const state = {
      currentStep: 1,
      device: null,
      ssid: '',
      password: '',
      security: 'WPA2/AES',
      lastError: null,
      previousStep: 1
    };
    
    const API_BASE = 'http://localhost:${port}';
    
    // DOM Elements
    const steps = {
      1: document.getElementById('step-1'),
      2: document.getElementById('step-2'),
      3: document.getElementById('step-3'),
      4: document.getElementById('step-4'),
      error: document.getElementById('step-error')
    };
    
    // Utility functions
    function showToast(message, isError = false) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.toggle('error', isError);
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
    
    function goToStep(step) {
      // Hide all steps
      Object.values(steps).forEach(el => el.classList.remove('active'));
      
      // Show target step
      const targetStep = steps[step];
      if (targetStep) {
        targetStep.classList.add('active');
      }
      
      // Update step indicators
      document.querySelectorAll('.step-dot').forEach(dot => {
        const dotStep = parseInt(dot.dataset.step);
        dot.classList.remove('active', 'completed');
        if (dotStep === step) {
          dot.classList.add('active');
        } else if (dotStep < step && step !== 'error') {
          dot.classList.add('completed');
        }
      });
      
      document.querySelectorAll('.step-line').forEach(line => {
        const lineStep = parseInt(line.dataset.line);
        line.classList.toggle('completed', lineStep < step && step !== 'error');
      });
      
      state.currentStep = step;
    }
    
    function showError(title, message) {
      state.previousStep = state.currentStep;
      document.getElementById('error-title').textContent = title;
      document.getElementById('error-message').textContent = message;
      goToStep('error');
    }
    
    function setButtonLoading(btn, loading) {
      if (loading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span> Please wait...';
      } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
      }
    }
    
    // Step 1: Detect device
    document.getElementById('btn-detect').addEventListener('click', async () => {
      const btn = document.getElementById('btn-detect');
      setButtonLoading(btn, true);
      
      try {
        const response = await fetch(API_BASE + '/api/setup/detect');
        const data = await response.json();
        
        if (data.onWemoAp && data.device) {
          state.device = data.device;
          
          // Update device card
          document.getElementById('device-name').textContent = data.device.name || 'Wemo Device';
          document.getElementById('device-serial').textContent = data.device.serial || '—';
          document.getElementById('device-mac').textContent = formatMac(data.device.mac) || '—';
          document.getElementById('device-model').textContent = data.device.model || '—';
          
          goToStep(2);
        } else {
          showError('Device Not Found', data.error || 'Make sure you are connected to the Wemo device\\'s WiFi network (Wemo.XXX.XXX).');
        }
      } catch (error) {
        console.error('Detection error:', error);
        showError('Connection Error', 'Could not communicate with the bridge. Make sure Open Wemo is running.');
      } finally {
        setButtonLoading(btn, false);
      }
    });
    
    // Step 2: Continue to WiFi
    document.getElementById('btn-to-wifi').addEventListener('click', () => {
      goToStep(3);
    });
    
    // Step 3: Connect device
    document.getElementById('btn-connect').addEventListener('click', async () => {
      const ssid = document.getElementById('ssid').value.trim();
      const password = document.getElementById('password').value;
      const security = document.getElementById('security').value;
      
      // Validation
      if (!ssid) {
        showToast('Please enter your WiFi network name', true);
        return;
      }
      
      if (security !== 'OPEN/NONE' && password.length < 8) {
        showToast('Password must be at least 8 characters', true);
        return;
      }
      
      const btn = document.getElementById('btn-connect');
      setButtonLoading(btn, true);
      
      try {
        const [auth, encrypt] = security.split('/');
        
        const response = await fetch(API_BASE + '/api/setup/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ssid,
            password,
            auth,
            encrypt,
            mac: state.device.mac,
            serial: state.device.serial
          })
        });
        
        const data = await response.json();
        
        // Always update diagnostics (even on success, to show what was sent)
        if (typeof updateDiagnostics === 'function') {
          updateDiagnostics(data);
        }
        
        // Log full response to console for debugging
        console.log('[Setup] Connect response:', JSON.stringify(data, null, 2));
        
        if (data.success) {
          state.ssid = ssid;
          document.getElementById('success-ssid').textContent = ssid;
          goToStep(4);
          
          // Auto-open diagnostics panel to show results
          const content = document.getElementById('diag-content');
          const toggle = document.getElementById('diag-toggle');
          if (content && !content.classList.contains('open')) {
            content.classList.add('open');
            toggle.classList.add('open');
          }
        } else {
          showError('Setup Failed', data.error || 'Failed to send setup command to the device.');
        }
      } catch (error) {
        console.error('Connect error:', error);
        showError('Connection Error', 'Could not send setup command. Please try again.');
      } finally {
        setButtonLoading(btn, false);
      }
    });
    
    // Password toggle
    document.getElementById('password-toggle').addEventListener('click', () => {
      const input = document.getElementById('password');
      const eyeIcon = document.querySelector('.eye-icon');
      const eyeOffIcon = document.querySelector('.eye-off-icon');
      
      if (input.type === 'password') {
        input.type = 'text';
        eyeIcon.classList.add('hidden');
        eyeOffIcon.classList.remove('hidden');
      } else {
        input.type = 'password';
        eyeIcon.classList.remove('hidden');
        eyeOffIcon.classList.add('hidden');
      }
    });
    
    // Security type change - toggle password field
    document.getElementById('security').addEventListener('change', (e) => {
      const passwordGroup = document.getElementById('password').closest('.form-group');
      if (e.target.value === 'OPEN/NONE') {
        passwordGroup.style.display = 'none';
        document.getElementById('password').removeAttribute('required');
      } else {
        passwordGroup.style.display = 'block';
        document.getElementById('password').setAttribute('required', '');
      }
    });
    
    // Back buttons
    document.getElementById('btn-back-1').addEventListener('click', () => goToStep(1));
    document.getElementById('btn-back-2').addEventListener('click', () => goToStep(2));
    
    // Retry button
    document.getElementById('btn-retry').addEventListener('click', () => {
      goToStep(state.previousStep);
    });
    
    // Set up another device
    document.getElementById('btn-another').addEventListener('click', () => {
      // Reset state
      state.device = null;
      state.ssid = '';
      state.password = '';
      document.getElementById('ssid').value = '';
      document.getElementById('password').value = '';
      document.getElementById('security').value = 'WPA2/AES';
      goToStep(1);
    });
    
    // Helper: Format MAC address
    function formatMac(mac) {
      if (!mac) return null;
      // Remove any existing separators and format as XX:XX:XX:XX:XX:XX
      const clean = mac.replace(/[^a-fA-F0-9]/g, '');
      if (clean.length !== 12) return mac;
      return clean.match(/.{2}/g).join(':').toUpperCase();
    }
    
    // Prevent form submission
    document.getElementById('wifi-form').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('btn-connect').click();
    });
    
    // ============================================
    // Diagnostics Panel
    // ============================================
    
    let lastDiagnostics = null;
    
    // Toggle diagnostics panel
    document.getElementById('diag-header').addEventListener('click', () => {
      const content = document.getElementById('diag-content');
      const toggle = document.getElementById('diag-toggle');
      content.classList.toggle('open');
      toggle.classList.toggle('open');
    });
    
    // Update diagnostics panel with response data
    function updateDiagnostics(data) {
      lastDiagnostics = data;
      
      const statusEl = document.getElementById('diag-status');
      const responseStatusEl = document.getElementById('diag-response-status');
      const responseBodyEl = document.getElementById('diag-response-body');
      const requestPayloadEl = document.getElementById('diag-request-payload');
      const encryptedPwEl = document.getElementById('diag-encrypted-password');
      
      if (data.success) {
        statusEl.className = 'diag-status success';
        statusEl.textContent = '✓ Command sent successfully (HTTP ' + (data.diagnostics?.responseStatus || 'OK') + ')';
      } else {
        statusEl.className = 'diag-status error';
        statusEl.textContent = '✗ Failed: ' + (data.error || 'Unknown error');
      }
      
      if (data.diagnostics) {
        const diag = data.diagnostics;
        
        // Response status
        if (diag.attempts && diag.attempts.length > 0) {
          const attemptsInfo = diag.attempts.map(a => 
            'Attempt ' + a.attempt + ': ' + (a.status ? 'HTTP ' + a.status : 'Error: ' + a.error)
          ).join('\\n');
          responseStatusEl.textContent = attemptsInfo;
        }
        
        // Response body
        if (diag.rawResponse) {
          responseBodyEl.textContent = formatXml(diag.rawResponse);
        }
        
        // Request payload
        if (diag.soapPayload) {
          requestPayloadEl.textContent = formatXml(diag.soapPayload);
        }
        
        // Encrypted password
        if (diag.encryptedPassword) {
          encryptedPwEl.textContent = diag.encryptedPassword;
        }
      }
    }
    
    // Format XML for display
    function formatXml(xml) {
      try {
        // Simple XML formatting
        let formatted = '';
        let indent = 0;
        const parts = xml.replace(/>\\s*</g, '>\\n<').split('\\n');
        
        for (const part of parts) {
          if (part.match(/^\\/</)) {
            indent--;
          }
          formatted += '  '.repeat(Math.max(0, indent)) + part + '\\n';
          if (part.match(/^<[^/][^>]*[^/]>$/) && !part.match(/<.*\\/>/)) {
            indent++;
          }
        }
        return formatted.trim();
      } catch {
        return xml;
      }
    }
    
    // Get AP List diagnostic
    document.getElementById('diag-btn-aplist').addEventListener('click', async () => {
      const extraEl = document.getElementById('diag-extra');
      extraEl.textContent = 'Fetching AP list...';
      
      try {
        const response = await fetch(API_BASE + '/api/setup/diag/aplist');
        const data = await response.json();
        
        let output = 'AP List Request:\\n';
        output += 'Status: ' + (data.success ? 'Success' : 'Failed') + '\\n';
        output += 'HTTP Status: ' + (data.responseStatus || 'N/A') + '\\n\\n';
        
        if (data.responseBody) {
          output += 'Response:\\n' + formatXml(data.responseBody);
        } else if (data.error) {
          output += 'Error: ' + data.error;
        }
        
        extraEl.textContent = output;
      } catch (error) {
        extraEl.textContent = 'Error fetching AP list: ' + error.message;
      }
    });
    
    // Get Network Status diagnostic
    document.getElementById('diag-btn-status').addEventListener('click', async () => {
      const extraEl = document.getElementById('diag-extra');
      extraEl.textContent = 'Fetching network status...';
      
      try {
        const response = await fetch(API_BASE + '/api/setup/diag/network-status');
        const data = await response.json();
        
        let output = 'Network Status Request:\\n';
        output += 'Status: ' + (data.success ? 'Success' : 'Failed') + '\\n';
        output += 'HTTP Status: ' + (data.responseStatus || 'N/A') + '\\n\\n';
        
        if (data.responseBody) {
          output += 'Response:\\n' + formatXml(data.responseBody);
        } else if (data.error) {
          output += 'Error: ' + data.error;
        }
        
        extraEl.textContent = output;
      } catch (error) {
        extraEl.textContent = 'Error fetching network status: ' + error.message;
      }
    });
    
    // Copy all diagnostics
    document.getElementById('diag-btn-copy').addEventListener('click', async () => {
      const output = {
        timestamp: new Date().toISOString(),
        device: state.device,
        ssid: state.ssid,
        lastResponse: lastDiagnostics
      };
      
      try {
        await navigator.clipboard.writeText(JSON.stringify(output, null, 2));
        showToast('Diagnostics copied to clipboard');
      } catch {
        showToast('Failed to copy', true);
      }
    });
  </script>
</body>
</html>`;
}

/**
 * Creates the setup page route handler.
 */
export function createSetupRoute(port: number) {
  return (): Response => {
    const html = generateSetupPageHtml({ port });
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  };
}
