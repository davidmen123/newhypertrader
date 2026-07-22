import { describe, expect, it } from "vitest";
import {
  formatEconomicValue,
  getEconomicCalendarWindow,
  normalizeTradingViewEvents,
} from "./routers/calendar";

describe("economic calendar date windows", () => {
  const now = new Date("2026-07-22T03:00:00.000Z");

  it("uses the full Monday-to-Sunday week in UTC+8", () => {
    const window = getEconomicCalendarWindow("week", now);

    expect(window.start.toISOString()).toBe("2026-07-19T16:00:00.000Z");
    expect(window.endExclusive.toISOString()).toBe("2026-07-26T16:00:00.000Z");
  });

  it("uses the complete calendar month in UTC+8", () => {
    const window = getEconomicCalendarWindow("month", now);

    expect(window.start.toISOString()).toBe("2026-06-30T16:00:00.000Z");
    expect(window.endExclusive.toISOString()).toBe("2026-07-31T16:00:00.000Z");
  });
});

describe("economic calendar values", () => {
  it("adds scale and unit without duplicating existing suffixes", () => {
    expect(formatEconomicValue(2.7, "%", null)).toBe("2.7%");
    expect(formatEconomicValue("2.7%", "%", null)).toBe("2.7%");
    expect(formatEconomicValue(-1.25, null, "M")).toBe("-1.25M");
    expect(formatEconomicValue(null, "%", null)).toBeNull();
  });

  it("keeps actual, forecast and previous values and maps importance", () => {
    const window = getEconomicCalendarWindow(
      "week",
      new Date("2026-07-22T03:00:00.000Z")
    );
    const events = normalizeTradingViewEvents(
      [
        {
          id: "us-cpi",
          title: "CPI YoY",
          country: "US",
          date: "2026-07-22T12:30:00.000Z",
          importance: 1,
          actual: 2.8,
          forecast: 2.7,
          previous: 2.6,
          unit: "%",
        },
        {
          id: "outside-range",
          title: "Outside range",
          country: "US",
          date: "2026-07-27T12:30:00.000Z",
          importance: 0,
        },
      ],
      window
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "us-cpi",
      impact: "High",
      importance: 3,
      actual: "2.8%",
      forecast: "2.7%",
      previous: "2.6%",
      valueExpected: true,
    });
  });

  it("keeps non-numeric events from waiting for an actual value", () => {
    const window = getEconomicCalendarWindow(
      "week",
      new Date("2026-07-22T03:00:00.000Z")
    );
    const [event] = normalizeTradingViewEvents(
      [
        {
          id: "fed-speech",
          title: "Fed Chair Speaks",
          country: "US",
          date: "2026-07-22T10:00:00.000Z",
          importance: 0,
        },
      ],
      window
    );

    expect(event.valueExpected).toBe(false);
    expect(event.importance).toBe(2);
  });
});
