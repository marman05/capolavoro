import clsx from 'clsx';
import { Bot, Cpu, Loader2, Send, ShieldCheck, Sparkles, User } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { answerLocally, buildAiContext, SUGGESTED_QUESTIONS, type AssistantAnswer } from '../analytics/assistant';
import { Badge, Card, NatureTag, PageHeader, Segmented } from '../components/ui';
import { serverStatus, type ServerStatus } from '../connectors/openbanking';
import { useStore } from '../state/store';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  answer?: AssistantAnswer;
  error?: boolean;
  pending?: boolean;
}

/** Rendering minimale e sicuro del markdown (grassetto, elenchi, a capo): nessun HTML iniettato. */
function RichText({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let list: string[] = [];
  const inline = (s: string, k: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={`${k}-${i}`} className="font-semibold text-ink">{part.slice(2, -2)}</strong> : <span key={`${k}-${i}`}>{part}</span>));
  const flush = () => {
    if (list.length) out.push(<ul key={`l${out.length}`} className="my-1 list-disc space-y-0.5 pl-5 marker:text-muted">{list.map((l, i) => <li key={i}>{inline(l, `li${i}`)}</li>)}</ul>);
    list = [];
  };
  lines.forEach((l, i) => {
    const m = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (m) list.push(m[1]);
    else {
      flush();
      if (l.startsWith('#')) out.push(<p key={i} className="mt-2 font-semibold text-ink">{l.replace(/^#+\s*/, '')}</p>);
      else if (l.trim()) out.push(<p key={i} className="my-1">{inline(l, `p${i}`)}</p>);
    }
  });
  flush();
  return <div className="text-sm leading-relaxed text-ink-2">{out}</div>;
}

export default function AssistantPage() {
  const { data, analysis } = useStore();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const aiAvailable = !!status?.ai.configured && data.settings.aiEnabled && !!data.settings.aiConsentAt;
  const [mode, setMode] = useState<'local' | 'ai'>('local');
  const endRef = useRef<HTMLDivElement>(null);
  const context = useMemo(() => buildAiContext(data, analysis), [data, analysis]);

  useEffect(() => {
    serverStatus(data.settings.apiToken).then(setStatus).catch(() => setStatus(null));
  }, [data.settings.apiToken]);
  useEffect(() => {
    if (aiAvailable) setMode('ai');
  }, [aiAvailable]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setInput('');
    const history = [...messages, { role: 'user' as const, content: q }];
    if (mode === 'local' || !aiAvailable) {
      const answer = answerLocally(q, data, analysis);
      setMessages([...history, { role: 'assistant', content: answer.text, answer }]);
      return;
    }
    setBusy(true);
    setMessages([...history, { role: 'assistant', content: '', pending: true }]);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(data.settings.apiToken ? { Authorization: `Bearer ${data.settings.apiToken}` } : {}) },
        body: JSON.stringify({ messages: history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content || '…' })).slice(-20), context }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Errore ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop() ?? '';
        for (const ev of events) {
          const type = ev.match(/^event: (.*)$/m)?.[1];
          const payload = JSON.parse(ev.match(/^data: (.*)$/m)?.[1] ?? '{}');
          if (type === 'delta') {
            text += payload.text;
            setMessages((ms) => [...ms.slice(0, -1), { role: 'assistant', content: text, pending: true }]);
          } else if (type === 'error') throw new Error(payload.error);
        }
      }
      setMessages((ms) => [...ms.slice(0, -1), { role: 'assistant', content: text, answer: { text, facts: [], estimates: [], source: 'ai' } }]);
    } catch (e) {
      setMessages((ms) => [...ms.slice(0, -1), { role: 'assistant', content: `${(e as Error).message}. Ecco la risposta del motore locale:\n\n${answerLocally(q, data, analysis).text}`, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };

  return (
    <>
      <PageHeader
        title="AI Financial Assistant"
        subtitle="Domande in linguaggio naturale sui tuoi dati reali, con periodo analizzato e distinzione tra fatti e stime."
        action={
          <Segmented
            value={mode}
            onChange={(v) => setMode(v)}
            options={[
              { value: 'local', label: 'Motore locale' },
              { value: 'ai', label: 'AI (Claude)' },
            ]}
          />
        }
      />
      {mode === 'ai' && !aiAvailable && (
        <div className="mb-4 rounded-2xl border border-line bg-surface p-4 text-sm text-ink-2">
          <div className="mb-1 flex items-center gap-2 font-medium text-ink"><ShieldCheck size={16} className="text-accent" /> Attiva l'assistente AI</div>
          {!status?.ai.configured ? 'Il server non ha una API key configurata (ANTHROPIC_API_KEY nel file .env). ' : ''}
          {!data.settings.aiEnabled || !data.settings.aiConsentAt ? (
            <>
              Serve il tuo consenso: l'assistente riceverà un riepilogo aggregato (totali, categorie, ricorrenze, posizioni) senza IBAN né credenziali. <Link to="/impostazioni" className="text-[#c9c2ff] hover:underline">Gestisci il consenso →</Link>
            </>
          ) : null}
          <div className="mt-1 text-xs text-muted">Nel frattempo il motore locale risponde alle domande principali senza inviare dati all'esterno.</div>
        </div>
      )}
      <Card className="flex min-h-[60vh] flex-col !p-0">
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {!messages.length && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#9085e9] to-[#3987e5] text-white"><Sparkles size={22} /></div>
              <h2 className="text-lg font-semibold">Chiedimi dei tuoi soldi</h2>
              <p className="mx-auto mt-1 max-w-lg text-sm text-ink-2">Analizzo i dati di Revolut e Trade Republic importati in questa app. {mode === 'local' ? 'Modalità locale: nessun dato lascia il dispositivo.' : 'Modalità AI: invio un riepilogo aggregato al modello.'}</p>
              <div className="mx-auto mt-6 grid max-w-3xl gap-2 sm:grid-cols-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button key={q} onClick={() => void ask(q)} className="rounded-xl border border-line bg-elevated/60 px-3 py-2.5 text-left text-sm text-ink-2 transition-colors hover:border-line-strong hover:text-ink">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={clsx('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
              <div className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-xl', m.role === 'user' ? 'bg-white/10' : 'bg-accent/20 text-[#c9c2ff]')}>{m.role === 'user' ? <User size={15} /> : m.answer?.source === 'local' ? <Cpu size={15} /> : <Bot size={15} />}</div>
              <div className={clsx('max-w-[85%] rounded-2xl px-4 py-3', m.role === 'user' ? 'bg-white/[0.07] text-sm text-ink' : 'border border-line bg-elevated/60')}>
                {m.role === 'user' ? (
                  m.content
                ) : (
                  <>
                    {m.answer?.period && (
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge tone="info">Periodo: {m.answer.period}</Badge>
                        {data.isDemo && <NatureTag nature="demo" />}
                      </div>
                    )}
                    {m.pending && !m.content ? <Loader2 size={16} className="animate-spin text-muted" /> : <RichText text={m.content} />}
                    {!!m.answer?.facts.length && (
                      <div className="mt-3">
                        <div className="mb-1 flex items-center gap-2"><NatureTag nature="fatto" /></div>
                        <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-ink-2 marker:text-muted">{m.answer.facts.map((f) => <li key={f}>{f}</li>)}</ul>
                      </div>
                    )}
                    {!!m.answer?.estimates.length && (
                      <div className="mt-3">
                        <div className="mb-1 flex items-center gap-2"><NatureTag nature="stima" /></div>
                        <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-ink-2 marker:text-muted">{m.answer.estimates.map((f) => <li key={f}>{f}</li>)}</ul>
                      </div>
                    )}
                    <div className="mt-2 text-[10px] uppercase tracking-wider text-muted">{m.answer?.source === 'ai' ? 'Risposta AI su riepilogo aggregato' : m.error ? 'Errore AI · fallback locale' : m.pending ? 'Sto analizzando…' : 'Motore locale deterministico'}</div>
                  </>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
          <input className="h-11 flex-1 rounded-xl border border-line-strong bg-page px-4 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none" placeholder="Fai una domanda sui tuoi dati…" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Domanda" />
          <button type="submit" disabled={busy || !input.trim()} className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-page disabled:opacity-40" aria-label="Invia">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </Card>
      <p className="mt-3 text-center text-[11px] text-muted">Le risposte sono analisi dei tuoi dati, non consulenza finanziaria. L'assistente non può eseguire operazioni.</p>
    </>
  );
}
