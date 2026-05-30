import { describe, expect, it } from "vitest";

import { computeBp109Label } from "./bp109";
import { inferBp109Meta } from "./inferBp109";
import testLineBay from "../../templates/templates/test-line-bay.json";

describe("computeBp109Label", () => {
  it("formats 400kV line circuit breaker per BP109 table order", () => {
    const label = computeBp109Label({
      enabled: true,
      voltageClass: "400",
      prefix: "X",
      circuitType: "LINE",
      circuitNumber: 1,
      purposeDigit: 5,
    });
    expect(label).toBe("X105");
  });

  it("formats 275kV with type letter prefix", () => {
    const label = computeBp109Label({
      enabled: true,
      voltageClass: "275",
      circuitType: "LINE",
      circuitNumber: 2,
      purposeDigit: 3,
    });
    expect(label).toBe("L23");
  });

  it("formats 132kV without X prefix", () => {
    const label = computeBp109Label({
      enabled: true,
      voltageClass: "132",
      circuitType: "TX_HV",
      circuitNumber: 3,
      purposeDigit: 0,
    });
    expect(label).toBe("310");
  });
});

describe("inferBp109Meta", () => {
  it("infers line bay labels from iface-connected topology", () => {
    const nodes = testLineBay.nodes as import("reactflow").Node[];
    const edges = testLineBay.edges as import("reactflow").Edge[];

    const meta = inferBp109Meta(nodes, edges, {}, {}, 400);

    expect(meta.CB1).toMatchObject({ circuitType: "LINE", circuitNumber: 1, purposeDigit: 5 });
    expect(meta.DS1).toMatchObject({ circuitType: "LINE", circuitNumber: 1, purposeDigit: 4 });
    expect(meta.DS2).toMatchObject({ circuitType: "LINE", circuitNumber: 1, purposeDigit: 3 });
    expect(meta.ES1).toMatchObject({ circuitType: "LINE", circuitNumber: 1, purposeDigit: 1 });
    expect(meta.ES2).toMatchObject({ circuitType: "LINE", circuitNumber: 1, purposeDigit: 1 });

    expect(computeBp109Label(meta.CB1!)).toBe("X105");
    expect(computeBp109Label(meta.DS1!)).toBe("X104");
    expect(computeBp109Label(meta.DS2!)).toBe("X103");
  });

  it("respects user overrides on top of inferred values", () => {
    const nodes = testLineBay.nodes as import("reactflow").Node[];
    const edges = testLineBay.edges as import("reactflow").Edge[];

    const meta = inferBp109Meta(nodes, edges, {}, { CB1: { circuitNumber: 7 } }, 400);
    expect(meta.CB1?.circuitNumber).toBe(7);
    expect(computeBp109Label(meta.CB1!)).toBe("X705");
  });
});
