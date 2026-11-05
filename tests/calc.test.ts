import { describe, expect, it } from 'vitest';
import { daySummary, sunPosition, overhangDepth } from '../src/lib/sun';
import { fitScale, PAPER_SIZES, paperToReal, polygonArea, realToPaper, heron, slopeFromRatio, rampRun } from '../src/lib/calc/geometry';
import { designStair } from '../src/lib/calc/stairs';
import { singlyReinforcedCapacity, requiredSteel, beta1, mixByRatio, beamActions, barsArea, factoredLoad } from '../src/lib/calc/concrete';
import { masonry, blocksPerM2, tiles, concreteTotals } from '../src/lib/calc/quantities';
import { convert } from '../src/lib/calc/units';
import { uValue } from '../src/lib/calc/thermal';

const LAT = 34.889, LON = 35.887;

describe('sun position (NOAA)', () => {
  it('noon altitude at solstices/equinox ≈ 90 − φ ± δ', () => {
    const jun = daySummary('jun', 2026, 6, 21, LAT, LON, 3);
    const dec = daySummary('dec', 2026, 12, 21, LAT, LON, 3);
    const mar = daySummary('mar', 2026, 3, 20, LAT, LON, 3);
    expect(jun.noonAltitude).toBeCloseTo(90 - LAT + 23.44, 0);
    expect(dec.noonAltitude).toBeCloseTo(90 - LAT - 23.44, 0);
    expect(mar.noonAltitude).toBeCloseTo(90 - LAT, 0);
  });
  it('solar noon in Tartous (UTC+3) is around 12:35–12:55 local', () => {
    const s = daySummary('x', 2026, 6, 21, LAT, LON, 3);
    expect(s.solarNoon).toBeGreaterThan(12.5);
    expect(s.solarNoon).toBeLessThan(13);
  });
  it('day length longer in June than December, sunrise azimuth north of east in summer', () => {
    const jun = daySummary('jun', 2026, 6, 21, LAT, LON, 3);
    const dec = daySummary('dec', 2026, 12, 21, LAT, LON, 3);
    expect(jun.dayLength!).toBeGreaterThan(14);
    expect(dec.dayLength!).toBeLessThan(10);
    expect(jun.sunriseAzimuth!).toBeLessThan(90);
    expect(dec.sunriseAzimuth!).toBeGreaterThan(90);
  });
  it('azimuth is ~180 at solar noon in northern latitudes', () => {
    const p = sunPosition(new Date(Date.UTC(2026, 11, 21, 9, 35)), LAT, LON);
    expect(Math.abs(p.azimuth - 180)).toBeLessThan(1);
  });
  it('overhang depth', () => {
    expect(overhangDepth(1.5, 45)).toBeCloseTo(1.5, 6);
  });
});

describe('geometry & scale', () => {
  it('scale conversions', () => {
    expect(realToPaper(5, 100)).toBe(50);
    expect(paperToReal(50, 100)).toBe(5);
  });
  it('fit scale for a 60×40 m site on A1 with 20 mm margin → 1:75', () => {
    expect(fitScale(60, 40, PAPER_SIZES[1], 20)).toBe(75);
    expect(fitScale(90, 40, PAPER_SIZES[1], 20)).toBe(125);
  });
  it('shoelace area of L-shape', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 10 }];
    expect(polygonArea(pts)).toBe(75);
  });
  it('heron 3-4-5 = 6', () => expect(heron(3, 4, 5)).toBeCloseTo(6));
  it('ramp 1:12', () => {
    expect(slopeFromRatio(12).percent).toBeCloseTo(8.333, 2);
    expect(rampRun(0.6, 12)).toBeCloseTo(7.2);
  });
});

describe('stairs', () => {
  it('300 cm with 17.5 max riser → 18 risers of 16.67 cm, tread 29.5', () => {
    const r = designStair({ floorHeightCm: 300, maxRiserCm: 17.5, blondelTargetCm: 63, maxRisersPerFlight: 16, widthCm: 120 });
    expect(r.risers).toBe(18);
    expect(r.riserCm).toBeCloseTo(16.667, 2);
    expect(r.treadCm).toBe(29.5);
    expect(r.flights).toBe(2);
    expect(r.risersPerFlight).toEqual([9, 9]);
    expect(r.treads).toBe(16);
    expect(r.warnings).toEqual([]);
  });
});

