// Architectural line illustrations generated as SVG (crisp at any size,
// zero network requests — important for slow connections).

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect x="1" y="1" width="46" height="46" rx="11" fill="#211F1C" />
      <path d="M12 38V21a12 12 0 0 1 24 0v17" fill="none" stroke="#B5844F" strokeWidth="1.6" />
      <path d="M17 38V22a7 7 0 0 1 14 0v16" fill="none" stroke="#F6F1E9" strokeWidth="1.1" opacity=".55" />
      <path d="M27.5 15.5v13.2a4.2 4.2 0 0 1-8.4 0" fill="none" stroke="#F6F1E9" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M9 38h30" stroke="#B5844F" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

type V3 = [number, number, number];

function isoFactory(cx: number, cy: number, s: number) {
  const c = Math.cos(Math.PI / 6);
  return ([x, y, z]: V3): string => `${(cx + (x - y) * c * s).toFixed(1)},${(cy + (x + y) * 0.5 * s - z * s).toFixed(1)}`;
}

interface Box { x: number; y: number; z: number; w: number; d: number; h: number; tone?: number }

function boxFaces(b: Box, iso: (p: V3) => string) {
  const { x, y, z, w, d, h } = b;
  const top: V3[] = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
  const left: V3[] = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]];
  const right: V3[] = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]];
  const p = (pts: V3[]) => pts.map(iso).join(' ');
  return { top: p(top), left: p(left), right: p(right) };
}

/** Axonometric composition with sun arc — used on welcome and dashboard. */
export function AxonHero({ variant = 'dark', className }: { variant?: 'dark' | 'light'; className?: string }) {
  const W = 800, H = 640;
  const iso = isoFactory(W * 0.46, H * 0.36, 26);
  const line = variant === 'dark' ? '#EDE5D8' : '#2E2B27';
  const accent = '#B5844F';
  const faceA = variant === 'dark' ? 'rgba(237,229,216,0.07)' : 'rgba(46,43,39,0.05)';
  const faceB = variant === 'dark' ? 'rgba(237,229,216,0.13)' : 'rgba(46,43,39,0.10)';
  const faceT = variant === 'dark' ? 'rgba(181,132,79,0.16)' : 'rgba(181,132,79,0.14)';

  const boxes: Box[] = [
    { x: 0, y: 0, z: 0, w: 10, d: 7, h: 1.2 }, // podium
    { x: 1, y: 1, z: 1.2, w: 4.5, d: 4.5, h: 6.5 }, // tower
    { x: 5.5, y: 2.2, z: 1.2, w: 3.6, d: 3.6, h: 3.2 }, // pavilion
    { x: 4.2, y: 0.4, z: 4.4, w: 5.4, d: 2.2, h: 0.35 }, // cantilever slab
  ];

  const grid: string[] = [];
  for (let i = -2; i <= 14; i++) {
    grid.push(`M${iso([i, -3, 0])} L${iso([i, 11, 0])}`);
    grid.push(`M${iso([-2, i - 3 + 2, 0])} L${iso([14, i - 3 + 2, 0])}`);
  }

  // Tower façade mullions
  const mullions: string[] = [];
  for (let k = 1; k < 6; k++) {
    const yy = 1 + (4.5 * k) / 6;
    mullions.push(`M${iso([5.5, yy, 1.2])} L${iso([5.5, yy, 7.7])}`);
  }
  for (let k = 1; k < 7; k++) {
    const zz = 1.2 + k * 0.93;
    mullions.push(`M${iso([5.5, 1, zz])} L${iso([5.5, 5.5, zz])}`);
    mullions.push(`M${iso([1, 5.5, zz])} L${iso([5.5, 5.5, zz])}`);
  }
  // columns under cantilever
  const cols = [[9.4, 0.6], [9.4, 2.4]].map(([x, y]) => `M${iso([x, y, 1.2])} L${iso([x, y, 4.4])}`);

  // sun arc
  const arc: string[] = [];
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const a = Math.PI * t;
    const p = iso([5 + 9 * Math.cos(a), 3.5 - 9 * Math.cos(a) * 0.15, 4 + 10 * Math.sin(a)]);
    arc.push(p);
  }
  const sunPos = iso([5 + 9 * Math.cos(Math.PI * 0.32), 3.5 - 9 * Math.cos(Math.PI * 0.32) * 0.15, 4 + 10 * Math.sin(Math.PI * 0.32)]).split(',').map(Number);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="glow" cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor={accent} stopOpacity={variant === 'dark' ? 0.16 : 0.08} />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#glow)" />
      <path d={grid.join(' ')} stroke={line} strokeOpacity={variant === 'dark' ? 0.07 : 0.08} strokeWidth="1" fill="none" />
      <polyline points={arc.join(' ')} fill="none" stroke={accent} strokeWidth="1.2" strokeDasharray="3 6" />
      <circle cx={sunPos[0]} cy={sunPos[1]} r="11" fill="none" stroke={accent} strokeWidth="1.4" />
      <circle cx={sunPos[0]} cy={sunPos[1]} r="4" fill={accent} />
      {boxes.map((b, i) => {
        const f = boxFaces(b, iso);
        return (
          <g key={i} stroke={line} strokeWidth="1.15" strokeLinejoin="round">
            <polygon points={f.left} fill={faceA} />
            <polygon points={f.right} fill={faceB} />
            <polygon points={f.top} fill={faceT} />
          </g>
        );
      })}
      <path d={mullions.join(' ')} stroke={line} strokeOpacity="0.45" strokeWidth="0.8" />
      <path d={cols.join(' ')} stroke={line} strokeWidth="1.6" />
      {/* north arrow */}
      <g transform={`translate(${W - 90} ${H - 110})`} stroke={line} fill="none" strokeWidth="1.1" opacity="0.8">
        <circle r="26" />
        <path d="M0 -34 L7 6 L0 0 L-7 6 Z" fill={accent} stroke="none" />
        <text y="-40" textAnchor="middle" fontSize="13" fill={line} stroke="none" fontFamily="IBM Plex Sans Arabic, sans-serif">N</text>
      </g>
      {/* scale bar */}
      <g transform={`translate(70 ${H - 70})`} stroke={line} strokeWidth="1" opacity="0.7">
        <path d="M0 0h160M0 -5v10M40 -4v8M80 -5v10M160 -5v10" />
        <rect x="0" y="-3" width="40" height="6" fill={line} opacity="0.5" />
        <rect x="80" y="-3" width="40" height="6" fill={line} opacity="0.5" />
        <text x="0" y="22" fontSize="11" fill={line} stroke="none" fontFamily="IBM Plex Sans Arabic, sans-serif">0</text>
        <text x="160" y="22" fontSize="11" fill={line} stroke="none" textAnchor="end" fontFamily="IBM Plex Sans Arabic, sans-serif">20 m</text>
      </g>
    </svg>
  );
}

/** Small elevation-style divider used in empty states and section heads. */
export function SkylineRule({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 40" className={className} aria-hidden="true" preserveAspectRatio="none">
      <path d="M0 39h400M20 39V22h40v17M70 39V10h28v29M108 39V26h60v13M180 39V16l22-10 22 10v23M236 39V24h30v15M280 39V8h18v31M310 39V20h70v19" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
