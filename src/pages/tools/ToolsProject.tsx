import { Link } from 'react-router-dom';
import { useLive } from '../../lib/hooks';
import { listProjects, saveProject, getProject } from '../../db/repo';
import { Checklist, Empty, Progress } from '../../components/ui';
import { summarizeProgram } from '../../lib/program';
import { fmt } from '../../lib/format';
import { BOARD_CHECKS, DRAWING_CHECKS, PROGRAM_CHECKS, SITE_CHECKS, type CheckItem } from '../../data/checklists';
import type { Project } from '../../db/types';
import { useState } from 'react';

export function SpaceTool() {
  const projects = useLive(listProjects) ?? [];
  if (projects.length === 0) return <div className="card"><Empty icon="list" title="لا مشاريع بعد">أنشئي مشروعاً لتستعملي جدول الفراغات. <Link to="/projects">المشاريع</Link></Empty></div>;
  return (
    <div className="auto-grid">
      {projects.map((p) => {
        const s = summarizeProgram(p);
        return (
          <Link key={p.id} to={`/projects/${p.id}/program`} className="tool-tile">
            <h3>{p.name}</h3>
            <span className="small muted">{p.program.spaces.length} فراغ · صافي {fmt(s.net, 0)} م² · إجمالي {fmt(s.gross, 0)} م²</span>
          </Link>
        );
      })}
    </div>
  );
}

type Group = { key: string; title: string; items: CheckItem[]; get: (p: Project) => Record<string, boolean>; set: (p: Project, s: Record<string, boolean>) => Project; prefix?: string };

const GROUPS: Group[] = [
  { key: 'site', title: 'تحليل الموقع', items: SITE_CHECKS, get: (p) => p.site.checks, set: (p, s) => ({ ...p, site: { ...p.site, checks: s } }) },
  { key: 'program', title: 'البرنامج والتصميم الأولي', items: PROGRAM_CHECKS, get: (p) => p.program.checks, set: (p, s) => ({ ...p, program: { ...p.program, checks: s } }) },
  { key: 'drawings', title: 'المخططات المطلوبة', items: DRAWING_CHECKS.map((c) => ({ ...c, id: 'd-' + c.id })), get: (p) => p.presentation.boardChecklist, set: (p, s) => ({ ...p, presentation: { ...p.presentation, boardChecklist: s } }) },
  { key: 'boards', title: 'إخراج اللوحات', items: BOARD_CHECKS, get: (p) => p.presentation.boardChecklist, set: (p, s) => ({ ...p, presentation: { ...p.presentation, boardChecklist: s } }) },
];

export function ChecklistTool() {
  const projects = useLive(listProjects) ?? [];
  const [pid, setPid] = useState<string>('');
  const id = pid || projects.find((p) => p.status === 'active')?.id || projects[0]?.id;
  const p = useLive(() => (id ? getProject(id) : Promise.resolve(undefined)), [id]);
  if (projects.length === 0) return <div className="card"><Empty icon="check" title="لا مشاريع بعد" /></div>;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <select className="select" style={{ maxWidth: 360 }} value={id} onChange={(e) => setPid(e.target.value)} aria-label="المشروع">
        {projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {p && (
        <div className="grid g2">
          {GROUPS.map((g) => {
            const state = g.get(p);
            const done = g.items.filter((i) => state[i.id]).length;
            return (
              <section key={g.key} className="card">
                <div className="card-head"><h3>{g.title}</h3><span className="badge num">{done}/{g.items.length}</span></div>
                <Progress value={done / g.items.length} />
                <div style={{ marginTop: 10 }}>
                  <Checklist items={g.items} state={state} onToggle={(cid, v) => void saveProject(g.set(p, { ...state, [cid]: v }), { snapshot: false })} />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
