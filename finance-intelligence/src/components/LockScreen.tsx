import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useStore } from '../state/store';
import { Button, inputCls, Note } from './ui';

function strength(p: string): { score: number; label: string } {
  let s = 0;
  if (p.length >= 12) s++;
  if (p.length >= 16) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^a-zA-Z0-9]/.test(p)) s++;
  return { score: s, label: ['Molto debole', 'Debole', 'Discreta', 'Buona', 'Forte', 'Ottima'][s] };
}

export function LockScreen() {
  const { status, create, unlock, wipe } = useStore();
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isSetup = status === 'setup';
  const st = strength(pass);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (isSetup) {
      if (pass.length < 12) return setError('Usa almeno 12 caratteri.');
      if (pass !== confirm) return setError('Le passphrase non coincidono.');
    }
    setBusy(true);
    try {
      await (isSetup ? create(pass) : unlock(pass));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setPass('');
      setConfirm('');
    }
  }

  if (status === 'loading') return <div className="grid min-h-screen place-items-center text-muted"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(144,133,233,0.18),transparent_70%)]" />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-3xl border border-line bg-surface/90 p-8 shadow-2xl backdrop-blur animate-fade-in">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#9085e9] to-[#3987e5] text-white">
            {isSetup ? <ShieldCheck size={22} /> : <KeyRound size={20} />}
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{isSetup ? 'Crea la tua cassaforte' : 'Sblocca Finance Intelligence'}</h1>
            <p className="text-xs text-muted">{isSetup ? 'I dati restano cifrati su questo dispositivo' : 'Inserisci la passphrase della cassaforte'}</p>
          </div>
        </div>
        <div className="space-y-3">
          <input type="password" autoFocus autoComplete={isSetup ? 'new-password' : 'current-password'} className={inputCls} placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Passphrase" />
          {isSetup && (
            <>
              <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i < st.score ? (st.score >= 4 ? '#0ca30c' : st.score >= 2 ? '#fab219' : '#ec835a') : 'rgba(255,255,255,0.08)' }} />
                  ))}
                </div>
                <span className="w-20 text-right text-[11px] text-muted">{pass ? st.label : ''}</span>
              </div>
              <input type="password" autoComplete="new-password" className={inputCls} placeholder="Conferma passphrase" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Conferma passphrase" />
            </>
          )}
          {error && <p className="text-sm text-[#ff8a8a]" role="alert">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" disabled={busy || !pass}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {isSetup ? 'Crea cassaforte cifrata' : 'Sblocca'}
          </Button>
        </div>
        <div className="mt-6 space-y-2">
          <Note>
            Questa passphrase protegge i tuoi dati finanziari con cifratura AES‑256‑GCM (chiave derivata con PBKDF2, 600.000 iterazioni). <strong className="text-ink">Non è la password della banca</strong>: l'app non chiede mai credenziali di Revolut o Trade Republic.
          </Note>
          {isSetup && <Note tone="warning">Se dimentichi la passphrase i dati non sono recuperabili. Puoi sempre esportarli dalle Impostazioni.</Note>}
          {!isSetup && (
            <button type="button" className="w-full pt-2 text-center text-xs text-muted hover:text-ink-2" onClick={() => confirm_wipe(wipe)}>
              Passphrase dimenticata? Cancella tutti i dati locali
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function confirm_wipe(wipe: () => Promise<void>) {
  if (window.confirm('Cancellare definitivamente tutti i dati salvati su questo dispositivo? L\'operazione non è reversibile.')) void wipe();
}
