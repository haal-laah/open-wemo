/**
 * Setup API Routes
 *
 * Endpoints for device WiFi setup flow.
 */

import { Hono } from "hono";
import {
  type WifiConnectParams,
  detectSetupDevice,
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
      });
    }

    console.error("[Setup API] WiFi setup failed:", result.error);
    return c.json({
      success: false,
      error: result.error ?? "Failed to send setup command",
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
