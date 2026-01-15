/**
 * Discovery API Routes
 *
 * Endpoints for discovering WeMo devices on the network.
 */

import { Hono } from "hono";
import { getDatabase } from "../../db";
import { discoverDevices } from "../../wemo/discovery";
import type { WemoDevice } from "../../wemo/types";

/**
 * Discovery routes.
 */
export const discoveryRoutes = new Hono();

/**
 * Rate limiting for discovery endpoint.
 * Prevents network flooding from rapid discovery requests.
 */
const DISCOVERY_COOLDOWN_MS = 5000; // 5 seconds between discovery requests
let lastDiscoveryTime = 0;

/**
 * GET /api/discover
 *
 * Scans the network for WeMo devices.
 *
 * Query Parameters:
 * - timeout: Scan timeout in seconds (default: 5, max: 30)
 * - save: Whether to save discovered devices to database (default: false)
 *
 * Response:
 * {
 *   devices: WemoDevice[],
 *   duration: number,
 *   saved: number,
 *   errors: string[]
 * }
 *
 * Rate limited: minimum 5 seconds between requests
 */
discoveryRoutes.get("/", async (c) => {
  // Rate limiting check
  const now = Date.now();
  const timeSinceLastDiscovery = now - lastDiscoveryTime;

  if (timeSinceLastDiscovery < DISCOVERY_COOLDOWN_MS) {
    const waitTime = Math.ceil((DISCOVERY_COOLDOWN_MS - timeSinceLastDiscovery) / 1000);
    return c.json(
      {
        error: true,
        message: `Discovery rate limited. Please wait ${waitTime} seconds before scanning again.`,
        code: "RATE_LIMITED",
        retryAfter: waitTime,
      },
      429
    );
  }

  lastDiscoveryTime = now;
  // Parse timeout (default 5 seconds, max 30)
  const timeoutParam = c.req.query("timeout");
  const timeout = Math.min(Math.max(Number.parseInt(timeoutParam ?? "5", 10) || 5, 1), 30) * 1000;

  // Parse save flag
  const saveParam = c.req.query("save");
  const shouldSave = saveParam === "true" || saveParam === "1";

  try {
    // Run discovery
    const result = await discoverDevices({ timeout });

    // Merge with saved devices to add any offline devices
    const db = getDatabase();
    const savedDevices = db.getAllDevices();

    // Create a map of discovered device IDs
    const discoveredIds = new Set(result.devices.map((d) => d.id));

    // Add saved devices that weren't discovered (offline)
    const offlineDevices: WemoDevice[] = savedDevices
      .filter((saved) => !discoveredIds.has(saved.id))
      .map((saved) => ({
        id: saved.id,
        name: saved.name,
        deviceType: saved.deviceType,
        host: saved.host,
        port: saved.port,
        manufacturer: "Belkin International Inc.",
        model: "",
        serialNumber: "",
        firmwareVersion: "",
        macAddress: "",
        services: [],
        setupUrl: `http://${saved.host}:${saved.port}/setup.xml`,
      }));

    // Mark discovered devices as online in response
    const devicesWithStatus = result.devices.map((device) => ({
      ...device,
      isOnline: true,
    }));

    // Add offline devices to response
    const allDevices = [
      ...devicesWithStatus,
      ...offlineDevices.map((d) => ({ ...d, isOnline: false })),
    ];

    // Save discovered devices if requested
    let savedCount = 0;
    if (shouldSave) {
      for (const device of result.devices) {
        db.saveDevice({
          id: device.id,
          name: device.name,
          deviceType: device.deviceType,
          host: device.host,
          port: device.port,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        db.updateLastSeen(device.id);
        savedCount++;
      }
    } else {
      // Still update last_seen for discovered devices that are already saved
      for (const device of result.devices) {
        const existing = db.getDeviceById(device.id);
        if (existing) {
          db.updateLastSeen(device.id);
        }
      }
    }

    return c.json({
      devices: allDevices,
      duration: result.scanDuration,
      discovered: result.devices.length,
      offline: offlineDevices.length,
      saved: savedCount,
      errors: result.errors,
    });
  } catch (error) {
    console.error("[Discovery] Error:", error);
    return c.json(
      {
        error: true,
        message: error instanceof Error ? error.message : "Discovery failed",
        code: "DISCOVERY_ERROR",
      },
      500
    );
  }
});

/**
 * GET /api/discover/:host
 *
 * Attempts to discover a device at a specific IP address.
 *
 * Path Parameters:
 * - host: IP address of the device
 *
 * Query Parameters:
 * - port: Device port (default: 49153)
 * - save: Whether to save the device (default: false)
 */
discoveryRoutes.get("/:host", async (c) => {
  const host = c.req.param("host");
  const portParam = c.req.query("port");
  const port = Number.parseInt(portParam ?? "49153", 10) || 49153;
  const saveParam = c.req.query("save");
  const shouldSave = saveParam === "true" || saveParam === "1";

  try {
    const { getDeviceByAddress } = await import("../../wemo/discovery");
    const device = await getDeviceByAddress(host, port);

    if (!device) {
      return c.json(
        {
          error: true,
          message: `No WeMo device found at ${host}:${port}`,
          code: "DEVICE_NOT_FOUND",
        },
        404
      );
    }

    // Save if requested
    if (shouldSave) {
      const db = getDatabase();
      db.saveDevice({
        id: device.id,
        name: device.name,
        deviceType: device.deviceType,
        host: device.host,
        port: device.port,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      db.updateLastSeen(device.id);
    }

    return c.json({
      device: { ...device, isOnline: true },
      saved: shouldSave,
    });
  } catch (error) {
    console.error(`[Discovery] Error fetching ${host}:${port}:`, error);
    return c.json(
      {
        error: true,
        message: error instanceof Error ? error.message : "Failed to connect to device",
        code: "CONNECTION_ERROR",
      },
      500
    );
  }
});
