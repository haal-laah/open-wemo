/**
 * WeMo Device Setup
 *
 * Handles initial WiFi setup for new/factory-reset Wemo devices.
 * When connected to a Wemo device's AP (10.22.22.1), this module:
 * 1. Detects if we're on a Wemo AP network
 * 2. Fetches device info from setup.xml
 * 3. Sends encrypted WiFi credentials via SOAP
 */

import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { XMLParser } from "fast-xml-parser";

/**
 * Wemo AP network constants.
 */
export const WEMO_AP_SUBNET = "10.22.22";
export const WEMO_AP_DEVICE_IP = "10.22.22.1";
export const WEMO_AP_PORT = 49152;
export const WEMO_SETUP_URL = `http://${WEMO_AP_DEVICE_IP}:${WEMO_AP_PORT}/setup.xml`;
export const WEMO_WIFI_SETUP_URL = `http://${WEMO_AP_DEVICE_IP}:${WEMO_AP_PORT}/upnp/control/WiFiSetup1`;

/**
 * WiFi Setup service constants.
 */
const WIFI_SETUP_SERVICE_TYPE = "urn:Belkin:service:WiFiSetup:1";

/**
 * Device info returned from setup detection.
 */
export interface SetupDeviceInfo {
  serial: string;
  mac: string;
  model: string;
  name: string;
  firmwareVersion?: string;
  binaryState?: number;
}

/**
 * Detection result.
 */
export interface SetupDetectionResult {
  onWemoAp: boolean;
  device: SetupDeviceInfo | null;
  error?: string;
}

/**
 * WiFi connection request parameters.
 */
export interface WifiConnectParams {
  ssid: string;
  password: string;
  auth: "OPEN" | "WPA" | "WPA2";
  encrypt: "NONE" | "AES" | "TKIP";
  mac: string;
  serial: string;
  channel?: number;
}

/**
 * WiFi connection result.
 */
export interface WifiConnectResult {
  success: boolean;
  status?: string;
  error?: string;
}

/**
 * XML parser for setup.xml.
 */
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  removeNSPrefix: true,
});

/**
 * Checks if any network interface has an IP in the Wemo AP subnet.
 */
