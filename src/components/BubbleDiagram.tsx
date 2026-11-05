import { useMemo } from 'react';
import type { AdjacencyValue, SpaceRow, Zone } from '../db/types';
import { adjacencyKey, rowArea } from '../lib/program';

interface Node { id: string; name: string; r: number; color: string; x: number; y: number; vx: number; vy: number }

/**
 * Functional relationship (bubble) diagram. Deterministic force layout:
 * essential links pull strongly, desirable links pull lightly, "avoid" links
 * push apart, every pair repels to prevent overlap.
 */
export function BubbleDiagram({ spaces, zones, adjacency }: { spaces: SpaceRow[]; zones: Zone[]; adjacency: Record<string, AdjacencyValue> }) {
  const W = 720, H = 460;
  const layout = useMemo(() => {
    const maxA = Math.max(1, ...spaces.map(rowArea));
    const nodes: Node[] = spaces.map((s, i) => {
      const a = (i / Math.max(1, spaces.length)) * Math.PI * 2;
      return {
        id: s.id,
        name: s.name || '—',
        r: 16 + 30 * Math.sqrt(rowArea(s) / maxA),
        color: zones.find((z) => z.id === s.zoneId)?.color ?? '#cfc3b1',
        x: W / 2 + Math.cos(a) * 160,
        y: H / 2 + Math.sin(a) * 140,
        vx: 0,
        vy: 0,
      };
    });
    const val = (a: string, b: string) => adjacency[adjacencyKey(a, b)] ?? 0;
    for (let it = 0; it < 400; it++) {
      const t = 1 - it / 400;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const A = nodes[i], B = nodes[j];
          let dx = B.x - A.x, dy = B.y - A.y;
          let d = Math.hypot(dx, dy);
          if (d < 0.01) { dx = 1; dy = 0; d = 1; }
          const ux = dx / d, uy = dy / d;
          const minD = A.r + B.r + 14;
          let f = 0;
          if (d < minD) f -= (minD - d) * 0.5; // collision
          f -= 900 / (d * d); // general repulsion
          const v = val(A.id, B.id);
          if (v === 2) f += (d - minD) * 0.06;
          else if (v === 1) f += (d - minD) * 0.02;
          else if (v === -1) f -= 2200 / (d * d);
          A.vx += ux * f * t; A.vy += uy * f * t;
          B.vx -= ux * f * t; B.vy -= uy * f * t;
        }
      }
      for (const n of nodes) {
        n.vx += (W / 2 - n.x) * 0.004; // gentle centering
        n.vy += (H / 2 - n.y) * 0.004;
        n.x += n.vx * 0.5; n.y += n.vy * 0.5;
        n.vx *= 0.6; n.vy *= 0.6;
        n.x = Math.max(n.r + 4, Math.min(W - n.r - 4, n.x));
        n.y = Math.max(n.r + 4, Math.min(H - n.r - 4, n.y));
      }
    }
    const edges: { a: Node; b: Node; v: AdjacencyValue }[] = [];
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const v = val(nodes[i].id, nodes[j].id);
        if (v !== 0) edges.push({ a: nodes[i], b: nodes[j], v });
      }
    return { nodes, edges };
  }, [spaces, zones, adjacency]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="diagram" role="img" aria-label="مخطط العلاقات الوظيفية">
      <rect width={W} height={H} fill="#fffdf9" rx="10" />
      {layout.edges.map((e, i) => (
        <line
          key={i}
          x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y}
          stroke={e.v === -1 ? '#a4443a' : '#3e3a34'}
          strokeWidth={e.v === 2 ? 3 : 1.3}
          strokeDasharray={e.v === 1 ? '6 4' : e.v === -1 ? '2 4' : undefined}
          opacity={e.v === -1 ? 0.6 : 0.85}
        />
      ))}
      {layout.nodes.map((n) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} fillOpacity="0.85" stroke="#2e2b27" strokeWidth="1" />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={n.r > 30 ? 12 : 10} fill="#211f1c" fontWeight="600">
            {n.name.length > 14 ? n.name.slice(0, 13) + '…' : n.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
