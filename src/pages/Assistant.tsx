import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLive, useOnline } from '../lib/hooks';
import { deleteConversation, getBlob, getFileMeta, getProject, getSettings, listConversations, listProjects, saveConversation } from '../db/repo';
import type { ChatAttachment, ChatMessage, Conversation } from '../db/types';
import { AiError, getStatus, projectContext, sendChat, type AiChatMessage, type AiStatus } from '../ai/client';
import { imageForAI } from '../lib/image';
import { Icon } from '../components/Icon';
import { Empty, Note, useConfirm, useToast } from '../components/ui';
import { uid } from '../lib/id';
import { fmt, relTime } from '../lib/format';

const SUGGESTIONS = [
  'هل توزيع الغرف في هذا المسقط منطقي؟',
  'هل يوجد مشاكل بالحركة والمداخل؟',
  'كيف يمكن تحسين الإضاءة الطبيعية؟',
  'اشرح لي هذه المسألة بالبيتون المسلح خطوة بخطوة.',
  'ساعديني في صياغة بيان الفكرة لمشروعي.',
];

const HISTORY_LIMIT = 10;

export function Assistant() {
  const settings = useLive(getSettings);
  const projects = useLive(listProjects) ?? [];
  const convs = useLive(listConversations) ?? [];
  const [params, setParams] = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusErr, setStatusErr] = useState('');
  const [text, setText] = useState('');
  const [attach, setAttach] = useState<ChatAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [showList, setShowList] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const online = useOnline();
  const toast = useToast();
  const confirm = useConfirm();

  const configured = !!(settings?.aiEndpoint && settings?.aiToken);
  const active = convs.find((c) => c.id === activeId) ?? null;

  useEffect(() => {
    if (!configured || !online) return;
    getStatus(settings!.aiEndpoint, settings!.aiToken).then((s) => { setStatus(s); setStatusErr(''); }).catch((e) => setStatusErr((e as Error).message));
  }, [configured, online, settings]);

  // Deep link from drawings: ?project=..&file=..
  useEffect(() => {
    const pid = params.get('project');
    const fid = params.get('file');
    if (!pid && !fid) return;
    (async () => {
      const c: Conversation = { id: uid(), projectId: pid, title: 'محادثة جديدة', createdAt: Date.now(), updatedAt: Date.now(), pinned: false, messages: [] };
      if (fid) {
        const meta = await getFileMeta(fid);
        const blob = await getBlob(fid);
        if (meta && blob) {
          try {
            const img = await imageForAI(blob);
            setAttach([{ kind: 'image', fileId: fid, dataUrl: img.dataUrl, name: meta.title }]);
            c.title = `حول: ${meta.title}`;
          } catch {
            toast('تعذّر تجهيز الصورة', 'error');
          }
        }
      }
      await saveConversation(c);
      setActiveId(c.id);
      setParams({}, { replace: true });
    })();
  }, [params, setParams, toast]);

  useEffect(() => {
    if (!activeId && convs.length) setActiveId(convs[0].id);
  }, [convs, activeId]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [active?.messages.length, sending]);

  const newConv = async (projectId: string | null) => {
    const c: Conversation = { id: uid(), projectId, title: 'محادثة جديدة', createdAt: Date.now(), updatedAt: Date.now(), pinned: false, messages: [] };
    await saveConversation(c);
    setActiveId(c.id);
    setShowList(false);
  };

  const addImages = async (files: FileList) => {
    for (const f of [...files]) {
      if (!f.type.startsWith('image/')) {
        toast('حالياً يدعم المساعد الصور فقط. لملف PDF: صدّري الصفحة المطلوبة كصورة.', 'error');
        continue;
      }
      try {
        const img = await imageForAI(f);
        const max = status?.maxImageBytes ?? 1_500_000;
        if (img.bytes > max) {
          toast('الصورة كبيرة حتى بعد التصغير.', 'error');
          continue;
        }
        setAttach((a) => [...a, { kind: 'image' as const, dataUrl: img.dataUrl, name: f.name }].slice(0, 2));
      } catch {
        toast(`تعذّر قراءة الصورة ${f.name}`, 'error');
      }
    }
  };

  const send = async (prompt?: string) => {
    const body = (prompt ?? text).trim();
    if (!body || !settings) return;
    let conv = active;
    if (!conv) {
      conv = { id: uid(), projectId: settings.currentProjectId, title: 'محادثة جديدة', createdAt: Date.now(), updatedAt: Date.now(), pinned: false, messages: [] };
    }
    const userMsg: ChatMessage = { id: uid(), role: 'user', text: body, at: Date.now(), attachments: attach.length ? attach : undefined };
    conv = { ...conv, title: conv.messages.length === 0 ? body.slice(0, 48) : conv.title, messages: [...conv.messages, userMsg] };
    await saveConversation(conv);
    setActiveId(conv.id);
    setText('');
    setAttach([]);
    setSending(true);
    try {
      // Only the newest user message carries images (cost control).
      const history = conv.messages.filter((m) => m.role !== 'error').slice(-HISTORY_LIMIT);
      const msgs: AiChatMessage[] = history.map((m, i) => ({
        role: m.role as 'user' | 'assistant',
        content: [
          ...(i === history.length - 1 ? (m.attachments ?? []).map((a) => ({ type: 'image' as const, dataUrl: a.dataUrl })) : []),
          { type: 'text' as const, text: m.text + (i < history.length - 1 && m.attachments?.length ? '\n[أُرفقت صورة في هذه الرسالة سابقاً]' : '') },
        ],
      }));
      const project = conv.projectId ? await getProject(conv.projectId) : undefined;
      const reply = await sendChat(settings.aiEndpoint, settings.aiToken, msgs, projectContext(project));
      conv = { ...conv, messages: [...conv.messages, { id: uid(), role: 'assistant', text: reply.text, at: Date.now(), costEur: reply.costEur }] };
      setStatus((s) => (s ? { ...s, spentEur: reply.spentEur, limitEur: reply.limitEur, remainingEur: reply.limitEur - reply.spentEur } : s));
    } catch (e) {
      const msg = e instanceof AiError ? e.message : 'حدث خطأ غير متوقع.';
      conv = { ...conv, messages: [...conv.messages, { id: uid(), role: 'error', text: msg, at: Date.now() }] };
    } finally {
      await saveConversation(conv);
      setSending(false);
    }
  };

  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name;

  return (
    <div className="page">
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <div className="eyebrow">AI Architecture Assistant</div>
          <h1>المساعد المعماري</h1>
        </div>
        <div className="row">
          {status && <span className="badge bronze num">الشهر: €{fmt(status.spentEur, 2)} / €{fmt(status.limitEur, 2)}</span>}
          <button className="btn only-mobile" onClick={() => setShowList((v) => !v)}><Icon name="list" />المحادثات</button>
        </div>
      </div>

      {!configured && (
        <div style={{ marginBottom: 16 }}>
          <Note kind="warn">
            <strong>المساعد غير مفعّل بعد.</strong> حتى تاريخ إعداد هذا الإصدار، لا تُدرج مزودات الذكاء الاصطناعي الكبرى (OpenAI, Anthropic, Google Gemini) سوريا ضمن الدول المدعومة لواجهاتها البرمجية، ولا نستعمل أي طريقة للالتفاف على ذلك.
            عند توفر مزود يسمح بالاستخدام من سوريا، يُنشر الخادم الخاص ويُضاف عنوانه ورمز الوصول من <Link to="/settings">الإعدادات</Link>. كل ميزات الاستوديو الأخرى تعمل بالكامل الآن، ويمكنك حفظ أسئلتك هنا كمسودات.
          </Note>
        </div>
      )}
      {configured && statusErr && <div style={{ marginBottom: 16 }}><Note kind="danger">{statusErr}</Note></div>}
      {configured && status && !status.enabled && <div style={{ marginBottom: 16 }}><Note kind="warn">{status.message ?? 'الخادم يعمل لكن المساعد معطّل من إعدادات الخادم.'}</Note></div>}
      {!online && <div style={{ marginBottom: 16 }}><Note kind="warn" icon="wifioff">أنت غير متصلة بالإنترنت. يمكنك قراءة المحادثات السابقة فقط.</Note></div>}

      <div className="chat">
        <aside className={`card tight chat-list ${showList ? '' : 'collapsed'}`}>
          <div className="stack sm" style={{ marginBottom: 10 }}>
            <button className="btn primary sm" onClick={() => newConv(settings?.currentProjectId ?? null)}><Icon name="plus" />محادثة جديدة</button>
          </div>
          {convs.length === 0 ? <p className="small muted">لا محادثات بعد.</p> : (
            <div className="list">
              {convs.map((c) => (
                <div key={c.id} className="list-item" style={{ padding: '8px 4px', cursor: 'pointer', background: c.id === activeId ? 'var(--ivory)' : undefined, borderRadius: 8 }} onClick={() => { setActiveId(c.id); setShowList(false); }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="small" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.pinned && '★ '}{c.title}</div>
                    <div className="tiny faint">{projectName(c.projectId) ?? 'عام'} · {relTime(c.updatedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        <section className="card chat-main">
          {active && (
            <div className="row between" style={{ paddingBottom: 10, borderBottom: '1px solid var(--line)', marginBottom: 6 }}>
              <select className="select" style={{ width: 'auto', maxWidth: 260 }} value={active.projectId ?? ''} onChange={(e) => saveConversation({ ...active, projectId: e.target.value || null })} aria-label="المشروع المرتبط">
                <option value="">بدون مشروع (عام)</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="row" style={{ gap: 2 }}>
                <button className="btn ghost sm" onClick={() => saveConversation({ ...active, pinned: !active.pinned })}><Icon name="star" />{active.pinned ? 'إلغاء التثبيت' : 'محادثة مهمة'}</button>
                <button className="btn ghost icon sm" aria-label="حذف المحادثة" onClick={async () => { if (await confirm({ title: 'حذف المحادثة؟', confirm: 'حذف', danger: true })) { await deleteConversation(active.id); setActiveId(null); } }}><Icon name="trash" /></button>
              </div>
            </div>
          )}
          <div className="chat-log" ref={logRef}>
            {!active || active.messages.length === 0 ? (
              <div className="stack" style={{ margin: 'auto', maxWidth: 520, textAlign: 'center' }}>
                <Empty icon="spark" title="اسألي عن مشروعك">يرى المساعد ملخص المشروع المرتبط (البرنامج، الموقع، الفكرة، جدول الفراغات) والصورة التي ترفقينها.</Empty>
                <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
                  {SUGGESTIONS.map((s) => <button key={s} className="btn sm" onClick={() => setText(s)}>{s}</button>)}
                </div>
              </div>
            ) : (
              active.messages.map((m) => (
                <div key={m.id} className={`msg ${m.role}`}>
                  {m.attachments?.map((a, i) => <img key={i} src={a.dataUrl} alt={a.name} />)}
                  {m.text}
                  {m.costEur !== undefined && <div className="tiny faint" style={{ marginTop: 6 }}>≈ €{fmt(m.costEur, 4)}</div>}
                </div>
              ))
            )}
            {sending && <div className="msg assistant"><span className="save-dot saving">يفكر…</span></div>}
          </div>
          <div className="composer">
            {attach.length > 0 && (
              <div className="row" style={{ gap: 6 }}>
                {attach.map((a, i) => (
                  <span key={i} className="chip"><img src={a.dataUrl} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }} />{a.name}<button aria-label="إزالة" onClick={() => setAttach(attach.filter((_, j) => j !== i))}><Icon name="close" /></button></span>
                ))}
              </div>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={configured ? 'اكتبي سؤالك… (Enter للإرسال، Shift+Enter لسطر جديد)' : 'المساعد غير مفعّل بعد'}
              aria-label="الرسالة"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && configured) { e.preventDefault(); void send(); } }}
            />
            <div className="row between">
              <div className="row" style={{ gap: 4 }}>
                <button className="btn ghost sm" onClick={() => fileInput.current?.click()} disabled={attach.length >= 2}><Icon name="image" />إرفاق صورة/مخطط</button>
                <input ref={fileInput} type="file" accept="image/*" hidden multiple onChange={(e) => { if (e.target.files) void addImages(e.target.files); e.target.value = ''; }} />
              </div>
              <button className="btn primary sm" disabled={!configured || !online || sending || !text.trim()} onClick={() => send()}><Icon name="send" />إرسال</button>
            </div>
          </div>
          <p className="tiny faint" style={{ marginTop: 8 }}>
            ملاحظات المساعد تعليمية واستشارية، ولا تُغني عن مراجعة الأستاذ أو مهندس مختص. لا يتحقق من سلامة أي إنشاء. تُصغَّر الصور قبل الإرسال لتقليل الكلفة.
          </p>
        </section>
      </div>
    </div>
  );
}
