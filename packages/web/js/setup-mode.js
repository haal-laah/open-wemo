/**
 * Setup Mode Detection Module
 *
 * Detects when the phone is connected to a Wemo device's AP (Access Point)
 * for initial device setup, and provides CORS connectivity tests.
 *
 * Wemo devices in setup mode:
 * - Broadcast AP with SSID pattern: "Wemo.<DeviceType>.<XXX>" (e.g., "Wemo.Insight.123")
 * - Are reachable at 10.22.22.1:49152
 * - Respond to SOAP/HTTP requests for WiFi configuration
 */

// ============================================
// Constants
// ============================================

/** IP address of Wemo device in AP mode */
export const WEMO_AP_IP = "10.22.22.1";

/** Port used by Wemo device in AP mode */
export const WEMO_AP_PORT = 49152;

/** Base URL for Wemo device in AP mode */
export const WEMO_SETUP_URL = `http://${WEMO_AP_IP}:${WEMO_AP_PORT}`;

/** Timeout for connectivity checks (ms) */
const CONNECTIVITY_TIMEOUT = 3000;

/**
 * Test names used by CORS connectivity tests.
 * Shared between setup-mode.js and app.js for consistency.
 * @readonly
 */
export const TEST_NAMES = {
  NO_CORS_GET: "GET /setup.xml (no-cors)",
  CORS_GET: "GET /setup.xml",
  FETCH_SCRIPT_TAG: "Load via <script> tag",
  FETCH_OBJECT_TAG: "Load via <object> tag",
  JSONP_CALLBACK: "JSONP callback attempt",
  SOAP_POST: "SOAP POST (BasicEvent)",
  SOAP_TEXT_PLAIN: "SOAP POST (text/plain hack)",
  SOAP_FORM_URLENCODED: "SOAP POST (form-urlencoded)",
  SEND_BEACON: "sendBeacon (fire-and-forget)",
  WEBSOCKET_PROBE: "WebSocket probe",
  WIFI_SETUP: "WiFiSetup.GetApList",
};

// ============================================
// Network Mode Detection
// ============================================

/**
 * Network modes the PWA can be in.
 * @readonly
 * @enum {string}
 */
export const NetworkMode = {
  /** Connected to home network with bridge accessible */
  NORMAL: "NORMAL",
  /** Connected to Wemo AP - device setup mode */
  SETUP_MODE: "SETUP_MODE",
  /** No network connectivity or bridge unreachable */
  OFFLINE: "OFFLINE",
};

/**
 * Attempts to reach the Wemo device at its AP address.
 * Uses a simple fetch to setup.xml which all Wemo devices serve.
 *
 * @returns {Promise<boolean>} True if Wemo AP is reachable
 */
export async function canReachWemoAP() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT);

    // Try to fetch setup.xml - all Wemo devices serve this
    // Using no-cors mode since we just want to check reachability
    const response = await fetch(`${WEMO_SETUP_URL}/setup.xml`, {
      method: "GET",
      mode: "no-cors", // Will get opaque response but confirms reachability
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // In no-cors mode, we get an opaque response (type: "opaque")
    // A successful fetch means the device is reachable
    // response.ok will be false for opaque responses, but response.type tells us it worked
    return response.type === "opaque" || response.ok;
  } catch (error) {
    console.log("[SetupMode] Cannot reach Wemo AP:", error.message);
    return false;
  }
}

/**
 * Attempts to reach the Open Wemo bridge.
 *
 * @returns {Promise<boolean>} True if bridge is reachable
 */
export async function canReachBridge() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT);

    const response = await fetch("/api/health", {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.log("[SetupMode] Cannot reach bridge:", error.message);
    return false;
  }
}

/**
 * Detects the current network mode.
 *
 * Priority:
 * 1. If bridge is reachable -> NORMAL (user is on home network)
 * 2. If Wemo AP is reachable -> SETUP_MODE (user connected to Wemo AP)
 * 3. Otherwise -> OFFLINE
 *
 * @returns {Promise<NetworkMode>} The detected network mode
 */
