import { useState } from 'react';
import { Modal } from '../../components/ui';
import { Icon } from '../../components/Icon';

const STEPS: { title: string; text: string; art: JSX.Element }[] = [
  {
    title: 'الخطوة 1: ارفعي المسقط',
    text: 'اضغطي «ارفعي مسقطاً معمارياً» واختاري صورة (PNG/JPG)، لقطة شاشة، أو ملف PDF. يمكنك أيضاً اختيار مخطط مرفوع سابقاً في أحد مشاريعك، أو تجربة المثال الجاهز.',
    art: (
      <svg viewBox="0 0 200 120" className="diagram">
        <rect x="40" y="10" width="120" height="90" rx="8" fill="#fffdf9" stroke="#cfc3b1" strokeDasharray="5 4" />
        <path d="M100 75V35M85 50l15-15 15 15" stroke="#9a6a3c" strokeWidth="4" fill="none" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'الخطوة 2: اختاري «الكتلة المعمارية»',
    text: 'يقرأ التطبيق المسقط: يحدد الجدران وحدود المبنى والفراغات والأفنية. تحققي أن الخط البرونزي يحيط بالمبنى، وحوّلي أي فراغ مفتوح إلى «فناء» بنقرة. إن لم يكن على المخطط مقياس، استعملي «قياس مرجعي».',
    art: (
      <svg viewBox="0 0 200 120" className="diagram">
        <rect x="30" y="15" width="140" height="90" fill="#efe3d0" stroke="#9a6a3c" strokeWidth="4" />
        <rect x="80" y="45" width="40" height="30" fill="#b7c7b9" stroke="#2e2b27" />
        <line x1="80" y1="15" x2="80" y2="45" stroke="#2e2b27" strokeWidth="3" />
        <line x1="120" y1="75" x2="120" y2="105" stroke="#2e2b27" strokeWidth="3" />
      </svg>
    ),
  },
  {
    title: 'الخطوة 3: اختاري ثنائي أو ثلاثي الأبعاد',
    text: '«الكتلة ثلاثية الأبعاد» لنموذج تدورينه وتفحصينه، و«مخطط الكتلة 2D» لمخطط من الأعلى بألوان الارتفاعات. والنوع: كتلة بسيطة، دراسة حجمية، أو كتلة مفككة.',
    art: (
      <svg viewBox="0 0 200 120" className="diagram">
        <rect x="18" y="30" width="60" height="60" fill="#d9c3a5" stroke="#2e2b27" />
        <path d="M120 85l30-15 30 15-30 15z" fill="#efe3d0" stroke="#2e2b27" />
        <path d="M120 85v-40l30-15v40zM150 70V30l30 15v40z" fill="#c9a27a" stroke="#2e2b27" />
      </svg>
    ),
  },
  {
    title: 'الخطوة 4: حددي الطوابق والارتفاعات',
    text: 'اختاري عدد الطوابق الافتراضي وارتفاع الطابق (مثلاً 3.2 م). في «الدراسة الحجمية» أعطي كل جزء من المسقط عدد طوابق مختلفاً بالأزرار + و −.',
    art: (
      <svg viewBox="0 0 200 120" className="diagram">
        {[0, 1, 2, 3].map((k) => <rect key={k} x="60" y={95 - k * 22} width="80" height="18" fill={k === 3 ? '#9a6a3c' : '#e7dccb'} stroke="#2e2b27" />)}
        <text x="160" y="50" fontSize="16" fill="#2e2b27">4 ط</text>
      </svg>
    ),
  },
  {
    title: 'الخطوة 5: ولّدي النموذج وافحصيه',
    text: 'يُبنى النموذج من حدود مسقطك نفسه. اسحبي لتدويره، استعملي العجلة أو إصبعين للتكبير، وجربي أزرار المنظور والأكسونومتري، ودراسة الظلال بالشمس الحقيقية.',
    art: (
      <svg viewBox="0 0 200 120" className="diagram">
        <path d="M70 90l40-20 40 20-40 20z" fill="#efe3d0" stroke="#2e2b27" />
        <path d="M70 90V55l40-20v35zM110 70V35l40 20v35z" fill="#d9c3a5" stroke="#2e2b27" />
        <path d="M40 40a60 60 0 0 1 120 0" fill="none" stroke="#9a6a3c" strokeWidth="3" strokeDasharray="6 5" />
        <path d="M160 40l-8-8M160 40l-10 4" stroke="#9a6a3c" strokeWidth="3" />
      </svg>
    ),
  },
  {
    title: 'الخطوة 6: عدّلي وصدّري',
    text: 'جربي «بدائل الكتلة» و«المقاطع والواجهات» و«التنطيق والحركة»، ثم من «لوحة العرض والتصدير» نزّلي PNG أو PDF أو نموذج GLB/OBJ لبرامج التصميم. كل شيء يُحفظ تلقائياً.',
    art: (
      <svg viewBox="0 0 200 120" className="diagram">
        <rect x="35" y="15" width="130" height="90" fill="#fffdf9" stroke="#2e2b27" />
        <rect x="45" y="25" width="55" height="45" fill="#d9c3a5" />
        <rect x="108" y="25" width="47" height="70" fill="#efe3d0" />
        <rect x="35" y="88" width="130" height="17" fill="#211f1c" />
      </svg>
    ),
  },
];

export function LabTutorial({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  return (
    <Modal
      title="كيف أحوّل مسقطي إلى كتلة؟"
      onClose={onClose}
      footer={
        <>
          {i < STEPS.length - 1 ? <button className="btn primary" onClick={() => setI(i + 1)} autoFocus>التالي<Icon name="arrowLeft" /></button> : <button className="btn primary" onClick={onClose} autoFocus>ابدئي الآن</button>}
          {i > 0 && <button className="btn ghost" onClick={() => setI(i - 1)}><Icon name="arrowRight" />السابق</button>}
          <span className="spacer" />
          <span className="small muted num">{i + 1} / {STEPS.length}</span>
        </>
      }
    >
      <div className="stack" aria-live="polite">
        <div className="tutorial-art">{s.art}</div>
        <h3>{s.title}</h3>
        <p className="muted" style={{ margin: 0 }}>{s.text}</p>
        <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
          {STEPS.map((_, k) => <button key={k} className={`dot ${k === i ? 'on' : ''}`} aria-label={`الخطوة ${k + 1}`} onClick={() => setI(k)} />)}
        </div>
      </div>
    </Modal>
  );
}
