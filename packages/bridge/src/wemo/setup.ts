/**
 * WeMo Device Setup
 *
 * Handles initial WiFi setup for new/factory-reset Wemo devices.
 * When connected to a Wemo device's AP (10.22.22.1), this module:
 * 1. Detects if we're on a Wemo AP network
 * 2. Fetches device info from setup.xml
 * 3. Sends encrypted WiFi credentials via SOAP
 */

import { createCipheriv, createHash } from "node:crypto";
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
 * Magic string used in encryption method 2 (rtos=1 devices).
 * From pywemo source code.
 */
const ENCRYPTION_MAGIC_METHOD_2 = "b3{8t;80dIN{ra83eC1s?M70?683@2Yf";

/**
 * Magic string for method 3 (binaryOption=1 devices).
 * This is pre-computed from the pywemo algorithm:
 * characters = "Onboard$Application@Device&Information#Wemo"
 * mixed by alternating prepend/append pattern
 * then base64 encoded and truncated to 32 chars
 */
const ENCRYPTION_EXTRA_METHOD_3 = "b2Ujb3Rtb24mY3ZEbmlhaXBBZGFiT25v";

/**
 * Encryption method types.
 * - Method 1: Original devices
 * - Method 2: rtos=1 or new_algo=1 devices (most common including Insight)
 * - Method 3: binaryOption=1 devices
 */
export enum EncryptionMethod {
  METHOD_1 = 1,
  METHOD_2 = 2,
  METHOD_3 = 3,
}

/**
 * Generates the keydata string from MAC address and serial number.
 * This keydata is used as the password for OpenSSL-style encryption.
 *
 * @param mac - Device MAC address (12 hex chars, no separators)
 * @param serial - Device serial number
 * @param method - Encryption method (1, 2, or 3)
 * @returns Keydata string
 */
export function generateKeydata(
  mac: string,
  serial: string,
  method: EncryptionMethod = EncryptionMethod.METHOD_2
): string {
  // Clean MAC address - remove any separators, keep as-is (don't uppercase)
  // pywemo uses the MAC as-is from the device
  const cleanMac = mac.replace(/[^a-fA-F0-9]/g, "");

  if (cleanMac.length !== 12) {
    throw new Error(`Invalid MAC address length: ${cleanMac.length}, expected 12`);
  }

  switch (method) {
    case EncryptionMethod.METHOD_1:
      // Original method: mac[:6] + serial + mac[6:12]
      return cleanMac.slice(0, 6) + serial + cleanMac.slice(6, 12);

    case EncryptionMethod.METHOD_2:
      // rtos=1 devices: mac[:6] + serial + mac[6:12] + magic
      return cleanMac.slice(0, 6) + serial + cleanMac.slice(6, 12) + ENCRYPTION_MAGIC_METHOD_2;

    case EncryptionMethod.METHOD_3:
      // binaryOption=1 devices: mac[:3] + mac[9:12] + serial + extra + mac[6:9] + mac[3:6]
      return (
        cleanMac.slice(0, 3) +
        cleanMac.slice(9, 12) +
        serial +
        ENCRYPTION_EXTRA_METHOD_3 +
        cleanMac.slice(6, 9) +
        cleanMac.slice(3, 6)
      );

    default:
      throw new Error(`Unknown encryption method: ${method}`);
  }
}

/**
 * Encrypts the WiFi password using OpenSSL-compatible AES-128-CBC.
 *
 * This replicates OpenSSL's `enc -aes-128-cbc -md md5` behavior:
 * 1. Derive key and IV from password using MD5 (OpenSSL EVP_BytesToKey)
 * 2. Encrypt with AES-128-CBC
 * 3. Output: "Salted__" + salt + encrypted_data (but we strip the prefix)
 *
 * @param password - Plain text WiFi password
 * @param mac - Device MAC address
 * @param serial - Device serial number
 * @param method - Encryption method
 * @param addLengths - Whether to append length bytes (hex) to the encrypted password
 * @returns Base64-encoded encrypted password
 */
