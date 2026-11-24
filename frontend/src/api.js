// api.js — the only file that knows how to talk to the Django backend.
// Keeping network code out of components makes it easy to test and to change later.

// The trailing slash matters: Django's APPEND_SLASH cannot redirect a POST.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api/calc/';

export class ApiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApiError';
  }
}

// Turns any error body the backend might send into one readable sentence.
// Handles {"error": "..."} (your contract) and DRF-style {"field": ["msg"]}.
function extractMessage(data) {
  if (!data) return null;
  if (typeof data === 'string') return data;
  if (typeof data.error === 'string') return data.error;
  const parts = Object.values(data)
    .flat()
    .filter((value) => typeof value === 'string');
  return parts.length ? parts.join(' ') : null;
}

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    // fetch only rejects on network failure or a blocked (CORS) request.
    throw new ApiError(
      'Cannot reach the server. Check that Django is running on 127.0.0.1:8000.',
    );
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Body was empty or not JSON (e.g. an HTML error page). Handled below.
  }

  if (!response.ok) {
    throw new ApiError(extractMessage(data) ?? `Request failed (${response.status}).`);
  }
  return data;
}

/** GET /api/calc/ → array of saved calculations. */
export async function fetchCalculations() {
  const data = await request(API_URL, { method: 'GET', headers: { Accept: 'application/json' } });
  return Array.isArray(data?.calculations) ? data.calculations : [];
}

/** POST /api/calc/ → the saved calculation, including `result`. */
export async function createCalculation({ num1, num2, operant }) {
  const saved = await request(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ num1, num2, operant }),
  });
  if (!Number.isFinite(saved?.result)) {
    throw new ApiError('The server returned an unexpected response.');
  }
  return saved;
}