export async function detectNetworkMode() {
  console.log("[SetupMode] Detecting network mode...");

  // Check bridge first - if reachable, we're in normal mode
  const bridgeReachable = await canReachBridge();
  if (bridgeReachable) {
    console.log("[SetupMode] Bridge reachable - NORMAL mode");
    return NetworkMode.NORMAL;
  }

  // Bridge not reachable - check if we're on Wemo AP
  const wemoAPReachable = await canReachWemoAP();
  if (wemoAPReachable) {
    console.log("[SetupMode] Wemo AP reachable - SETUP_MODE");
    return NetworkMode.SETUP_MODE;
  }

  // Neither reachable - offline
  console.log("[SetupMode] Nothing reachable - OFFLINE mode");
  return NetworkMode.OFFLINE;
}

// ============================================
// CORS Connectivity Tests
// ============================================

/**
 * Test result structure.
 * @typedef {Object} TestResult
 * @property {string} name - Test name
 * @property {boolean} success - Whether the test passed
 * @property {string} message - Human-readable result message
 * @property {string} [details] - Additional details (e.g., response data)
 * @property {number} [duration] - Test duration in ms
 */

/**
 * Tests a simple GET request to /setup.xml.
 * This is the most basic connectivity test.
 *
 * @returns {Promise<TestResult>}
 */
export async function testGetSetupXml() {
  const startTime = performance.now();
  const testName = TEST_NAMES.CORS_GET;

  try {
    // First try with cors mode to see if we can read the response
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT);

    const response = await fetch(`${WEMO_SETUP_URL}/setup.xml`, {
      method: "GET",
      mode: "cors",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = Math.round(performance.now() - startTime);

    if (response.ok) {
      const text = await response.text();
      return {
        name: testName,
        success: true,
        message: "CORS allowed - can read response",
        details: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
        duration,
      };
    }

    return {
      name: testName,
      success: false,
      message: `HTTP ${response.status}: ${response.statusText}`,
      duration,
    };
  } catch (error) {
    // If CORS fails, try no-cors to see if at least reachable
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT);

      const response = await fetch(`${WEMO_SETUP_URL}/setup.xml`, {
        method: "GET",
        mode: "no-cors",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration = Math.round(performance.now() - startTime);

      if (response.type === "opaque") {
        return {
          name: testName,
          success: false,
          message: "CORS blocked - device reachable but cannot read response",
          details: "Browser security prevents reading cross-origin responses without CORS headers",
          duration,
        };
      }
    } catch {
      // Completely unreachable
    }

    const duration = Math.round(performance.now() - startTime);
    return {
      name: testName,
      success: false,
      message: `Network error: ${error.message}`,
      duration,
    };
  }
}

/**
 * Tests loading setup.xml via a <script> tag.
 * Script tags bypass CORS but the content must be valid JavaScript.
 * If the XML triggers a syntax error, we know the content was fetched.
 * We try to capture the raw text via error handling.
 *
 * @returns {Promise<TestResult>}
 */
export async function testScriptTag() {
  const startTime = performance.now();
  const testName = TEST_NAMES.FETCH_SCRIPT_TAG;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({
        name: testName,
        success: false,
        message: "Timeout - no response from script tag",
        duration: CONNECTIVITY_TIMEOUT,
      });
    }, CONNECTIVITY_TIMEOUT);

    const script = document.createElement("script");
    script.type = "text/javascript";

    script.onload = () => {
      clearTimeout(timeout);
      const duration = Math.round(performance.now() - startTime);
      document.head.removeChild(script);
      resolve({
        name: testName,
        success: true,
        message: "Script loaded (unexpected for XML)",
        details: "The content was somehow valid JavaScript",
        duration,
      });
    };

    script.onerror = () => {
      clearTimeout(timeout);
      const duration = Math.round(performance.now() - startTime);
      document.head.removeChild(script);
      // An error here could mean:
      // 1. Network error (blocked)
      // 2. Content fetched but not valid JS (this is what we hope for!)
      resolve({
        name: testName,
        success: false,
        message: "Script load error",
        details:
          "Content was fetched but isn't valid JS (expected for XML). Unfortunately we cannot read the content.",
        duration,
      });
    };

    script.src = `${WEMO_SETUP_URL}/setup.xml`;
    document.head.appendChild(script);
  });
}