export function encryptWifiPassword(
  password: string,
  mac: string,
  serial: string,
  method: EncryptionMethod = EncryptionMethod.METHOD_2,
  addLengths = true
): string {
  const keydata = generateKeydata(mac, serial, method);

  // pywemo uses:
  // - salt = keydata[:8]
  // - iv = keydata[:16]
  // - password (passphrase for key derivation) = keydata
  const salt = Buffer.from(keydata.slice(0, 8), "utf-8");
  const iv = Buffer.from(keydata.slice(0, 16), "utf-8");

  console.log("[Encrypt] Keydata:", keydata);
  console.log("[Encrypt] Keydata length:", keydata.length);
  console.log("[Encrypt] Salt (hex):", salt.toString("hex"));
  console.log("[Encrypt] IV (hex):", iv.toString("hex"));

  // Derive the AES key using OpenSSL's EVP_BytesToKey with MD5
  // OpenSSL command: openssl enc -aes-128-cbc -md md5 -S <salt> -iv <iv> -pass pass:<keydata>
  // EVP_BytesToKey: key = MD5(password + salt)
  const key = createHash("md5")
    .update(Buffer.concat([Buffer.from(keydata, "utf-8"), salt]))
    .digest();

  console.log("[Encrypt] Derived key (hex):", key.toString("hex"));

  // Encrypt with AES-128-CBC
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  cipher.setAutoPadding(true); // PKCS7 padding

  const passwordBuffer = Buffer.from(password, "utf-8");
  const encrypted = Buffer.concat([cipher.update(passwordBuffer), cipher.final()]);

  console.log("[Encrypt] Encrypted (hex):", encrypted.toString("hex"));

  // Base64 encode just the encrypted data (no Salted__ prefix)
  let result = encrypted.toString("base64");

  console.log("[Encrypt] Base64:", result);
  console.log("[Encrypt] Base64 length:", result.length);

  // Optionally add length bytes as hex
  // Format: <encrypted_base64><encrypted_len_hex><original_len_hex>
  if (addLengths) {
    const encLen = result.length;
    const origLen = password.length;
    const encLenHex = encLen.toString(16).padStart(2, "0");
    const origLenHex = origLen.toString(16).padStart(2, "0");
    result = result + encLenHex + origLenHex;
    console.log("[Encrypt] With lengths:", result);
    console.log("[Encrypt] Encrypted length (dec):", encLen, "-> hex:", encLenHex);
    console.log("[Encrypt] Original length (dec):", origLen, "-> hex:", origLenHex);
  }

  return result;
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
 * Extended result with diagnostic info.
 */
export interface WifiConnectResultExtended extends WifiConnectResult {
  diagnostics?: {
    encryptedPassword: string;
    soapPayload: string;
    rawResponse?: string;
    responseStatus?: number;
    responseHeaders?: Record<string, string>;
    attempts: Array<{
      attempt: number;
      status?: number;
      error?: string;
      response?: string;
    }>;
  };
}

/**
 * Sends the ConnectHomeNetwork SOAP command to configure WiFi.
 */
export async function sendWifiConnectCommand(
  params: WifiConnectParams,
  verbose = true
): Promise<WifiConnectResultExtended> {
  const { ssid, password, auth, encrypt, mac, serial, channel = 0 } = params;

  const diagnostics: WifiConnectResultExtended["diagnostics"] = {
    encryptedPassword: "",
    soapPayload: "",
    attempts: [],
  };

  try {
    // Log input params
    console.log("[Setup] ============================================");
    console.log("[Setup] WiFi Connect Command - Input Parameters");
    console.log("[Setup] ============================================");
    console.log("[Setup] SSID:", ssid);
    console.log("[Setup] Auth:", auth);
    console.log("[Setup] Encrypt:", encrypt);
    console.log("[Setup] Channel:", channel);
    console.log("[Setup] MAC:", mac);
    console.log("[Setup] Serial:", serial);
    console.log("[Setup] Password length:", password.length);

    // Encrypt the password
    // Use METHOD_2 by default - this works for most devices including Insight (rtos-based)
    // Method 2 is for devices with rtos=1 or new_algo=1
    // Method 3 is for devices with binaryOption=1 (less common)
    const encryptedPassword = encryptWifiPassword(
      password,
      mac,
      serial,
      EncryptionMethod.METHOD_2,
      true // Add length bytes for all methods
    );

    diagnostics.encryptedPassword = encryptedPassword;

    console.log("[Setup] ============================================");
    console.log("[Setup] Encryption Details");
    console.log("[Setup] ============================================");
    console.log("[Setup] Method:", EncryptionMethod.METHOD_2, "(rtos/new_algo devices)");
    console.log("[Setup] Add lengths:", true);
    console.log("[Setup] Original password length:", password.length);
    console.log("[Setup] Encrypted password (base64):", encryptedPassword);
    console.log("[Setup] Encrypted password length:", encryptedPassword.length);

    // Build SOAP payload
    const payload = buildConnectHomeNetworkPayload({
      ssid,
      password: encryptedPassword,
      auth,
      encrypt,
      channel,
    });

    diagnostics.soapPayload = payload;

    console.log("[Setup] ============================================");
    console.log("[Setup] SOAP Payload");
    console.log("[Setup] ============================================");
    console.log("[Setup] URL:", WEMO_WIFI_SETUP_URL);
    console.log("[Setup] Payload:");
    console.log(payload);

    const soapAction = `"${WIFI_SETUP_SERVICE_TYPE}#ConnectHomeNetwork"`;
    console.log("[Setup] SOAPACTION header:", soapAction);

    // Send twice for reliability (per pywemo recommendation)
    for (let attempt = 0; attempt < 2; attempt++) {
      const attemptInfo: (typeof diagnostics.attempts)[0] = {
        attempt: attempt + 1,
      };

      console.log("[Setup] ============================================");
      console.log(`[Setup] Attempt ${attempt + 1}/2`);
      console.log("[Setup] ============================================");

      try {
        const startTime = Date.now();
        const response = await fetch(WEMO_WIFI_SETUP_URL, {
          method: "POST",
          headers: {
            "Content-Type": "text/xml; charset=utf-8",
            SOAPACTION: soapAction,
          },
          body: payload,
          signal: AbortSignal.timeout(10000),
        });
        const elapsed = Date.now() - startTime;

        attemptInfo.status = response.status;
        console.log(`[Setup] Response status: ${response.status} (${elapsed}ms)`);

        // Log all response headers
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
          console.log(`[Setup] Response header: ${key}: ${value}`);
        });
        diagnostics.responseHeaders = headers;

        const text = await response.text();
        attemptInfo.response = text;
        diagnostics.rawResponse = text;

        console.log("[Setup] Response body:");
        console.log(text);

        if (response.ok) {
          // Try to parse PairingStatus from response
          const statusMatch = text.match(/<PairingStatus>([^<]+)<\/PairingStatus>/);
          const status = statusMatch?.[1] ?? "Sent";

          // Also look for any error
          const errorMatch = text.match(/<errorDescription>([^<]+)<\/errorDescription>/);
          if (errorMatch) {
            console.log("[Setup] SOAP error in response:", errorMatch[1]);
          }

          diagnostics.attempts.push(attemptInfo);
          diagnostics.responseStatus = response.status;

          console.log("[Setup] ============================================");
          console.log("[Setup] Result: SUCCESS");
          console.log("[Setup] PairingStatus:", status);
          console.log("[Setup] ============================================");

          return {
            success: true,
            status,
            diagnostics: verbose ? diagnostics : undefined,
          };
        }

        console.warn(`[Setup] Attempt ${attempt + 1} got non-OK status ${response.status}`);
        attemptInfo.error = `HTTP ${response.status}`;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        attemptInfo.error = errorMsg;
        console.warn(`[Setup] Attempt ${attempt + 1} failed:`, errorMsg);
      }

      diagnostics.attempts.push(attemptInfo);

      // Small delay between attempts
      if (attempt < 1) {
        console.log("[Setup] Waiting 500ms before retry...");
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log("[Setup] ============================================");
    console.log("[Setup] Result: FAILED after 2 attempts");
    console.log("[Setup] ============================================");

    return {
      success: false,
      error: "Failed to send setup command after 2 attempts",
      diagnostics: verbose ? diagnostics : undefined,
    };
  } catch (error) {
    console.error("[Setup] Error sending WiFi connect command:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      diagnostics: verbose ? diagnostics : undefined,
    };
  }
}

// ============================================
// Diagnostic SOAP Commands
// ============================================

/**
 * Result from a diagnostic SOAP call.
 */
export interface SoapDiagnosticResult {
  success: boolean;
  url: string;
  action: string;
  requestPayload: string;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  error?: string;
  duration?: number;
}

/**
 * Sends a raw SOAP command and returns full diagnostic info.
 */
export async function sendRawSoapCommand(
  url: string,
  action: string,
  payload: string,
  timeout = 10000
): Promise<SoapDiagnosticResult> {
  console.log("[Diagnostic] ============================================");
  console.log("[Diagnostic] Raw SOAP Request");
  console.log("[Diagnostic] URL:", url);
  console.log("[Diagnostic] SOAPACTION:", action);
  console.log("[Diagnostic] Payload:");
  console.log(payload);
  console.log("[Diagnostic] ============================================");

  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPACTION: action,
      },
      body: payload,
      signal: AbortSignal.timeout(timeout),
    });
    const duration = Date.now() - startTime;

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const body = await response.text();

    console.log("[Diagnostic] Response status:", response.status);
    console.log("[Diagnostic] Response headers:", JSON.stringify(headers, null, 2));
    console.log("[Diagnostic] Response body:");
    console.log(body);
    console.log("[Diagnostic] Duration:", duration, "ms");

    return {
      success: response.ok,
      url,
      action,
      requestPayload: payload,
      responseStatus: response.status,
      responseHeaders: headers,
      responseBody: body,
      duration,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[Diagnostic] Error:", errorMsg);

    return {
      success: false,
      url,
      action,
      requestPayload: payload,
      error: errorMsg,
    };
  }
}

