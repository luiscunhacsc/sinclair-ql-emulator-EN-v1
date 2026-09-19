// One browser request per message. No resubmission after a timeout or restart:
// the upstream request may already have consumed Free quota.
export async function requestChatReply({ token, session, message, signal,
  fetchImpl = fetch, timeoutMs = 55_000,
}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  let body;
  try {
    response = await fetchImpl("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ session, message }), signal: requestSignal,
    });
    body = await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new Error("LOCAL SERVER TIMEOUT. The request was cancelled. Check npm start. No automatic retry was made.");
    if (response) throw new Error(`LOCAL SERVER ERROR (HTTP ${response.status}). Invalid or interrupted reply. Check npm start. No automatic retry was made.`);
    throw new Error("LOCAL SERVER DISCONNECTED. Check that npm start is running. If restarted, reopen QL Chat. No automatic retry was made.");
  }
  if (!response.ok) {
    if (body?.code === "HOST_SESSION_EXPIRED") {
      throw new Error("LOCAL SESSION EXPIRED. The server restarted. Reopen QL Chat to reconnect. This message was not sent to Gemini.");
    }
    throw new Error(typeof body?.error === "string" ? body.error : `LOCAL SERVER ERROR (HTTP ${response.status}). No automatic retry was made.`);
  }
  if (typeof body?.answer !== "string" || !body.answer.trim()) {
    throw new Error("LOCAL SERVER ERROR. No displayable reply received. No automatic retry was made.");
  }
  return body.answer;
}
