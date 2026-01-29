/**
 * QR Code Window
 *
 * Displays a QR code for easy phone setup.
 * Users scan the QR code to connect their phone to the bridge.
 */

import { networkInterfaces } from "node:os";
import QRCode from "qrcode";

/**
 * QR Window configuration.
 */
export interface QRWindowConfig {
  /** Server port */
  port: number;
  /** Preferred IP address (optional, auto-detected if not provided) */
  preferredIp?: string;
}

/**
 * Network interface info for IP selection.
 */
interface NetworkInterface {
  name: string;
  address: string;
  family: string;
  internal: boolean;
}

/**
 * Patterns for virtual/VPN interfaces that should be excluded.
 * These are typically not reachable from phones on the local network.
 */
const VIRTUAL_INTERFACE_PATTERNS = [
  /^vEthernet/i, // Hyper-V virtual switches
  /^vnic/i, // Virtual NICs
  /vmware/i, // VMware
  /virtualbox/i, // VirtualBox
  /docker/i, // Docker
  /\bwsl\b/i, // WSL
  /hyper-?v/i, // Hyper-V
  /^tun\d/i, // VPN tunnel
  /^tap\d/i, // VPN tap
  /^utun\d/i, // macOS VPN
  /^ppp\d/i, // PPP connections
  /\bvpn\b/i, // VPN interfaces
  /^br-/i, // Docker bridge networks
  /^veth/i, // Docker virtual ethernet
  /^virbr/i, // libvirt/KVM virtual bridges
];

/**
 * Checks if an interface name appears to be virtual/VPN.
 */
function isVirtualInterface(name: string): boolean {
  return VIRTUAL_INTERFACE_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Scores an IP address by how likely it is to be a real LAN address.
 * Higher score = more likely to be the correct local network.
 * 192.168.x.x and 10.x.x.x are scored equally as both are common home/office ranges.
 */
function scoreIpAddress(address: string): number {
  // 192.168.x.x - common home/SOHO networks
  if (address.startsWith("192.168.")) {
    return 100;
  }

  // 10.x.x.x - common home and corporate networks (equally valid as 192.168)
  if (address.startsWith("10.")) {
    return 100;
  }

  // 172.16.x.x - 172.31.x.x - private range, but often used for virtual networks
  // Check if it's in the valid private range (172.16.0.0 - 172.31.255.255)
  if (address.startsWith("172.")) {
    const parts = address.split(".");
    const secondOctet = Number.parseInt(parts[1] ?? "0", 10);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return 50; // Lower score - often virtual
    }
  }

  // Other addresses (link-local, etc.)
  return 10;
}

/**
 * Scores an interface name by how likely it is to be the primary network.
 * Higher score = more likely to be the user's main connection.
 */
function scoreInterfaceName(name: string): number {
  const lowerName = name.toLowerCase();

  // WiFi interfaces - usually the primary on laptops/phones
  if (/wi-?fi|wlan|wireless|airport/i.test(lowerName)) {
    return 100;
  }

  // Ethernet - usually primary on desktops
  if (/^ethernet$|^eth\d|^en\d/i.test(lowerName)) {
    return 80;
  }

  // Other physical interfaces
  return 50;
}

/**
 * Gets all available IPv4 addresses from network interfaces.
 * Filters out virtual/VPN interfaces.
 */
export function getNetworkInterfaces(): NetworkInterface[] {
  const interfaces = networkInterfaces();
  const result: NetworkInterface[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;

    // Skip virtual interfaces
    if (isVirtualInterface(name)) {
      continue;
    }

    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        result.push({
          name,
          address: addr.address,
          family: addr.family,
          internal: addr.internal,
        });
      }
    }
  }

  return result;
}

/**
 * Gets the preferred local IP address.
 * Uses heuristics to find the most likely LAN address:
 * 1. Filters out virtual/VPN interfaces
 * 2. Scores by IP range (192.168 > 10.x > 172.16-31)
 * 3. Tiebreaks by interface name (wifi > ethernet > other)
 */
