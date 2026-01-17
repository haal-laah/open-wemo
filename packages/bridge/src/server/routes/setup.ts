/**
 * Setup API Routes
 *
 * Endpoints for device WiFi setup flow.
 */

import { Hono } from "hono";
import {
  EncryptionMethod,
  WEMO_WIFI_SETUP_URL,
  type WifiConnectParams,
  closeSetup,
  detectSetupDevice,
  encryptWifiPassword,
  getApList,
  getNetworkStatus,
  sendRawSoapCommand,
  sendWifiConnectCommand,
} from "../../wemo/setup";

export const setupRoutes = new Hono();

/**
 * GET /api/setup/detect
 *
 * Detects if the bridge is on a Wemo AP network and fetches device info.
 */
setupRoutes.get("/detect", async (c) => {
  console.log("[Setup API] Detecting Wemo AP...");

  const result = await detectSetupDevice();

  if (result.onWemoAp && result.device) {
    console.log("[Setup API] Device found:", result.device.name);
  } else if (result.onWemoAp) {
    console.log("[Setup API] On Wemo AP but no device info");
  } else {
    console.log("[Setup API] Not on Wemo AP");
  }

  return c.json(result);
});

/**
 * POST /api/setup/connect
 *
 * Sends WiFi credentials to the Wemo device.
 */
setupRoutes.post("/connect", async (c) => {
  console.log("[Setup API] WiFi connect request received");

  try {
    const body = await c.req.json();
    const { ssid, password, auth, encrypt, mac, serial, channel } = body as {
      ssid?: string;
      password?: string;
      auth?: string;
      encrypt?: string;
      mac?: string;
      serial?: string;
      channel?: number;
    };

    // Validate required fields
    if (!ssid || typeof ssid !== "string") {
      return c.json({ success: false, error: "Missing or invalid ssid" }, 400);
    }

    if (!mac || typeof mac !== "string") {
      return c.json({ success: false, error: "Missing or invalid mac" }, 400);
    }

    if (!serial || typeof serial !== "string") {
      return c.json({ success: false, error: "Missing or invalid serial" }, 400);
    }

    // Auth defaults
    const authMode = auth === "OPEN" ? "OPEN" : auth === "WPA" ? "WPA" : "WPA2";
    const encryptMode = encrypt === "NONE" ? "NONE" : encrypt === "TKIP" ? "TKIP" : "AES";

    // Password required unless open network
    if (authMode !== "OPEN" && (!password || typeof password !== "string")) {
      return c.json({ success: false, error: "Password required for secured network" }, 400);
    }

    console.log("[Setup API] Connecting to WiFi:", { ssid, auth: authMode, encrypt: encryptMode });

    const params: WifiConnectParams = {
      ssid,
      password: password ?? "",
      auth: authMode as "OPEN" | "WPA" | "WPA2",
      encrypt: encryptMode as "NONE" | "AES" | "TKIP",
      mac,
      serial,
      channel: channel ?? 0,
    };

    const result = await sendWifiConnectCommand(params);

    if (result.success) {
      console.log("[Setup API] WiFi setup command sent successfully");
      return c.json({
        success: true,
        status: result.status,
        message: "Device is connecting to WiFi network",
        diagnostics: result.diagnostics,
      });
    }

    console.error("[Setup API] WiFi setup failed:", result.error);
    return c.json({
      success: false,
      error: result.error ?? "Failed to send setup command",
      diagnostics: result.diagnostics,
    });
  } catch (error) {
    console.error("[Setup API] Error processing connect request:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      500
    );
  }
});

// ============================================
// Diagnostic Endpoints
// ============================================

/**
 * GET /api/setup/diag/aplist
 *
 * Gets the list of available WiFi networks visible to the Wemo device.
 */
setupRoutes.get("/diag/aplist", async (c) => {
  console.log("[Setup API] Diagnostic: GetApList");
  const result = await getApList();
  return c.json(result);
});

/**
 * GET /api/setup/diag/network-status
 *
 * Gets the current network status of the Wemo device.
 */
setupRoutes.get("/diag/network-status", async (c) => {
  console.log("[Setup API] Diagnostic: GetNetworkStatus");
  const result = await getNetworkStatus();
  return c.json(result);
});

/**
 * POST /api/setup/diag/close
 *
 * Closes/cancels the current setup process.
 */
setupRoutes.post("/diag/close", async (c) => {
  console.log("[Setup API] Diagnostic: CloseSetup");
  const result = await closeSetup();
  return c.json(result);
});

/**
 * POST /api/setup/diag/raw-soap
 *
 * Sends a raw SOAP command for debugging.
 */
setupRoutes.post("/diag/raw-soap", async (c) => {
  console.log("[Setup API] Diagnostic: Raw SOAP");
  try {
    const body = await c.req.json();
    const { url, action, payload, timeout } = body as {
      url?: string;
      action?: string;
      payload?: string;
      timeout?: number;
    };

    if (!url || !action || !payload) {
      return c.json({ error: "Missing url, action, or payload" }, 400);
    }

    const result = await sendRawSoapCommand(url, action, payload, timeout);
    return c.json(result);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

/**
 * POST /api/setup/diag/encrypt
 *
 * Test password encryption with given parameters.
 */
setupRoutes.post("/diag/encrypt", async (c) => {
  console.log("[Setup API] Diagnostic: Encrypt password");
  try {
    const body = await c.req.json();
    const { password, mac, serial, method, addLengths } = body as {
      password?: string;
      mac?: string;
      serial?: string;
      method?: number;
      addLengths?: boolean;
    };

    if (!password || !mac || !serial) {
      return c.json({ error: "Missing password, mac, or serial" }, 400);
    }

    const encMethod = method ?? EncryptionMethod.METHOD_2;
    const withLengths = addLengths ?? true;

    console.log("[Setup API] Encrypting:", {
      mac,
      serial,
      method: encMethod,
      addLengths: withLengths,
    });

    const encrypted = encryptWifiPassword(password, mac, serial, encMethod, withLengths);

    return c.json({
      input: {
        password: password.replace(/./g, "*"),
        passwordLength: password.length,
        mac,
        serial,
        method: encMethod,
        addLengths: withLengths,
      },
      encrypted,
      encryptedLength: encrypted.length,
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

/**
 * GET /api/setup/diag/info
 *
 * Returns diagnostic info about the current setup state.
 */
setupRoutes.get("/diag/info", async (c) => {
  console.log("[Setup API] Diagnostic: Info");

  const detect = await detectSetupDevice();
  const apList = detect.onWemoAp ? await getApList() : null;
  const networkStatus = detect.onWemoAp ? await getNetworkStatus() : null;

  return c.json({
    detection: detect,
    apList: apList
      ? {
          success: apList.success,
          responseStatus: apList.responseStatus,
          responseBody: apList.responseBody,
        }
      : null,
    networkStatus: networkStatus
      ? {
          success: networkStatus.success,
          responseStatus: networkStatus.responseStatus,
          responseBody: networkStatus.responseBody,
        }
      : null,
    endpoints: {
      wifiSetupUrl: WEMO_WIFI_SETUP_URL,
    },
  });
});