/**
 * Tests loading setup.xml via an <object> tag.
 * Object tags can sometimes load cross-origin content and expose it
 * through contentDocument (though usually blocked by same-origin policy).
 *
 * @returns {Promise<TestResult>}
 */
export async function testObjectTag() {
  const startTime = performance.now();
  const testName = TEST_NAMES.FETCH_OBJECT_TAG;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (object.parentNode) {
        document.body.removeChild(object);
      }
      resolve({
        name: testName,
        success: false,
        message: "Timeout",
        duration: CONNECTIVITY_TIMEOUT,
      });
    }, CONNECTIVITY_TIMEOUT);

    const object = document.createElement("object");
    object.type = "text/xml";
    object.data = `${WEMO_SETUP_URL}/setup.xml`;
    object.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;";

    object.onload = () => {
      clearTimeout(timeout);
      const duration = Math.round(performance.now() - startTime);

      // Try to read the content
      let content = null;
      try {
        // Try contentDocument (usually blocked by same-origin)
        if (object.contentDocument) {
          content = object.contentDocument.documentElement.outerHTML;
        }
      } catch {
        // Same-origin policy blocked access
      }

      try {
        // Try getSVGDocument (for SVG, but worth a shot)
        if (object.getSVGDocument?.()) {
          content = object.getSVGDocument().documentElement.outerHTML;
        }
      } catch {
        // Blocked
      }

      document.body.removeChild(object);

      if (content) {
        resolve({
          name: testName,
          success: true,
          message: "Object loaded AND content readable!",
          details: `${content.substring(0, 300)}...`,
          duration,
        });
      } else {
        resolve({
          name: testName,
          success: false,
          message: "Object loaded but content blocked",
          details: "Same-origin policy prevents reading cross-origin object content",
          duration,
        });
      }
    };

    object.onerror = () => {
      clearTimeout(timeout);
      const duration = Math.round(performance.now() - startTime);
      if (object.parentNode) {
        document.body.removeChild(object);
      }
      resolve({
        name: testName,
        success: false,
        message: "Object load error",
        duration,
      });
    };

    document.body.appendChild(object);
  });
}

/**
 * Tests JSONP-style callback.
 * Some embedded devices support a callback parameter that wraps the response
 * in a JavaScript function call, making it loadable via <script> tag.
 *
 * @returns {Promise<TestResult>}
 */
export async function testJsonpCallback() {
  const startTime = performance.now();
  const testName = TEST_NAMES.JSONP_CALLBACK;

  return new Promise((resolve) => {
    const callbackName = `wemoCallback_${Date.now()}`;
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        delete window[callbackName];
        if (script.parentNode) {
          document.head.removeChild(script);
        }
        resolve({
          name: testName,
          success: false,
          message: "Timeout - device doesn't support JSONP",
          duration: CONNECTIVITY_TIMEOUT,
        });
      }
    }, CONNECTIVITY_TIMEOUT);

    // Create global callback function
    window[callbackName] = (data) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        delete window[callbackName];
        if (script.parentNode) {
          document.head.removeChild(script);
        }
        const duration = Math.round(performance.now() - startTime);
        resolve({
          name: testName,
          success: true,
          message: "JSONP callback received data!",
          details: JSON.stringify(data).substring(0, 300),
          duration,
        });
      }
    };

    const script = document.createElement("script");

    script.onerror = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        delete window[callbackName];
        if (script.parentNode) {
          document.head.removeChild(script);
        }
        const duration = Math.round(performance.now() - startTime);
        resolve({
          name: testName,
          success: false,
          message: "Script load failed (no JSONP support)",
          duration,
        });
      }
    };

    // Try common JSONP parameter names
    script.src = `${WEMO_SETUP_URL}/setup.xml?callback=${callbackName}&jsonp=${callbackName}`;
    document.head.appendChild(script);
  });
}

/**
 * Tests a SOAP POST request to the basicevent service.
 * This tests if we can send the Content-Type and SOAPAction headers.
 *
 * @returns {Promise<TestResult>}
 */
