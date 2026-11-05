import { AxonHero, BrandMark } from '../components/ArchArt';
import { updateSettings } from '../db/repo';
import { Icon } from '../components/Icon';

export function Welcome() {
  return (
    <main className="welcome">
      <div className="welcome-art">
        <AxonHero variant="dark" />
      </div>
      <div className="welcome-copy">
        <BrandMark className="fade-in" />
        <div className="eyebrow fade-in d1">Joudy Architecture Studio</div>
        <h1 className="fade-in d1">
          مرحباً جودي،
          <br />
          هنا تبدأ أفكارك المعمارية وتتحول إلى مشاريع حقيقية.
        </h1>
        <p className="lead fade-in d2">
          استوديو شخصي لمشاريعك في السنة الرابعة: من تحليل الموقع والفكرة، إلى البرنامج والمخططات والمراجعة، وحتى لوحات العرض النهائي —
          مع أدوات هندسية دقيقة ومكان منظم لموادك الدراسية.
        </p>
        <div className="stack sm fade-in d3 small muted">
          <span className="row"><Icon name="shield" size={16} /> كل ملفاتك تُحفظ على جهازك فقط، وتعمل بدون إنترنت.</span>
          <span className="row"><Icon name="download" size={16} /> يمكنك نقل كل شيء بين الحاسوب والموبايل عبر ملف نسخة احتياطية.</span>
        </div>
        <div className="row fade-in d3" style={{ marginTop: 8 }}>
          <button className="btn primary" style={{ minHeight: 48, paddingInline: 26 }} onClick={() => updateSettings({ welcomeSeen: true })}>
            ادخلي إلى الاستوديو
            <Icon name="arrowLeft" />
          </button>
        </div>
      </div>
    </main>
  );
}
