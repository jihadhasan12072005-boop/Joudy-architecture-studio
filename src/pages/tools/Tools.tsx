import { Link, useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Note } from '../../components/ui';
import { TOOL_LIST } from './toolList';
import { ScaleTool, AreaTool, UnitsTool, MeasureTool } from './ToolsBasic';
import { StairTool, QuantityTool, ConcreteTool, MaterialsTool } from './ToolsEng';
import { SpaceTool, ChecklistTool } from './ToolsProject';

const COMPONENTS: Record<string, () => JSX.Element> = {
  scale: ScaleTool,
  area: AreaTool,
  stairs: StairTool,
  quantities: QuantityTool,
  concrete: ConcreteTool,
  materials: MaterialsTool,
  space: SpaceTool,
  checklist: ChecklistTool,
  units: UnitsTool,
  measure: MeasureTool,
};

export function ToolsIndex() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Engineering Tools</div>
          <h1>الأدوات الهندسية</h1>
          <p className="lead">أدوات تعمل بدون إنترنت وبدون ذكاء اصطناعي، بواحدات صريحة ومعادلات موضحة. هي أدوات تعليمية وليست برامج تصميم إنشائي معتمدة.</p>
        </div>
      </div>
      <div className="auto-grid">
        {TOOL_LIST.map((t) => (
          <Link key={t.id} to={`/tools/${t.id}`} className="tool-tile">
            <span className="ic"><Icon name={t.icon} /></span>
            <span>
              <h3>{t.ar}</h3>
              <span className="en">{t.en}</span>
            </span>
            <span className="small muted">{t.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ToolPage() {
  const { toolId = '' } = useParams();
  const info = TOOL_LIST.find((t) => t.id === toolId);
  const C = COMPONENTS[toolId];
  if (!info || !C) return <div className="page"><Note kind="warn">الأداة غير موجودة. <Link to="/tools">كل الأدوات</Link></Note></div>;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="row small muted" style={{ gap: 6 }}><Link to="/tools" style={{ color: 'inherit' }}>الأدوات</Link><span>/</span></div>
          <h1>{info.ar} <span className="en" style={{ fontSize: '1rem' }}>{info.en}</span></h1>
          <p className="lead">{info.desc}</p>
        </div>
      </div>
      <div style={{ marginBottom: 18 }}><Note kind="bronze" icon="info"><strong>الأساس: </strong>{info.basis}</Note></div>
      <C />
    </div>
  );
}