export async function testSoapRequest() {
  const startTime = performance.now();
  const testName = TEST_NAMES.SOAP_POST;

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetBinaryState xmlns:u="urn:Belkin:service:basicevent:1"></u:GetBinaryState>
  </s:Body>
</s:Envelope>`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT);

    const response = await fetch(`${WEMO_SETUP_URL}/upnp/control/basicevent1`, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: '"urn:Belkin:service:basicevent:1#GetBinaryState"',
      },
      body: soapEnvelope,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = Math.round(performance.now() - startTime);

    if (response.ok) {
      const text = await response.text();
      return {
        name: testName,
        success: true,
        message: "SOAP request succeeded",
        details: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
        duration,
      };
    }

    return {
      name: testName,
      success: false,
      message: `HTTP ${response.status}: ${response.statusText}`,
      duration,
    };
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);

    // Check if it's a CORS preflight failure
    if (error.message.includes("CORS") || error.message.includes("cross-origin")) {
      return {
        name: testName,
        success: false,
        message: "CORS preflight blocked",
        details: "Browser blocked the preflight OPTIONS request - custom headers not allowed",
        duration,
      };
    }

    return {
      name: testName,
      success: false,
      message: `Error: ${error.message}`,
      duration,
    };
  }
}

/**
 * Tests the WiFiSetup service which is used for device configuration.
 * Attempts to call GetApList to retrieve available WiFi networks.
 *
 * @returns {Promise<TestResult>}
 */
export async function testWiFiSetupService() {
  const startTime = performance.now();
  const testName = TEST_NAMES.WIFI_SETUP;

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetApList xmlns:u="urn:Belkin:service:WiFiSetup:1"></u:GetApList>
  </s:Body>
</s:Envelope>`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT);

    const response = await fetch(`${WEMO_SETUP_URL}/upnp/control/WiFiSetup1`, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: '"urn:Belkin:service:WiFiSetup:1#GetApList"',
      },
      body: soapEnvelope,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = Math.round(performance.now() - startTime);

    if (response.ok) {
      const text = await response.text();
      return {
        name: testName,
        success: true,
        message: "WiFiSetup service accessible",
        details: text.substring(0, 300) + (text.length > 300 ? "..." : ""),
        duration,
      };
    }

    return {
      name: testName,
      success: false,
      message: `HTTP ${response.status}: ${response.statusText}`,
      duration,
    };
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);

    if (error.message.includes("CORS") || error.message.includes("cross-origin")) {
      return {
        name: testName,
        success: false,
        message: "CORS preflight blocked",
        details: "Browser blocked the preflight OPTIONS request",
        duration,
      };
    }

    return {
      name: testName,
      success: false,
      message: `Error: ${error.message}`,
      duration,
    };
  }
}

/**
 * Tests SOAP POST with text/plain Content-Type (bypasses preflight).
 * This is an experiment to see if Wemo accepts SOAP without proper headers.
 *
 * @returns {Promise<TestResult>}
 */
export async function testSoapWithTextPlain() {
  const startTime = performance.now();
  const testName = TEST_NAMES.SOAP_TEXT_PLAIN;

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetBinaryState xmlns:u="urn:Belkin:service:basicevent:1"></u:GetBinaryState>
  </s:Body>
</s:Envelope>`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT);

    // Try with text/plain - this is a "simple request" that won't trigger preflight
    const response = await fetch(`${WEMO_SETUP_URL}/upnp/control/basicevent1`, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain",
        // Note: We can't set SOAPAction without triggering preflight
      },
      body: soapEnvelope,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = Math.round(performance.now() - startTime);

    if (response.ok) {
      const text = await response.text();
      return {
        name: testName,
        success: true,
        message: "SOAP with text/plain WORKED! Device accepted it!",
        details: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
        duration,
      };
    }

    // Even a non-OK response means we got through without preflight block
    const text = await response.text();
    return {
      name: testName,
      success: false,
      message: `HTTP ${response.status} - but request reached device!`,
      details: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
      duration,
    };
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    return {
      name: testName,
      success: false,
      message: `Error: ${error.message}`,
      duration,
    };
  }
}

/**
 * Tests SOAP with application/x-www-form-urlencoded Content-Type.
 * This is another "simple" Content-Type that doesn't trigger preflight.
 * The device might parse the XML body regardless of Content-Type.
 *
 * @returns {Promise<TestResult>}
 */
export async function testSoapFormUrlencoded() {
  const startTime = performance.now();
  const testName = TEST_NAMES.SOAP_FORM_URLENCODED;

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetBinaryState xmlns:u="urn:Belkin:service:basicevent:1"></u:GetBinaryState>
  </s:Body>
</s:Envelope>`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT);

    // Try with application/x-www-form-urlencoded - another "simple request" Content-Type
    const response = await fetch(`${WEMO_SETUP_URL}/upnp/control/basicevent1`, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: soapEnvelope,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = Math.round(performance.now() - startTime);

    if (response.ok) {
      const text = await response.text();
      return {
        name: testName,
        success: true,
        message: "SOAP with form-urlencoded WORKED!",
        details: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
        duration,
      };
    }

    const text = await response.text();
    return {
      name: testName,
      success: false,
      message: `HTTP ${response.status} - but request reached device!`,
      details: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
      duration,
    };
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    return {
      name: testName,
      success: false,
      message: `Error: ${error.message}`,
      duration,
    };
  }
}

