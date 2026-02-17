/**
 * Unit tests for busbar draft logic.
 * Run: npm test (or npx vitest run)
 *
 * Verifies:
 * - One point per call to addDraftPoint (no double junctions).
 * - Three clicks yield exactly 3 points and 2 edges (0-1, 1-2); no edge last→first.
 */

import { describe, it, expect } from "vitest";
import {
  addDraftPoint,
  draftToEdgePairs,
  samePoint,
  orthogonalPoint,
  type Pt,
} from "./busbarDraft";

const A: Pt = { x: 0, y: 0 };
const B: Pt = { x: 100, y: 0 };
const C: Pt = { x: 100, y: 100 };

describe("busbarDraft", () => {
  describe("addDraftPoint", () => {
    it("first click adds one point", () => {
      const next = addDraftPoint([], A);
      expect(next).toHaveLength(1);
      expect(next[0]).toEqual(A);
    });

    it("second click adds one more point (orthogonal)", () => {
      const afterFirst = addDraftPoint([], A);
      const afterSecond = addDraftPoint(afterFirst, C);
      expect(afterSecond).toHaveLength(2);
      expect(afterSecond[0]).toEqual(A);
      expect(afterSecond[1]).toEqual({ x: C.x, y: A.y });
    });

    it("three clicks yield exactly three points", () => {
      let draft: Pt[] = [];
      draft = addDraftPoint(draft, A);
      draft = addDraftPoint(draft, B);
      draft = addDraftPoint(draft, C);
      expect(draft).toHaveLength(3);
    });

    it("does not add duplicate of last point", () => {
      const draft = addDraftPoint([], A);
      const same = addDraftPoint(draft, A);
      expect(same).toBe(draft);
      expect(same).toHaveLength(1);
    });

    it("does not add point that equals first when draft has 2+ points (no loop)", () => {
      let draft: Pt[] = [];
      draft = addDraftPoint(draft, A);
      draft = addDraftPoint(draft, B);
      const backToStart = addDraftPoint(draft, A);
      expect(backToStart).toBe(draft);
      expect(backToStart).toHaveLength(2);
      expect(backToStart[0]).toEqual(A);
      expect(backToStart[1]).not.toEqual(A);
    });

    it("three clicks yield exactly three distinct points", () => {
      let draft: Pt[] = [];
      draft = addDraftPoint(draft, A);
      draft = addDraftPoint(draft, B);
      draft = addDraftPoint(draft, C);
      expect(draft).toHaveLength(3);
      expect(draft[0]).toEqual(A);
      expect(draft[1]).not.toEqual(draft[0]);
      expect(draft[2]).not.toEqual(draft[1]);
      expect(draft[2]).not.toEqual(draft[0]);
    });
  });

  describe("draftToEdgePairs", () => {
    it("N points yield N-1 edges, sequential only (no last-to-first)", () => {
      const pairs3 = draftToEdgePairs(3);
      expect(pairs3).toHaveLength(2);
      expect(pairs3[0]).toEqual([0, 1]);
      expect(pairs3[1]).toEqual([1, 2]);
      const hasLastToFirst = pairs3.some(([a, b]) => a === 2 && b === 0);
      expect(hasLastToFirst).toBe(false);
    });

    it("2 points yield 1 edge", () => {
      expect(draftToEdgePairs(2)).toEqual([[0, 1]]);
    });

    it("1 point yields 0 edges", () => {
      expect(draftToEdgePairs(1)).toEqual([]);
    });
  });

  describe("samePoint", () => {
    it("returns true for equal points", () => {
      expect(samePoint(A, { x: 0, y: 0 })).toBe(true);
    });
    it("returns false for different points", () => {
      expect(samePoint(A, B)).toBe(false);
    });
  });

  describe("orthogonalPoint", () => {
    it("returns axis-aligned step", () => {
      expect(orthogonalPoint(A, C)).toEqual({ x: C.x, y: A.y });
    });
  });
});
