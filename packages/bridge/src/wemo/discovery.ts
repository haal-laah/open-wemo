/**
 * SSDP Discovery for WeMo Devices
 *
 * Uses Simple Service Discovery Protocol (SSDP) to find WeMo devices
 * on the local network via UDP multicast.
 */

import * as dgram from "node:dgram";
import { networkInterfaces } from "node:os";
import { XMLParser } from "fast-xml-parser";
import type {
  DiscoveryOptions,
  DiscoveryResult,
  WemoDevice,
  WemoDeviceType,
  WemoService,
} from "./types";

/**
 * SSDP multicast address and port.
 */
const SSDP_ADDRESS = "239.255.255.250";
const SSDP_PORT = 1900;

/**
 * WeMo-specific search target.
 * All WeMo devices respond to this service URN (not device URNs).
 * See: https://github.com/pywemo/pywemo/blob/main/pywemo/ssdp.py
 */
const WEMO_SEARCH_TARGET = "urn:Belkin:service:basicevent:1";

/**
 * Default discovery timeout in milliseconds.
 */
const DEFAULT_TIMEOUT = 5000;

/**
 * Gets all IPv4 addresses for local network interfaces.
 * Filters out loopback and internal addresses.
 */
function getInterfaceAddresses(): string[] {
  const interfaces = networkInterfaces();
  const addresses: string[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;

    // Skip virtual/VPN interfaces
    const lowerName = name.toLowerCase();
    if (
      lowerName.includes("virtual") ||
      lowerName.includes("vethernet") ||
      lowerName.includes("vmware") ||
      lowerName.includes("vmnet") ||
      lowerName.includes("vbox") ||
      lowerName.includes("docker") ||
      lowerName.includes("br-") ||
      lowerName.includes("veth") ||
      lowerName.includes("wsl") ||
      lowerName.includes("loopback")
    ) {
      continue;
    }

    for (const addr of addrs) {
      // Only IPv4, non-internal addresses
      if (addr.family === "IPv4" && !addr.internal) {
        addresses.push(addr.address);
      }
    }
  }

  return addresses;
}

/**
 * XML parser for device descriptions.
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
 * Builds an SSDP M-SEARCH request message.
 */
function buildMSearchMessage(searchTarget: string): Buffer {
  const message = [
    "M-SEARCH * HTTP/1.1",
    `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}`,
    'MAN: "ssdp:discover"',
    "MX: 3",
    `ST: ${searchTarget}`,
    "",
    "",
  ].join("\r\n");

  return Buffer.from(message, "utf-8");
}

/**
 * Parses an SSDP response to extract the location URL.
 */