describe('reinforced concrete (ACI 318-19)', () => {
  it('beta1', () => {
    expect(beta1(25)).toBe(0.85);
    expect(beta1(35)).toBeCloseTo(0.8);
    expect(beta1(70)).toBe(0.65);
  });
  it('textbook-style section: b=300 d=500 As=3Ø20 fc=25 fy=420', () => {
    const As = barsArea(3, 20); // 942.5
    const r = singlyReinforcedCapacity({ b: 300, d: 500, As, fc: 25, fy: 420 });
    // a = 942.5*420/(0.85*25*300) = 62.09 mm
    expect(r.a).toBeCloseTo(62.09, 1);
    // Mn = 942.5*420*(500-31.05)/1e6 = 185.6 kN·m
    expect(r.Mn).toBeCloseTo(185.6, 0);
    expect(r.phi).toBe(0.9);
    expect(r.classification).toBe('tension-controlled');
  });
  it('required steel round-trips with capacity', () => {
    const req = requiredSteel(150, 300, 500, 25, 420);
    const cap = singlyReinforcedCapacity({ b: 300, d: 500, As: req.As, fc: 25, fy: 420 });
    expect(cap.phiMn).toBeCloseTo(150, 0);
  });
  it('over-sized moment is flagged', () => {
    expect(requiredSteel(2000, 250, 400, 25, 420).ok).toBe(false);
  });
  it('beam actions & load combos', () => {
    expect(beamActions('simply-udl', 6, 20).M).toBe(90);
    expect(factoredLoad(10, 5).governing).toBe(20);
  });
  it('mix 1:2:4 for 1 m³', () => {
    const m = mixByRatio(1, 1, 2, 4);
    expect(m.cementKg).toBeCloseTo((1.54 / 7) * 1440, 3);
    expect(m.sandM3).toBeCloseTo(0.44, 2);
  });
});

describe('quantities', () => {
  it('blocks per m² for 40×20 block with 1 cm joint', () => {
    expect(blocksPerM2(0.4, 0.2, 0.01)).toBeCloseTo(11.61, 2);
  });
  it('masonry deducts openings', () => {
    const r = masonry(10, 3, [{ w: 1, h: 2, count: 2 }], 0.4, 0.2, 0.01, 0);
    expect(r.netArea).toBe(26);
    expect(r.blocks).toBe(Math.ceil(26 * 11.6144));
  });
  it('tiles with waste', () => expect(tiles(10, 0.6, 0.6, 10).count).toBe(31));
  it('concrete totals', () => {
    const t = concreteTotals([{ id: '1', kind: 'column', label: '', a: 0.3, b: 0.3, c: 3, count: 4 }], 5);
    expect(t.net).toBeCloseTo(1.08);
    expect(t.withWaste).toBeCloseTo(1.134);
  });
});

describe('units & thermal', () => {
  it('converts', () => {
    expect(convert(1, 'stress', 'MPa', 'kgcm2')).toBeCloseTo(10.197, 3);
    expect(convert(1, 'force', 'tf', 'kN')).toBeCloseTo(9.80665);
    expect(convert(100, 'temperature', 'C', 'F')).toBeCloseTo(212);
    expect(convert(1, 'area', 'dunam', 'm2')).toBe(1000);
  });
  it('U-value of 20 cm block + 5 cm EPS + plasters', () => {
    const r = uValue([
      { id: 'a', materialId: 'cement-plaster', thicknessMm: 20 },
      { id: 'b', materialId: 'block-hollow', thicknessMm: 200 },
      { id: 'c', materialId: 'eps', thicknessMm: 50 },
      { id: 'd', materialId: 'gypsum-plaster', thicknessMm: 15 },
    ]);
    const R = 0.13 + 0.04 + 0.02 / 1.0 + 0.2 / 0.9 + 0.05 / 0.037 + 0.015 / 0.43;
    expect(r.R).toBeCloseTo(R, 6);
    expect(r.U).toBeCloseTo(1 / R, 6);
  });
});
