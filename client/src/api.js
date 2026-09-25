const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const getUrl = (path) => `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;

export async function request(path, options = {}) {
  const { headers: optionHeaders, ...fetchOptions } = options;
  const response = await fetch(getUrl(path), {
    credentials: "include",
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...(optionHeaders || {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || "Request failed");
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function streamRequest(path, body, onEvent, signal, idempotencyKey) {
  const response = await fetch(getUrl(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody.message || "Request failed");
    error.status = response.status;
    throw error;
  }
  if (!response.body) throw new Error("Streaming is not supported by this browser");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const events = buffer.replace(/\r\n/g, "\n").split("\n\n");
      buffer = events.pop() || "";
      for (const rawEvent of events) {
        const eventName = rawEvent.match(/^event: (.+)$/m)?.[1] || "message";
        const data = rawEvent.match(/^data: (.+)$/m)?.[1];
        if (!data) continue;
        const parsed = JSON.parse(data);
        if (eventName === "done") completed = true;
        onEvent(eventName, parsed);
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!completed) throw new Error("The response ended before Orbit completed.");
}