export function isOnWemoApNetwork(): boolean {
  const interfaces = networkInterfaces();

  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;

    for (const addr of addrs) {
      if (addr.family === "IPv4" && addr.address.startsWith(WEMO_AP_SUBNET)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Gets the local IP address on the Wemo AP network.
 */
export function getWemoApLocalIp(): string | null {
  const interfaces = networkInterfaces();

  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;

    for (const addr of addrs) {
      if (addr.family === "IPv4" && addr.address.startsWith(WEMO_AP_SUBNET)) {
        return addr.address;
      }
    }
  }

  return null;
}

/**
 * Fetches and parses device info from setup.xml.
 */
export async function fetchSetupDeviceInfo(): Promise<SetupDeviceInfo | null> {
  try {
    const response = await fetch(WEMO_SETUP_URL, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`[Setup] Failed to fetch setup.xml: ${response.status}`);
      return null;
    }

    const xml = await response.text();
    const parsed = xmlParser.parse(xml);

    const root = parsed.root;
    if (!root?.device) {
      console.error("[Setup] Invalid setup.xml: missing root/device");
      return null;
    }

    const device = root.device;

    return {
      serial: String(device.serialNumber ?? ""),
      mac: String(device.macAddress ?? "").replace(/:/g, ""),
      model: String(device.modelName ?? ""),
      name: String(device.friendlyName ?? "Wemo Device"),
      firmwareVersion: device.firmwareVersion ? String(device.firmwareVersion) : undefined,
      binaryState: device.binaryState != null ? Number(device.binaryState) : undefined,
    };
  } catch (error) {
    console.error("[Setup] Error fetching device info:", error);
    return null;
  }
}

/**
 * Detects if we're on a Wemo AP network and fetches device info.
 */
export async function detectSetupDevice(): Promise<SetupDetectionResult> {
  // Check if we're on the Wemo AP subnet
  if (!isOnWemoApNetwork()) {
    return {
      onWemoAp: false,
      device: null,
      error:
        "Not connected to a Wemo device network. Please connect to a WiFi network starting with 'Wemo.'",
    };
  }

  // Fetch device info
  const device = await fetchSetupDeviceInfo();

  if (!device) {
    return {
      onWemoAp: true,
      device: null,
      error:
        "Connected to Wemo network but could not read device info. The device may still be starting up - please wait a moment and try again.",
    };
  }

  return {
    onWemoAp: true,
    device,
  };
}

// ============================================
// WiFi Password Encryption
// ============================================

/**
 * Magic string used in encryption method 2.
 * From pywemo: used for devices with binaryOption flag.
 */
const ENCRYPTION_MAGIC = "b3{8t;80dIN{ra83eC1s?M70?683@2Yf";

/**
 * Encryption method types.
 * Method 3 with addLengths=true is most common for newer devices.
 */
export enum EncryptionMethod {
  METHOD_1 = 1, // Basic: mac[:6] + serial + mac[6:12]
  METHOD_2 = 2, // Method 1 + magic string
  METHOD_3 = 3, // Complex mixing + base64
}

/**
 * Generates the encryption key from MAC address and serial number.
 *
 * @param mac - Device MAC address (12 hex chars, no separators)
 * @param serial - Device serial number
 * @param method - Encryption method (1, 2, or 3)
 * @returns 16-byte key buffer
 */
export function generateKeydata(
  mac: string,
  serial: string,
  method: EncryptionMethod = EncryptionMethod.METHOD_3
): Buffer {
  // Clean MAC address - remove any separators
  const cleanMac = mac.replace(/[^a-fA-F0-9]/g, "").toUpperCase();

  if (cleanMac.length !== 12) {
    throw new Error(`Invalid MAC address length: ${cleanMac.length}, expected 12`);
  }

  let keyString: string;

  switch (method) {
    case EncryptionMethod.METHOD_1:
      // mac[:6] + serial + mac[6:12]
      keyString = cleanMac.slice(0, 6) + serial + cleanMac.slice(6, 12);
      break;

    case EncryptionMethod.METHOD_2:
      // Method 1 + magic string
      keyString = cleanMac.slice(0, 6) + serial + cleanMac.slice(6, 12) + ENCRYPTION_MAGIC;
      break;

    case EncryptionMethod.METHOD_3: {
      // Complex mixing algorithm from pywemo
      // Mix: mac_val = (mac[i] + mac[i+6] + serial[i]) for i in 0..5
      // Then interleave with serial
      const macVals: number[] = [];
      for (let i = 0; i < 6; i++) {
        const hexPair1 = cleanMac.slice(i * 2, i * 2 + 2);
        const hexPair2 = cleanMac.slice(6 + i * 2, 6 + i * 2 + 2);
        const serialChar = serial.charCodeAt(i) || 0;
        macVals.push(Number.parseInt(hexPair1, 16) + Number.parseInt(hexPair2, 16) + serialChar);
      }

      // Build key string by interleaving
      let result = "";
      for (let i = 0; i < 6; i++) {
        result += serial.charAt(i) || "";
        result += String.fromCharCode((macVals[i] ?? 0) % 256);
      }
      result += serial.slice(6);

      // Base64 encode
      keyString = Buffer.from(result, "binary").toString("base64");
      break;
    }

    default:
      throw new Error(`Unknown encryption method: ${method}`);
  }

  // Hash to get exactly 16 bytes for AES-128
  const hash = createHash("md5").update(keyString).digest();
  return hash;
}

/**
 * Encrypts the WiFi password using AES-128-CBC.
 *
 * @param password - Plain text WiFi password
 * @param mac - Device MAC address
 * @param serial - Device serial number
 * @param method - Encryption method
 * @param addLengths - Whether to prepend length bytes (required for some devices)
 * @returns Base64-encoded encrypted password
 */
export function encryptWifiPassword(
  password: string,
  mac: string,
  serial: string,
  method: EncryptionMethod = EncryptionMethod.METHOD_3,
  addLengths = true
): string {
  const key = generateKeydata(mac, serial, method);
  const iv = randomBytes(16);

  // Prepare data - optionally add length bytes
  let data: Buffer;
  if (addLengths) {
    // Format: [keyLength (1 byte)][ivLength (1 byte)][password]
    // Both lengths are always 16 for AES-128
    const passwordBuffer = Buffer.from(password, "utf-8");
    data = Buffer.concat([Buffer.from([16, 16]), passwordBuffer]);
  } else {
    data = Buffer.from(password, "utf-8");
  }

  // Encrypt with AES-128-CBC
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  cipher.setAutoPadding(true); // PKCS7 padding

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

  // Output format: IV + encrypted data, base64 encoded
  const result = Buffer.concat([iv, encrypted]);
  return result.toString("base64");
}

// ============================================
// SOAP Commands
// ============================================

/**
 * Builds the ConnectHomeNetwork SOAP payload.
 */
export function buildConnectHomeNetworkPayload(params: {
  ssid: string;
  password: string;
  auth: string;
  encrypt: string;
  channel?: number;
}): string {
  const { ssid, password, auth, encrypt, channel = 0 } = params;

  // Escape XML special characters
  const escapeXml = (str: string): string =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
    "<s:Body>",
    `<u:ConnectHomeNetwork xmlns:u="${WIFI_SETUP_SERVICE_TYPE}">`,
    `<ssid>${escapeXml(ssid)}</ssid>`,
    `<auth>${auth}</auth>`,
    `<password>${escapeXml(password)}</password>`,
    `<encrypt>${encrypt}</encrypt>`,
    `<channel>${channel}</channel>`,
    "</u:ConnectHomeNetwork>",
    "</s:Body>",
    "</s:Envelope>",
  ].join("");
}