export function getPreferredIp(): string | null {
  const interfaces = getNetworkInterfaces();

  if (interfaces.length === 0) {
    return null;
  }

  // Score and sort interfaces
  const scored = interfaces.map((iface) => ({
    ...iface,
    ipScore: scoreIpAddress(iface.address),
    nameScore: scoreInterfaceName(iface.name),
    totalScore: scoreIpAddress(iface.address) * 10 + scoreInterfaceName(iface.name),
  }));

  // Sort by total score descending
  scored.sort((a, b) => b.totalScore - a.totalScore);

  return scored[0]?.address ?? null;
}

/**
 * Generates a QR code as a data URL (base64 PNG).
 */
export async function generateQRCode(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 256,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
    errorCorrectionLevel: "M",
  });
}

/**
 * Generates the server URL for phone access.
 */
export function getServerUrl(port: number, ip?: string): string {
  const address = ip ?? getPreferredIp() ?? "localhost";
  return `http://${address}:${port}`;
}

/**
 * Generates HTML content for the QR code window.
 */
export async function generateQRWindowHtml(config: QRWindowConfig): Promise<string> {
  const ip = config.preferredIp ?? getPreferredIp();
  const url = getServerUrl(config.port, ip ?? undefined);
  const qrDataUrl = await generateQRCode(url);
  const interfaces = getNetworkInterfaces();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Open Wemo - QR Code</title>
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
      border-radius: 16px;
      padding: 32px;
      text-align: center;
      max-width: 400px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    h1 {
      font-size: 24px;
      margin-bottom: 8px;
      color: #4ade80;
    }
    
    .subtitle {
      color: #94a3b8;
      margin-bottom: 24px;
      font-size: 14px;
    }
    
    .qr-container {
      background: #fff;
      padding: 16px;
      border-radius: 12px;
      display: inline-block;
      margin-bottom: 24px;
    }
    
    .qr-container img {
      display: block;
      width: 256px;
      height: 256px;
    }
    
    .url-container {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
    }
    
    .url-label {
      font-size: 12px;
      color: #94a3b8;
      margin-bottom: 4px;
    }
    
    .url {
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 16px;
      color: #60a5fa;
      word-break: break-all;
      user-select: all;
    }
    
    .instructions {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    
    .instructions ol {
      text-align: left;
      padding-left: 20px;
    }
    
    .instructions li {
      margin-bottom: 4px;
    }
    
    .network-info {
      font-size: 11px;
      color: #64748b;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .close-btn {
      background: #4ade80;
      color: #000;
      border: none;
      padding: 12px 32px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .close-btn:hover {
      background: #22c55e;
      transform: translateY(-1px);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📱 Phone Setup</h1>
    <p class="subtitle">Scan the QR code with your phone's camera</p>
    
    <div class="qr-container">
      <img src="${qrDataUrl}" alt="QR Code for ${url}">
    </div>
    
    <div class="url-container">
      <div class="url-label">Or enter this URL manually:</div>
      <div class="url">${url}</div>
    </div>
    
    <div class="instructions">
      <ol>
        <li>Open your phone's camera</li>
        <li>Point it at the QR code</li>
        <li>Tap the notification to open</li>
        <li>Tap "Add to Home Screen"</li>
      </ol>
    </div>
    
    <button class="close-btn" onclick="window.close()">Done</button>
    
    ${
      interfaces.length > 1
        ? `<div class="network-info">
        Available interfaces: ${interfaces.map((i) => `${i.name} (${i.address})`).join(", ")}
      </div>`
        : ""
    }
  </div>
</body>
</html>`;
}

/**
 * Opens the QR code window.
 *
 * Note: This opens the QR page in the default browser.
 * For a native window, we'd need a GUI framework like Electron.
 * Opening in browser is simpler and works cross-platform.
 */
export async function openQRWindow(config: QRWindowConfig): Promise<void> {
  // For now, we'll just log the URL - the actual window opening
  // will be handled by serving this as a route on the server
  const url = getServerUrl(config.port, config.preferredIp);
  console.log(`[QR] QR code available at: ${url}/qr`);
}

/**
 * Creates QR page HTML for serving via the web server.
 * This can be mounted as a route in the Hono app.
 */
export function createQRRoute(port: number) {
  return async (): Promise<Response> => {
    const html = await generateQRWindowHtml({ port });
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  };
}
