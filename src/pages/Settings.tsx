import { useEffect, useRef, useState } from 'react';
import { useLive } from '../lib/hooks';
import { getSettings, updateSettings } from '../db/repo';
import { backupFileName, createBackup, importBackup, readBackup } from '../db/backup';
import { DATA_VERSION } from '../db/migrations';
import { storageInfo, type StorageInfo } from '../lib/storage';
import { downloadBlob } from '../lib/image';
import { fmtBytes, fmtDateTime } from '../lib/format';
import { getStatus } from '../ai/client';
import { Icon } from '../components/Icon';
import { Note, Progress, useConfirm, useToast } from '../components/ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let deferredInstall: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e as BeforeInstallPromptEvent;
  });
}

export function SettingsPage() {
  const settings = useLive(getSettings);
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [aiMsg, setAiMsg] = useState<{ kind: 'sage' | 'danger'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;

  const refreshInfo = () => storageInfo().then(setInfo);
  useEffect(() => { void refreshInfo(); }, []);
  useEffect(() => {
    if (settings) {
      setEndpoint(settings.aiEndpoint);
      setToken(settings.aiToken);
    }
  }, [settings]);

  const doExport = async () => {
    setBusy('جارٍ تجهيز النسخة الاحتياطية…');
    try {
      const { bytes, manifest } = await createBackup();
      downloadBlob(new Blob([bytes], { type: 'application/zip' }), backupFileName());
      await updateSettings({ lastBackupAt: Date.now() });
      toast(`تم: ${manifest.counts.projects} مشروع، ${manifest.counts.files} ملف (${fmtBytes(bytes.length)})`);
    } catch (e) {
      toast(`فشل التصدير: ${(e as Error).message}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const doImport = async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { manifest } = readBackup(bytes);
      const summary = `نسخة بتاريخ ${fmtDateTime(Date.parse(manifest.exportedAt))}: ${manifest.counts.projects} مشروع، ${manifest.counts.files} ملف، ${manifest.counts.mistakes} خطأ مسجل.`;
      const merge = await confirm({
        title: 'استيراد النسخة الاحتياطية',
        body: <>{summary}<br /><br /><strong>دمج</strong>: يضيف محتوى النسخة ويحدّث العناصر المشتركة، ولا يحذف شيئاً من هذا الجهاز. (موصى به)</>,
        confirm: 'دمج مع بياناتي',
      });
      let mode: 'merge' | 'replace' | null = merge ? 'merge' : null;
      if (!merge) {
        const replace = await confirm({
          title: 'استبدال كل البيانات؟',
          body: 'سيُحذف كل ما على هذا الجهاز ويُستبدل بمحتوى النسخة الاحتياطية. لا يمكن التراجع. فكري بأخذ نسخة احتياطية من هذا الجهاز أولاً.',
          confirm: 'استبدال الكل',
          danger: true,
        });
        mode = replace ? 'replace' : null;
      }
      if (!mode) return;
      setBusy('جارٍ الاستيراد…');
      const res = await importBackup(bytes, mode);
      toast(`استُعيد ${res.counts.projects} مشروع و${res.counts.files - res.missingFiles} ملف${res.missingFiles ? ` (${res.missingFiles} ملف مفقود من النسخة)` : ''}`);
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
      void refreshInfo();
    }
  };

  const testAi = async () => {
    setAiMsg(null);
    const ep = endpoint.trim();
    if (!/^https:\/\//.test(ep) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(ep)) {
      setAiMsg({ kind: 'danger', text: 'العنوان يجب أن يبدأ بـ https://' });
      return;
    }
    try {
      const s = await getStatus(ep, token.trim());
      setAiMsg({ kind: 'sage', text: `متصل: ${s.provider} / ${s.model} — استهلاك الشهر €${s.spentEur.toFixed(2)} من €${s.limitEur.toFixed(2)}${s.enabled ? '' : ' (المساعد معطّل على الخادم)'}` });
    } catch (e) {
      setAiMsg({ kind: 'danger', text: (e as Error).message });
    }
  };

  if (!settings) return <div className="page" />;
  const ratio = info?.quota ? info.usage / info.quota : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Settings</div>
          <h1>الإعدادات والنسخ الاحتياطي</h1>
        </div>
      </div>

      <div className="grid g2">
        <section className="card stack">
          <div className="card-head"><h3><Icon name="database" size={18} />النسخ الاحتياطي ونقل البيانات</h3></div>
          <p className="small muted" style={{ margin: 0 }}>
            كل مشاريعك وملفاتك ومحادثاتك محفوظة داخل هذا المتصفح على هذا الجهاز. لا توجد مزامنة سحابية بين الأجهزة. لنقل عملك من الحاسوب إلى الموبايل (أو العكس): صدّري نسخة احتياطية هنا ثم استورديها على الجهاز الآخر.
          </p>
          <div className="row">
            <button className="btn primary" onClick={doExport} disabled={!!busy}><Icon name="download" />تصدير نسخة احتياطية (.zip)</button>
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={!!busy}><Icon name="upload" />استيراد نسخة</button>
            <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
          </div>
          {busy && <span className="save-dot saving">{busy}</span>}
          <div className="small">آخر نسخة احتياطية: <strong>{settings.lastBackupAt ? fmtDateTime(settings.lastBackupAt) : 'لم تُؤخذ بعد'}</strong></div>
          <Note kind="bronze">احفظي ملف النسخة الاحتياطية خارج المتصفح (فلاشة، بريدك، Google Drive). مسح بيانات المتصفح أو إلغاء تثبيت التطبيق قد يحذف البيانات المحلية.</Note>
        </section>

        <section className="card stack">
          <div className="card-head"><h3><Icon name="layers" size={18} />مساحة التخزين</h3></div>
          {info?.supported ? (
            <>
              <div className="row between small"><span>المستخدم: <strong className="num">{fmtBytes(info.usage)}</strong></span><span className="muted">المتاح للتطبيق: <span className="num">{fmtBytes(info.quota)}</span></span></div>
              <Progress value={ratio} />
              {ratio > 0.75 && <Note kind="warn">المساحة تقترب من الامتلاء. خذي نسخة احتياطية واحذفي ملفات أو مشاريع قديمة.</Note>}
              <div className="small">
                التخزين الدائم: {info.persisted ? <span className="badge sage">مفعّل — لن يحذف المتصفح البيانات تلقائياً</span> : <span className="badge warn">غير مضمون</span>}
              </div>
              {!info.persisted && (
                <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={async () => { const ok = await navigator.storage.persist?.(); toast(ok ? 'تم تفعيل التخزين الدائم' : 'رفض المتصفح الطلب — ثبّتي التطبيق ثم أعيدي المحاولة', ok ? 'ok' : 'error'); void refreshInfo(); }}>طلب تخزين دائم</button>
              )}
            </>
          ) : <p className="small muted">المتصفح لا يكشف معلومات التخزين.</p>}
        </section>

        <section className="card stack">
          <div className="card-head"><h3><Icon name="board" size={18} />تثبيت التطبيق</h3></div>
          {standalone ? <Note kind="sage" icon="check">التطبيق مثبت ويعمل في نافذته الخاصة.</Note> : (
            <>
              <ul className="small" style={{ margin: 0, paddingInlineStart: 20, lineHeight: 2 }}>
                <li><strong>Windows (Edge / Chrome):</strong> أيقونة التثبيت في شريط العنوان، أو القائمة ⋯ ← التطبيقات ← تثبيت.</li>
                <li><strong>Android (Chrome):</strong> القائمة ⋮ ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</li>
                <li><strong>iPhone (Safari):</strong> زر المشاركة ← «إضافة إلى الشاشة الرئيسية».</li>
              </ul>
              <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={async () => { if (deferredInstall) { await deferredInstall.prompt(); deferredInstall = null; } else toast('استعملي قائمة المتصفح للتثبيت (التعليمات أعلاه).'); }}>
                <Icon name="download" />تثبيت الآن
              </button>
            </>
          )}
        </section>

        <section className="card stack">
          <div className="card-head"><h3><Icon name="spark" size={18} />اتصال المساعد الذكي</h3></div>
          <p className="small muted" style={{ margin: 0 }}>
            يتصل المساعد بخادم خاص (Cloudflare Worker) يحفظ مفتاح مزود الذكاء الاصطناعي سرياً ويفرض سقف الميزانية الشهري. هنا تضعين فقط عنوان الخادم ورمز وصولك الشخصي.
          </p>
          <div className="field"><label htmlFor="aiep">عنوان الخادم</label><input id="aiep" className="input" dir="ltr" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://joudy-ai.example.workers.dev" /></div>
          <div className="field"><label htmlFor="aitk">رمز الوصول الشخصي</label><input id="aitk" className="input" dir="ltr" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></div>
          <div className="row">
            <button className="btn primary" onClick={async () => { await updateSettings({ aiEndpoint: endpoint.trim().replace(/\/+$/, ''), aiToken: token.trim() }); toast('حُفظ'); }}>حفظ</button>
            <button className="btn" onClick={testAi} disabled={!endpoint || !token}>اختبار الاتصال</button>
            {settings.aiEndpoint && <button className="btn ghost danger" onClick={async () => { await updateSettings({ aiEndpoint: '', aiToken: '' }); toast('أُزيل الاتصال'); }}>إزالة</button>}
          </div>
          {aiMsg && <Note kind={aiMsg.kind}>{aiMsg.text}</Note>}
          <p className="tiny faint" style={{ margin: 0 }}>رمز الوصول يُحفظ على هذا الجهاز فقط ولا يُضمَّن في النسخ الاحتياطية. هذا الرمز ليس مفتاح المزود — مفتاح المزود موجود على الخادم فقط.</p>
        </section>

        <section className="card stack" style={{ gridColumn: '1 / -1' }}>
          <div className="card-head"><h3><Icon name="shield" size={18} />الخصوصية والأمان</h3></div>
          <ul className="small" style={{ margin: 0, paddingInlineStart: 20, lineHeight: 2 }}>
            <li>لا حسابات، لا تتبع، لا إعلانات، ولا جمع بيانات. لا يرسل التطبيق أي شيء إلى أي خادم إلا رسائل المساعد عند تفعيله.</li>
            <li>عند استعمال المساعد: يُرسل نص سؤالك والصورة المرفقة وملخص المشروع إلى خادمك الخاص ثم إلى مزود الذكاء الاصطناعي. لا تُرسلي معلومات شخصية حساسة.</li>
            <li>هذا تطبيق خاص من حيث التجربة، لكن صفحاته عامة على الإنترنت إن نُشرت على GitHub Pages: أي شخص يعرف الرابط يمكنه فتح التطبيق الفارغ — لكنه لا يرى بياناتك أبداً لأنها على جهازك فقط. الحماية الحقيقية من جهة الخادم موجودة فقط في خادم المساعد (رمز وصول يُتحقق منه على الخادم).</li>
          </ul>
          <div className="tiny faint">إصدار التطبيق {__APP_VERSION__} · إصدار البيانات {DATA_VERSION}</div>
          <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => updateSettings({ welcomeSeen: false })}>عرض شاشة الترحيب مجدداً</button>
        </section>
      </div>
    </div>
  );
}