/**
 * Gets the list of available AP networks from the Wemo device.
 */
export async function getApList(): Promise<SoapDiagnosticResult> {
  const payload = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
    "<s:Body>",
    `<u:GetApList xmlns:u="${WIFI_SETUP_SERVICE_TYPE}">`,
    "</u:GetApList>",
    "</s:Body>",
    "</s:Envelope>",
  ].join("");

  return sendRawSoapCommand(WEMO_WIFI_SETUP_URL, `"${WIFI_SETUP_SERVICE_TYPE}#GetApList"`, payload);
}

/**
 * Gets the network status from the Wemo device.
 */
export async function getNetworkStatus(): Promise<SoapDiagnosticResult> {
  const payload = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
    "<s:Body>",
    `<u:GetNetworkStatus xmlns:u="${WIFI_SETUP_SERVICE_TYPE}">`,
    "</u:GetNetworkStatus>",
    "</s:Body>",
    "</s:Envelope>",
  ].join("");

  return sendRawSoapCommand(
    WEMO_WIFI_SETUP_URL,
    `"${WIFI_SETUP_SERVICE_TYPE}#GetNetworkStatus"`,
    payload
  );
}

/**
 * Closes the current network setup (cancels pairing mode).
 */
export async function closeSetup(): Promise<SoapDiagnosticResult> {
  const payload = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
    "<s:Body>",
    `<u:CloseSetup xmlns:u="${WIFI_SETUP_SERVICE_TYPE}">`,
    "</u:CloseSetup>",
    "</s:Body>",
    "</s:Envelope>",
  ].join("");

  return sendRawSoapCommand(
    WEMO_WIFI_SETUP_URL,
    `"${WIFI_SETUP_SERVICE_TYPE}#CloseSetup"`,
    payload
  );
}
