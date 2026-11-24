import { useEffect, useRef, useState } from 'react';
import { createCalculation, fetchCalculations } from './api';
import './App.css';

/*
  HOW THIS CALCULATOR WORKS (read this first)
  -------------------------------------------
  Your backend does one thing: take num1, num2, operant and return a result.
  So the UI is a tiny state machine that collects those three values:

    type 10   → entry = "10"
    press +   → stored = 10, op = "+", next digit starts a fresh entry
    type 5    → entry = "5"
    press =   → POST { num1: 10, num2: 5, operant: "+" } → show result 15

  Chaining (10 + 5 + 2) works too: pressing a second operator first
  sends the pending calculation, then continues from its result.

  √x and % are not in your API, so they run in the browser and are not saved.
*/

// The keypad shows pretty symbols; the API expects plain ones.
const SYMBOL_TO_API = { '+': '+', '−': '-', '×': '*', '÷': '/' };
const API_TO_SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const MAX_DIGITS = 12;

// toPrecision(12) hides float noise: 0.1 + 0.2 → "0.3", not "0.30000000000000004".
const formatNumber = (n) => String(Number(n.toPrecision(12)));

const newestFirst = (items) => [...items].sort((a, b) => b.id - a.id);

// Longer numbers get a smaller font so they never overflow the screen.
function sizeFor(text) {
  const length = text.length;
  if (length <= 5) return 'xl';
  if (length <= 7) return 'lg';
  if (length <= 9) return 'md';
  if (length <= 12) return 'sm';
  return 'xs';
}

function Key({ label, onPress, variant, ariaLabel, active = false, busy = false }) {
  return (
    <button
      type="button"
      className={`key key--${variant}${active ? ' is-active' : ''}`}
      onClick={onPress}
      // Stops mouse clicks from leaving focus on the key, so pressing Enter
      // afterwards means "=" and not "press this key again".
      onMouseDown={(event) => event.preventDefault()}
      aria-label={ariaLabel}
      aria-pressed={variant === 'op' ? active : undefined}
      aria-busy={busy || undefined}
    >
      {label}
    </button>
  );
}

