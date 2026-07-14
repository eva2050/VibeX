function createTimeoutSignal(timeoutMs = 15000) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  if (typeof AbortController === 'undefined') return undefined;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const signal = options.signal || createTimeoutSignal(timeoutMs);
  return fetch(url, {
    ...options,
    ...(signal ? { signal } : {})
  });
}

async function fetchWithTimeoutError(url, options = {}, timeoutMs = 15000, timeoutMessage = '请求超时，请稍后重试') {
  try {
    return await fetchWithTimeout(url, options, timeoutMs);
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      const timeoutError = new Error(timeoutMessage);
      timeoutError.type = 'TIMEOUT';
      throw timeoutError;
    }
    throw error;
  }
}

export { createTimeoutSignal, fetchWithTimeout, fetchWithTimeoutError };
