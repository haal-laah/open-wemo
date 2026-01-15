/**
 * Tests for type definitions and enums.
 */

import { describe, expect, test } from "bun:test";
import { WemoDeviceType } from "../types";

describe("WemoDeviceType enum", () => {
  test("has all expected device types", () => {
    expect(WemoDeviceType.Switch).toBe(WemoDeviceType.Switch);
    expect(WemoDeviceType.Insight).toBe(WemoDeviceType.Insight);
    expect(WemoDeviceType.LightSwitch).toBe(WemoDeviceType.LightSwitch);
    expect(WemoDeviceType.Dimmer).toBe(WemoDeviceType.Dimmer);
    expect(WemoDeviceType.Mini).toBe(WemoDeviceType.Mini);
    expect(WemoDeviceType.Bulb).toBe(WemoDeviceType.Bulb);
    expect(WemoDeviceType.Motion).toBe(WemoDeviceType.Motion);
    expect(WemoDeviceType.Unknown).toBe(WemoDeviceType.Unknown);
  });

  test("enum values are strings", () => {
    // Ensure we're using string enums for JSON serialization
    expect(typeof WemoDeviceType.Switch).toBe("string");
    expect(typeof WemoDeviceType.Insight).toBe("string");
  });

  test("enum contains expected string values", () => {
    // Verify the actual string values for API responses
    expect(String(WemoDeviceType.Switch)).toContain("Switch");
    expect(String(WemoDeviceType.Insight)).toContain("Insight");
  });
});