function History({ status, items, errorMessage, onRetry, onUse }) {
  return (
    <section className="history" aria-labelledby="history-title">
      <h2 id="history-title" className="history__title">
        History
      </h2>

      {status === 'loading' && <p className="history__note">Loading history…</p>}

      {status === 'error' && (
        <div className="history__note" role="alert">
          <p>{errorMessage}</p>
          <button type="button" className="history__retry" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && items.length === 0 && (
        <p className="history__note">No calculations yet. Press = to save your first one.</p>
      )}

      {status === 'ready' && items.length > 0 && (
        <ul className="history__list">
          {items.map((item) => {
            const expression = `${formatNumber(item.num1)} ${
              API_TO_SYMBOL[item.operant] ?? item.operant
            } ${formatNumber(item.num2)}`;
            const result = formatNumber(item.result);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="history__item"
                  onClick={() => onUse(item.result)}
                  aria-label={`${expression} equals ${result}. Use this result.`}
                >
                  <span className="history__expression">{expression}</span>
                  <span className="history__result">= {result}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function App() {
  // ---- Calculator state --------------------------------------------------
  const [entry, setEntry] = useState('0'); // the number being typed / shown
  const [stored, setStored] = useState(null); // num1, once an operator is pressed
  const [op, setOp] = useState(null); // pending operator symbol
  const [fresh, setFresh] = useState(true); // true → next digit replaces the entry
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); // true while a POST is in flight

  // ---- History state -----------------------------------------------------
  const [history, setHistory] = useState([]);
  const [historyStatus, setHistoryStatus] = useState('loading'); // loading | ready | error
  const [historyError, setHistoryError] = useState('');

  // Bumping this number re-runs the fetch effect below. It is the single
  // way history gets (re)loaded: first load, retry, and after each save.
  const [historyVersion, setHistoryVersion] = useState(0);
  const refreshHistory = () => setHistoryVersion((version) => version + 1);

  useEffect(() => {
    let cancelled = false; // ignore responses that arrive after a newer request
    fetchCalculations()
      .then((items) => {
        if (cancelled) return;
        setHistory(newestFirst(items));
        setHistoryStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setHistoryError(err.message);
        setHistoryStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [historyVersion]);

  const retryHistory = () => {
    setHistoryStatus('loading');
    refreshHistory();
  };

  // ---- Talking to the API ------------------------------------------------
  // Resolves to the result number, or null if the request failed
  // (the error message is already on screen by then).
  async function calculate(num1, symbol, num2) {
    setBusy(true);
    setError('');
    try {
      const saved = await createCalculation({
        num1,
        num2,
        operant: SYMBOL_TO_API[symbol],
      });
      refreshHistory(); // intentionally not awaited: show the result immediately
      return saved.result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  // ---- Key handlers ------------------------------------------------------
  function pressDigit(digit) {
    if (busy) return;
    setError('');
    if (fresh) {
      setEntry(digit);
      setFresh(false);
      return;
    }
    if (entry.replace(/[-.]/g, '').length >= MAX_DIGITS) return;
    setEntry(entry === '0' ? digit : entry + digit);
  }

  function pressDot() {
    if (busy) return;
    setError('');
    if (fresh) {
      setEntry('0.');
      setFresh(false);
    } else if (!entry.includes('.')) {
      setEntry(`${entry}.`);
    }
  }

  async function pressOperator(symbol) {
    if (busy) return;
    setError('');

    // Operator pressed twice in a row: just swap the operator.
    if (op && fresh) {
      setOp(symbol);
      return;
    }

    // Chaining (10 + 5 +): settle the pending calculation first.
    if (op && stored !== null) {
      const result = await calculate(stored, op, Number(entry));
      if (result === null) return;
      setEntry(formatNumber(result));
      setStored(result);
    } else {
      setStored(Number(entry));
    }
    setOp(symbol);
    setFresh(true);
  }

  async function pressEquals() {
    if (busy || op === null || stored === null) return;
    const result = await calculate(stored, op, Number(entry));
    if (result === null) return; // keep state so the user can fix the input
    setEntry(formatNumber(result));
    setStored(null);
    setOp(null);
    setFresh(true);
  }

  function pressClear() {
    if (busy) return;
    setEntry('0');
    setStored(null);
    setOp(null);
    setFresh(true);
    setError('');
  }

  function pressBackspace() {
    if (busy || fresh) return; // never edit a finished result
    setError('');
    setEntry(entry.length > 1 ? entry.slice(0, -1) : '0');
  }

  function pressPercent() {
    if (busy) return;
    setError('');
    setEntry(formatNumber(Number(entry) / 100));
    setFresh(true);
  }

  function pressSquareRoot() {
    if (busy) return;
    const value = Number(entry);
    if (value < 0) {
      setError('Cannot take the square root of a negative number.');
      return;
    }
    setError('');
    setEntry(formatNumber(Math.sqrt(value)));
    setFresh(true);
  }

  function loadHistoryResult(result) {
    if (busy) return;
    setEntry(formatNumber(result));
    setStored(null);
    setOp(null);
    setFresh(true);
    setError('');
  }

  // ---- Keyboard support --------------------------------------------------
  function handleKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const { key } = event;

    // If a button has keyboard focus, Enter/Space should click that button.
    if (
      event.target instanceof Element &&
      event.target.closest('button') &&
      (key === 'Enter' || key === ' ')
    ) {
      return;
    }

    let handled = true;
    if (/^[0-9]$/.test(key)) pressDigit(key);
    else if (key === '.' || key === ',') pressDot();
    else if (key === '+') pressOperator('+');
    else if (key === '-') pressOperator('−');
    else if (key === '*') pressOperator('×');
    else if (key === '/') pressOperator('÷');
    else if (key === '%') pressPercent();
    else if (key === 'Enter' || key === '=') pressEquals();
    else if (key === 'Backspace') pressBackspace();
    else if (key === 'Escape') pressClear();
    else handled = false;

    if (handled) event.preventDefault();
  }

  // The listener is attached once, but always calls the newest handler,
  // so it never sees stale state.
  const keyHandlerRef = useRef(handleKeyDown);
  useEffect(() => {
    keyHandlerRef.current = handleKeyDown;
  });
  useEffect(() => {
    const listener = (event) => keyHandlerRef.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // ---- Render ------------------------------------------------------------
  const expressionLine = op ? `${formatNumber(stored)} ${op}` : '\u00A0';

  return (
    <main className="app">
      <div className="device">
        <div className="screen">
          <div className="speaker" aria-hidden="true" />

          <div className="display">
            <p className={`display__line${error ? ' is-error' : ''}`} role={error ? 'alert' : undefined}>
              {error || expressionLine}
            </p>
            <p className="display__value" data-size={sizeFor(entry)} role="status">
              {entry}
            </p>
          </div>

          <div className="keypad">
            <Key variant="fn" label="AC" ariaLabel="All clear" onPress={pressClear} />
            <Key
              variant="fn"
              label={
                <>
                  √<span className="key__sub">x</span>
                </>
              }
              ariaLabel="Square root"
              onPress={pressSquareRoot}
            />
            <Key variant="fn" label="%" ariaLabel="Percent" onPress={pressPercent} />
            <Key variant="op" label="÷" ariaLabel="Divide" active={op === '÷'} onPress={() => pressOperator('÷')} />

            <Key variant="digit" label="7" onPress={() => pressDigit('7')} />
            <Key variant="digit" label="8" onPress={() => pressDigit('8')} />
            <Key variant="digit" label="9" onPress={() => pressDigit('9')} />
            <Key variant="op" label="×" ariaLabel="Multiply" active={op === '×'} onPress={() => pressOperator('×')} />

            <Key variant="digit" label="4" onPress={() => pressDigit('4')} />
            <Key variant="digit" label="5" onPress={() => pressDigit('5')} />
            <Key variant="digit" label="6" onPress={() => pressDigit('6')} />
            <Key variant="op" label="−" ariaLabel="Subtract" active={op === '−'} onPress={() => pressOperator('−')} />

            <Key variant="digit" label="1" onPress={() => pressDigit('1')} />
            <Key variant="digit" label="2" onPress={() => pressDigit('2')} />
            <Key variant="digit" label="3" onPress={() => pressDigit('3')} />
            <Key variant="op" label="+" ariaLabel="Add" active={op === '+'} onPress={() => pressOperator('+')} />

            <Key variant="digit" label="0" onPress={() => pressDigit('0')} />
            <Key variant="digit" label="." ariaLabel="Decimal point" onPress={pressDot} />
            <Key variant="digit" label="⌫" ariaLabel="Delete last digit" onPress={pressBackspace} />
            <Key variant="equals" label="=" ariaLabel="Equals" busy={busy} onPress={pressEquals} />
          </div>
        </div>
      </div>

      <History
        status={historyStatus}
        items={history}
        errorMessage={historyError}
        onRetry={retryHistory}
        onUse={loadHistoryResult}
      />
    </main>
  );
}