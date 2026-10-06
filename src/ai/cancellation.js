export function abortError() {
  const error = new Error("The local AI request was cancelled.");
  error.name = "AbortError";
  return error;
}

// Providers may not reject promptly themselves. Race the signal too, and always
// unregister listeners when a successful request no longer needs cancellation.
export function abortable(promise, signal) {
  if (!signal) return Promise.resolve(promise);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => { cleanup(); reject(abortError()); };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

export function waitFor(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(abortError()); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => { cleanup(); resolve(); }, milliseconds);
  });
}