function parseSsdpResponse(response: string): string | null {
  const lines = response.split("\r\n");

  for (const line of lines) {
    const match = line.match(/^LOCATION:\s*(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Determines the WeMo device type from the device description.
 */
function determineDeviceType(deviceType: string, modelName: string): WemoDeviceType {
  const type = deviceType.toLowerCase();
  const model = modelName.toLowerCase();

  if (type.includes("insight")) {
    return "Insight" as WemoDeviceType;
  }
  if (type.includes("lightswitch")) {
    return "LightSwitch" as WemoDeviceType;
  }
  if (type.includes("dimmer")) {
    return "Dimmer" as WemoDeviceType;
  }
  if (type.includes("sensor") || type.includes("motion")) {
    return "Motion" as WemoDeviceType;
  }
  if (type.includes("bridge")) {
    return "Bulb" as WemoDeviceType;
  }

  // Check model name for Mini
  if (model.includes("mini") || model.includes("wss")) {
    return "Mini" as WemoDeviceType;
  }

  // Default to Switch for controllee devices
  if (type.includes("controllee") || type.includes("socket")) {
    return "Switch" as WemoDeviceType;
  }

  return "Unknown" as WemoDeviceType;
}

/**
 * Parses services from device description XML.
 */
function parseServices(serviceList: unknown): WemoService[] {
  if (!serviceList || typeof serviceList !== "object") {
    return [];
  }

  const services: WemoService[] = [];
  const list = serviceList as Record<string, unknown>;
  let serviceArray = list.service;

  // Handle single service vs array
  if (!Array.isArray(serviceArray)) {
    serviceArray = serviceArray ? [serviceArray] : [];
  }

  for (const svc of serviceArray as Array<Record<string, unknown>>) {
    services.push({
      serviceType: String(svc.serviceType ?? ""),
      serviceId: String(svc.serviceId ?? ""),
      controlURL: String(svc.controlURL ?? ""),
      eventSubURL: String(svc.eventSubURL ?? ""),
      SCPDURL: String(svc.SCPDURL ?? ""),
    });
  }

  return services;
}

/**
 * Fetches and parses the device description XML from a location URL.
 */
async function fetchDeviceDescription(locationUrl: string): Promise<WemoDevice | null> {
  try {
    const response = await fetch(locationUrl, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return null;
    }

    const xml = await response.text();
    const parsed = xmlParser.parse(xml);

    const root = parsed.root;
    if (!root) {
      return null;
    }

    const device = root.device;
    if (!device) {
      return null;
    }

    // Check if it's a Belkin device
    const manufacturer = String(device.manufacturer ?? "");
    if (!manufacturer.toLowerCase().includes("belkin")) {
      return null;
    }

    // Parse URL to get host and port
    const url = new URL(locationUrl);
    const host = url.hostname;
    const port = Number.parseInt(url.port, 10) || 49153;

    // Extract device info
    const deviceType = String(device.deviceType ?? "");
    const modelName = String(device.modelName ?? "");

    const wemoDevice: WemoDevice = {
      id: String(device.UDN ?? `wemo-${host}-${port}`),
      name: String(device.friendlyName ?? "Unknown WeMo Device"),
      deviceType: determineDeviceType(deviceType, modelName),
      host,
      port,
      manufacturer,
      model: modelName,
      serialNumber: String(device.serialNumber ?? ""),
      firmwareVersion: String(device.firmwareVersion ?? ""),
      macAddress: String(device.macAddress ?? ""),
      services: parseServices(device.serviceList),
      setupUrl: locationUrl,
    };

    return wemoDevice;
  } catch {
    // Silently ignore fetch errors (device might be unavailable)
    return null;
  }
}

/**
 * Discovers WeMo devices on the local network using SSDP.
 *
 * @param options - Discovery options
 * @returns Discovery result with found devices
 *
 * @example
 * ```ts
 * const result = await discoverDevices({ timeout: 5000 });
 * console.log(`Found ${result.devices.length} devices`);
 *
 * for (const device of result.devices) {
 *   console.log(`- ${device.name} (${device.deviceType}) at ${device.host}`);
 * }
 * ```
 */
export async function discoverDevices(options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const startTime = Date.now();
  const errors: string[] = [];

  // Set to track unique location URLs (dedup responses)
  const locationUrls = new Set<string>();

  // Get all interface addresses to bind sockets to
  const interfaceAddresses = getInterfaceAddresses();

  // If no interfaces found, fall back to binding to 0.0.0.0
  if (interfaceAddresses.length === 0) {
    interfaceAddresses.push("0.0.0.0");
  }

  return new Promise((resolve) => {
    const sockets: dgram.Socket[] = [];
    let finished = false;

    const ssdpTarget = { address: SSDP_ADDRESS, port: SSDP_PORT };
    const message = buildMSearchMessage(WEMO_SEARCH_TARGET);

    // Create a socket for each interface and send M-SEARCH from each
    for (const addr of interfaceAddresses) {
      try {
        const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

        socket.on("error", (err) => {
          errors.push(`Socket error on ${addr}: ${err.message}`);
          // Don't close all sockets on one error, just remove this one
          const idx = sockets.indexOf(socket);
          if (idx !== -1) {
            sockets.splice(idx, 1);
            try {
              socket.close();
            } catch {
              // Ignore close errors
            }
          }
        });

        socket.on("message", (msg) => {
          const response = msg.toString("utf-8");
          const location = parseSsdpResponse(response);

          if (location && !locationUrls.has(location)) {
            locationUrls.add(location);
          }
        });

        // Bind to this specific interface address
        socket.bind(0, addr, () => {
          // Send M-SEARCH to multicast group
          socket.send(message, 0, message.length, ssdpTarget.port, ssdpTarget.address);
        });

        sockets.push(socket);
      } catch (err) {
        errors.push(
          `Failed to create socket for ${addr}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Set up timeout to end discovery
    const timeoutId = setTimeout(() => {
      finishDiscovery();
    }, timeout);

    // Also send a second M-SEARCH halfway through timeout for reliability
    const resendTimeoutId = setTimeout(() => {
      for (const socket of sockets) {
        try {
          socket.send(message, 0, message.length, ssdpTarget.port, ssdpTarget.address);
        } catch {
          // Ignore send errors on resend
        }
      }
    }, timeout / 2);

    async function finishDiscovery(): Promise<void> {
      // Prevent double-finish
      if (finished) {
        return;
      }
      finished = true;

      clearTimeout(timeoutId);
      clearTimeout(resendTimeoutId);

      // Close all sockets
      for (const socket of sockets) {
        try {
          socket.close();
        } catch {
          // Ignore close errors
        }
      }

      // Fetch device descriptions for all discovered locations
      const devicePromises = Array.from(locationUrls).map((url) => fetchDeviceDescription(url));

      const deviceResults = await Promise.all(devicePromises);

      // Filter out nulls and non-WeMo devices
      const devices = deviceResults.filter((d): d is WemoDevice => d !== null);

      // Deduplicate by ID (same device might respond to multiple search targets)
      const uniqueDevices = new Map<string, WemoDevice>();
      for (const device of devices) {
        if (!uniqueDevices.has(device.id)) {
          uniqueDevices.set(device.id, device);
        }
      }

      resolve({
        devices: Array.from(uniqueDevices.values()),
        scanDuration: Date.now() - startTime,
        errors,
      });
    }
  });
}

/**
 * Creates a setup URL for a device at a known IP address.
 * Useful for connecting to a device without full discovery.
 *
 * @param host - Device IP address
 * @param port - Device port (default: 49153)
 * @returns Setup URL for the device
 */
export function setupUrlForAddress(host: string, port = 49153): string {
  return `http://${host}:${port}/setup.xml`;
}

/**
 * Fetches device info from a known IP address without SSDP discovery.
 *
 * @param host - Device IP address
 * @param port - Device port (default: 49153)
 * @returns WemoDevice if found, null otherwise
 */
export async function getDeviceByAddress(host: string, port = 49153): Promise<WemoDevice | null> {
  const url = setupUrlForAddress(host, port);
  return fetchDeviceDescription(url);
}
