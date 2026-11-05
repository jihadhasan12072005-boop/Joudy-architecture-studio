// Solar position using the NOAA solar calculator equations
// (Meeus, "Astronomical Algorithms"; NOAA Global Monitoring Laboratory spreadsheet).
// Accuracy is roughly ±0.5° for years 1800–2100 — more than enough for
// architectural sun studies. Atmospheric refraction is ignored (it lifts the
// apparent sun by ~0.5° near the horizon only).

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface SunPosition {
  altitude: number; // degrees above horizon
  azimuth: number; // degrees clockwise from true north
  declination: number;
  eqOfTime: number; // minutes
}

function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

export function sunPosition(date: Date, latitude: number, longitude: number): SunPosition {
  const jc = (julianDay(date) - 2451545) / 36525;
  const L0 = (((280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const C =
    Math.sin(rad(M)) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * jc) +
    Math.sin(rad(3 * M)) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * jc;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const meanObliq = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(obliq)) * Math.sin(rad(appLong))));
  const y = Math.tan(rad(obliq / 2)) ** 2;
  const eot =
    4 *
    deg(
      y * Math.sin(2 * rad(L0)) -
        2 * e * Math.sin(rad(M)) +
        4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) -
        0.5 * y * y * Math.sin(4 * rad(L0)) -
        1.25 * e * e * Math.sin(2 * rad(M)),
    );

  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  let tst = (utcMinutes + eot + 4 * longitude) % 1440;
  if (tst < 0) tst += 1440;
  let ha = tst / 4 - 180;
  if (ha < -180) ha += 360;

  const cosZen =
    Math.sin(rad(latitude)) * Math.sin(rad(decl)) + Math.cos(rad(latitude)) * Math.cos(rad(decl)) * Math.cos(rad(ha));
  const zenith = deg(Math.acos(Math.min(1, Math.max(-1, cosZen))));
  const denom = Math.cos(rad(latitude)) * Math.sin(rad(zenith));
  let azimuth: number;
  if (Math.abs(denom) < 1e-9) {
    azimuth = latitude > decl ? 180 : 0;
  } else {
    const a = deg(
      Math.acos(Math.min(1, Math.max(-1, (Math.sin(rad(latitude)) * Math.cos(rad(zenith)) - Math.sin(rad(decl))) / denom))),
    );
    azimuth = ha > 0 ? (a + 180) % 360 : (540 - a) % 360;
  }
  return { altitude: 90 - zenith, azimuth, declination: decl, eqOfTime: eot };
}

/** Local clock time -> Date, for a fixed UTC offset (Syria: UTC+3 year-round since late 2022). */
export function localDate(year: number, month: number, day: number, hour: number, minute: number, utcOffset: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - utcOffset * 3600000);
}

export interface SunPathPoint {
  hour: number; // local clock hour (fractional)
  altitude: number;
  azimuth: number;
}

export function sunPath(
  year: number,
  month: number,
  day: number,
  lat: number,
  lon: number,
  utcOffset: number,
  stepMinutes = 15,
): SunPathPoint[] {
  const pts: SunPathPoint[] = [];
  for (let m = 0; m <= 24 * 60; m += stepMinutes) {
    const d = localDate(year, month, day, 0, m, utcOffset);
    const p = sunPosition(d, lat, lon);
    pts.push({ hour: m / 60, altitude: p.altitude, azimuth: p.azimuth });
  }
  return pts;
}

export interface DaySummary {
  label: string;
  month: number;
  day: number;
  noonAltitude: number;
  solarNoon: number; // local clock hour
  sunrise: number | null;
  sunset: number | null;
  sunriseAzimuth: number | null;
  sunsetAzimuth: number | null;
  dayLength: number | null; // hours
}

/** Summary for one date: solar noon, max altitude, sunrise/sunset times & azimuths. */
export function daySummary(
  label: string,
  year: number,
  month: number,
  day: number,
  lat: number,
  lon: number,
  utcOffset: number,
): DaySummary {
  const pts = sunPath(year, month, day, lat, lon, utcOffset, 1);
  let noon = pts[0];
  for (const p of pts) if (p.altitude > noon.altitude) noon = p;
  let sunrise: SunPathPoint | null = null;
  let sunset: SunPathPoint | null = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.altitude < 0 && b.altitude >= 0 && !sunrise) sunrise = interp(a, b);
    if (a.altitude >= 0 && b.altitude < 0) sunset = interp(a, b);
  }
  return {
    label,
    month,
    day,
    noonAltitude: noon.altitude,
    solarNoon: noon.hour,
    sunrise: sunrise?.hour ?? null,
    sunset: sunset?.hour ?? null,
    sunriseAzimuth: sunrise?.azimuth ?? null,
    sunsetAzimuth: sunset?.azimuth ?? null,
    dayLength: sunrise && sunset ? sunset.hour - sunrise.hour : null,
  };
}

function interp(a: SunPathPoint, b: SunPathPoint): SunPathPoint {
  const t = a.altitude / (a.altitude - b.altitude);
  return {
    hour: a.hour + t * (b.hour - a.hour),
    altitude: 0,
    azimuth: a.azimuth + t * (b.azimuth - a.azimuth),
  };
}

/**
 * Horizontal overhang projection that fully shades a window of height `h`
 * (from sill to underside of overhang) at the given profile angle.
 * For a wall facing due south (northern hemisphere) at solar noon, the
 * profile angle equals the solar altitude.
 */
export function overhangDepth(windowHeight: number, profileAngleDeg: number): number {
  if (profileAngleDeg <= 0) return Infinity;
  return windowHeight / Math.tan(rad(profileAngleDeg));
}

export function formatHour(h: number | null): string {
  if (h === null || !isFinite(h)) return '—';
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) {
    hh += 1;
    mm = 0;
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