/**
 * Tests navigator.sendBeacon() for fire-and-forget requests.
 * sendBeacon bypasses CORS entirely but we can't read the response.
 * Useful for sending commands (like toggle) where we don't need the response.
 *
 * @returns {Promise<TestResult>}
 */
export async function testSendBeacon() {
  const startTime = performance.now();
  const testName = TEST_NAMES.SEND_BEACON;

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetBinaryState xmlns:u="urn:Belkin:service:basicevent:1"></u:GetBinaryState>
  </s:Body>
</s:Envelope>`;

  try {
    // sendBeacon returns true if the browser queued the request
    // We can't know if the device actually received/processed it
    const blob = new Blob([soapEnvelope], { type: "text/plain" });
    const queued = navigator.sendBeacon(`${WEMO_SETUP_URL}/upnp/control/basicevent1`, blob);

    const duration = Math.round(performance.now() - startTime);

    if (queued) {
      return {
        name: testName,
        success: true,
        message: "Request queued by browser",
        details:
          "sendBeacon queued the request. Cannot verify if device received it. Useful for fire-and-forget commands.",
        duration,
      };
    }

    return {
      name: testName,
      success: false,
      message: "Browser refused to queue request",
      duration,
    };
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    return {
      name: testName,
      success: false,
      message: `Error: ${error.message}`,
      duration,
    };
  }
}

/**
 * Tests if the Wemo device has any WebSocket support.
 * WebSockets have different CORS rules - they only check Origin on handshake.
 * If the device has a WebSocket server and doesn't validate Origin, we could communicate.
 *
 * @returns {Promise<TestResult>}
 */
export async function testWebSocketProbe() {
  const startTime = performance.now();
  const testName = TEST_NAMES.WEBSOCKET_PROBE;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({
        name: testName,
        success: false,
        message: "Timeout - no WebSocket server found",
        duration: CONNECTIVITY_TIMEOUT,
      });
    }, CONNECTIVITY_TIMEOUT);

    try {
      // Try common WebSocket ports/paths
      const ws = new WebSocket(`ws://${WEMO_AP_IP}:${WEMO_AP_PORT}/`);

      ws.onopen = () => {
        clearTimeout(timeout);
        const duration = Math.round(performance.now() - startTime);
        ws.close();
        resolve({
          name: testName,
          success: true,
          message: "WebSocket connection opened!",
          details: "Device has WebSocket support! This could be a CORS bypass path.",
          duration,
        });
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        const duration = Math.round(performance.now() - startTime);
        resolve({
          name: testName,
          success: false,
          message: "WebSocket connection failed",
          details: "Device doesn't have WebSocket server on this port",
          duration,
        });
      };

      ws.onclose = (event) => {
        clearTimeout(timeout);
        const duration = Math.round(performance.now() - startTime);
        if (event.wasClean) {
          resolve({
            name: testName,
            success: true,
            message: `WebSocket closed cleanly (code: ${event.code})`,
            details: "Device responded to WebSocket handshake!",
            duration,
          });
        }
      };
    } catch (error) {
      clearTimeout(timeout);
      const duration = Math.round(performance.now() - startTime);
      resolve({
        name: testName,
        success: false,
        message: `Error: ${error.message}`,
        duration,
      });
    }
  });
}

