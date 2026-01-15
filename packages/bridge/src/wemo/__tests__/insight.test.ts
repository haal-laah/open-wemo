/**
 * Tests for Insight device functionality.
 */

import { describe, expect, test } from "bun:test";
import { convertToPowerData, formatDuration, parseInsightParams } from "../insight";

describe("parseInsightParams", () => {
  test("parses full params string", () => {
    // state|lastChange|onFor|onToday|onTotal|timePeriod|avgPower|instantPower|todayEnergy|totalEnergy|threshold
    const paramsString = "1|1704067200|3600|7200|86400|1209600|5000|8500|120000|2400000|8000";

    const result = parseInsightParams(paramsString);

    expect(result.state).toBe(1);
    expect(result.lastChange).toBe(1704067200);
    expect(result.onFor).toBe(3600);
    expect(result.onToday).toBe(7200);
    expect(result.onTotal).toBe(86400);
    expect(result.timePeriod).toBe(1209600);
    expect(result.averagePower).toBe(5000);
    expect(result.instantPower).toBe(8500);
    expect(result.todayEnergy).toBe(120000);
    expect(result.totalEnergy).toBe(2400000);
    expect(result.standbyThreshold).toBe(8000);
  });

  test("parses state 0 (off)", () => {
    const paramsString = "0|1704067200|0|0|0|0|0|0|0|0|8000";
    const result = parseInsightParams(paramsString);

    expect(result.state).toBe(0);
  });

  test("parses state 8 (standby)", () => {
    const paramsString = "8|1704067200|100|200|300|0|0|500|1000|2000|8000";
    const result = parseInsightParams(paramsString);

    expect(result.state).toBe(8);
  });

  test("handles missing values with defaults", () => {
    const paramsString = "1|1704067200";
    const result = parseInsightParams(paramsString);

    expect(result.state).toBe(1);
    expect(result.lastChange).toBe(1704067200);
    expect(result.onFor).toBe(0);
    expect(result.instantPower).toBe(0);
    expect(result.standbyThreshold).toBe(8000); // Default
  });

  test("handles empty string", () => {
    const result = parseInsightParams("");

    expect(result.state).toBe(0);
    expect(result.standbyThreshold).toBe(8000);
  });

  test("normalizes invalid state to 1", () => {
    const paramsString = "5|1704067200|0|0|0|0|0|0|0|0|8000";
    const result = parseInsightParams(paramsString);

    expect(result.state).toBe(1); // Normalized from 5
  });
});

describe("formatDuration", () => {
  test("formats seconds only", () => {
    expect(formatDuration(30)).toBe("30s");
    expect(formatDuration(59)).toBe("59s");
  });

  test("formats minutes and seconds", () => {
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(125)).toBe("2m 5s");
  });

  test("formats minutes only when no remaining seconds", () => {
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(300)).toBe("5m");
  });

  test("formats hours and minutes", () => {
    expect(formatDuration(3660)).toBe("1h 1m");
    expect(formatDuration(7200)).toBe("2h");
    expect(formatDuration(5400)).toBe("1h 30m");
  });

  test("formats hours only when no remaining minutes", () => {
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(7200)).toBe("2h");
  });

  test("handles zero", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});

describe("convertToPowerData", () => {
  test("converts milliwatts to watts", () => {
    const params = parseInsightParams("1|0|0|0|0|0|0|8500|0|0|8000");
    const power = convertToPowerData(params);

    expect(power.currentWatts).toBe(8.5);
  });

  test("converts milliwatt-minutes to kWh", () => {
    // 60000 milliwatt-minutes = 1 kWh
    const params = parseInsightParams("1|0|0|0|0|0|0|0|60000|120000|8000");
    const power = convertToPowerData(params);

    expect(power.todayKwh).toBe(1);
    expect(power.totalKwh).toBe(2);
  });

  test("sets isOn correctly", () => {
    const onParams = parseInsightParams("1|0|0|0|0|0|0|0|0|0|8000");
    expect(convertToPowerData(onParams).isOn).toBe(true);

    const offParams = parseInsightParams("0|0|0|0|0|0|0|0|0|0|8000");
    expect(convertToPowerData(offParams).isOn).toBe(false);

    const standbyParams = parseInsightParams("8|0|0|0|0|0|0|0|0|0|8000");
    expect(convertToPowerData(standbyParams).isOn).toBe(false);
  });

  test("sets isStandby correctly", () => {
    const standbyParams = parseInsightParams("8|0|0|0|0|0|0|0|0|0|8000");
    expect(convertToPowerData(standbyParams).isStandby).toBe(true);

    const onParams = parseInsightParams("1|0|0|0|0|0|0|0|0|0|8000");
    expect(convertToPowerData(onParams).isStandby).toBe(false);
  });

  test("formats duration strings", () => {
    const params = parseInsightParams("1|0|3661|7322|0|0|0|0|0|0|8000");
    const power = convertToPowerData(params);

    expect(power.onForFormatted).toBe("1h 1m");
    expect(power.onTodayFormatted).toBe("2h 2m");
  });
});