/**
 * Sends the ConnectHomeNetwork SOAP command to configure WiFi.
 */
export async function sendWifiConnectCommand(
  params: WifiConnectParams
): Promise<WifiConnectResult> {
  const { ssid, password, auth, encrypt, mac, serial, channel = 0 } = params;

  try {
    // Encrypt the password
    const encryptedPassword = encryptWifiPassword(
      password,
      mac,
      serial,
      EncryptionMethod.METHOD_3,
      true
    );

    console.log("[Setup] Encrypting WiFi password...", {
      method: EncryptionMethod.METHOD_3,
      addLengths: true,
      originalLength: password.length,
      encryptedLength: encryptedPassword.length,
    });

    // Build SOAP payload
    const payload = buildConnectHomeNetworkPayload({
      ssid,
      password: encryptedPassword,
      auth,
      encrypt,
      channel,
    });

    const soapAction = `"${WIFI_SETUP_SERVICE_TYPE}#ConnectHomeNetwork"`;

    console.log("[Setup] Sending ConnectHomeNetwork command...");

    // Send twice for reliability (per pywemo recommendation)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(WEMO_WIFI_SETUP_URL, {
          method: "POST",
          headers: {
            "Content-Type": "text/xml",
            SOAPACTION: soapAction,
          },
          body: payload,
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const text = await response.text();
          console.log("[Setup] Response received:", text.slice(0, 200));

          // Try to parse PairingStatus from response
          const statusMatch = text.match(/<PairingStatus>([^<]+)<\/PairingStatus>/);
          const status = statusMatch?.[1] ?? "Sent";

          return {
            success: true,
            status,
          };
        }

        console.warn(`[Setup] Attempt ${attempt + 1} got status ${response.status}`);
      } catch (error) {
        console.warn(`[Setup] Attempt ${attempt + 1} failed:`, error);
      }

      // Small delay between attempts
      if (attempt < 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return {
      success: false,
      error: "Failed to send setup command after 2 attempts",
    };
  } catch (error) {
    console.error("[Setup] Error sending WiFi connect command:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