/**
 * Tests a simple GET with no-cors mode (always succeeds if device reachable).
 *
 * @returns {Promise<TestResult>}
 */
export async function testNoCorsGet() {
  const startTime = performance.now();
  const testName = TEST_NAMES.NO_CORS_GET;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT);

    const response = await fetch(`${WEMO_SETUP_URL}/setup.xml`, {
      method: "GET",
      mode: "no-cors",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = Math.round(performance.now() - startTime);

    if (response.type === "opaque") {
      return {
        name: testName,
        success: true,
        message: "Device reachable (opaque response)",
        details: "Request succeeded but response body is hidden due to no-cors mode",
        duration,
      };
    }

    return {
      name: testName,
      success: response.ok,
      message: response.ok ? "Success" : `HTTP ${response.status}`,
      duration,
    };
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    return {
      name: testName,
      success: false,
      message: `Error: ${error.message}`,
      duration,
    };
  }
}

/**
 * Runs all CORS connectivity tests.
 * Yields results as they complete for progressive UI updates.
 *
 * NOTE: Tests are disabled in production. To enable for development/debugging,
 * set ENABLE_CORS_TESTS to true below.
 *
 * @yields {TestResult} Test results as they complete
 */
export async function* runAllTests() {
  // Disabled in production - these tests are for development/debugging only
  const ENABLE_CORS_TESTS = false;

  if (!ENABLE_CORS_TESTS) {
    console.log("[SetupMode] CORS connectivity tests are disabled");
    yield {
      name: "Tests Disabled",
      success: true,
      message: "CORS connectivity tests are disabled in production",
      details: "These tests are for development/debugging purposes only",
      duration: 0,
    };
    return;
  }

  console.log("[SetupMode] Running CORS connectivity tests...");

  // Run tests in sequence for clearer results
  yield await testNoCorsGet();
  yield await testGetSetupXml();
  yield await testScriptTag(); // Experiment: script tags bypass CORS
  yield await testObjectTag(); // Experiment: object tags might allow access
  yield await testJsonpCallback(); // Experiment: JSONP-style callback
  yield await testSoapRequest();
  yield await testSoapWithTextPlain(); // Experiment: bypass preflight with text/plain
  yield await testSoapFormUrlencoded(); // Experiment: another simple Content-Type
  yield await testSendBeacon(); // Experiment: fire-and-forget (no response)
  yield await testWebSocketProbe(); // Experiment: WebSocket has different CORS rules
  yield await testWiFiSetupService();

  console.log("[SetupMode] All tests complete");
}

/**
 * Runs all tests and returns results as an array.
 * Convenience function when progressive updates aren't needed.
 *
 * @returns {Promise<TestResult[]>} All test results
 */
export async function runAllTestsSync() {
  const results = [];
  for await (const result of runAllTests()) {
    results.push(result);
  }
  return results;
}

/**
 * Formats test results as a string for copying to clipboard.
 *
 * @param {TestResult[]} results - Test results to format
 * @returns {string} Formatted results string
 */
export function formatTestResults(results) {
  const timestamp = new Date().toISOString();
  const lines = [
    "Open Wemo - CORS Connectivity Test Results",
    `Timestamp: ${timestamp}`,
    `Target: ${WEMO_SETUP_URL}`,
    `User Agent: ${navigator.userAgent}`,
    "",
    "Results:",
    "─".repeat(50),
  ];

  for (const result of results) {
    const status = result.success ? "PASS" : "FAIL";
    const duration = result.duration ? ` (${result.duration}ms)` : "";
    lines.push(`[${status}] ${result.name}${duration}`);
    lines.push(`       ${result.message}`);
    if (result.details) {
      lines.push(`       Details: ${result.details}`);
    }
    lines.push("");
  }

  lines.push("─".repeat(50));

  const passCount = results.filter((r) => r.success).length;
  lines.push(`Summary: ${passCount}/${results.length} tests passed`);

  return lines.join("\n");
}
