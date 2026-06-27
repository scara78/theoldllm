import axios from "axios";
import config from "../config/index.js";

const UPSTREAM_TIMEOUT = 120000;
const STREAM_TIMEOUT = 180000;

async function withRetry(fn, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isTimeout = err.code === "ECONNABORTED" || err.message?.includes("timeout");
      const isRetryable = isTimeout || err.response?.status >= 500;
      if (!isRetryable || i === retries) break;
      console.warn(`Retry ${i + 1}/${retries} after error: ${err.message}`);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

function parseTheOldLlmSSE(raw) {
  if (typeof raw !== "string") return raw;

  try {
    const parsed = JSON.parse(raw);
    return parsed?.choices?.[0]?.message?.content ?? parsed?.response ?? parsed?.content ?? raw;
  } catch {
    // It's SSE — parse it
  }

  let fullText = "";
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "data: [DONE]" || trimmed.startsWith(":")) continue;
    if (trimmed.startsWith("data: ")) {
      const dataStr = trimmed.slice(6);
      try {
        const parsed = JSON.parse(dataStr);
        const chunk =
          parsed?.choices?.[0]?.delta?.content ??
          parsed?.response ??
          parsed?.content ??
          "";
        fullText += chunk;
      } catch {
        fullText += dataStr;
      }
    }
  }
  return fullText;
}

export async function forwardChat(body) {
  const { model, messages, stream, ...rest } = body;
  const upstreamModel = config.modelMap[model] ?? model ?? config.defaultModel;
  const payload = { model: upstreamModel, messages, stream: false, ...rest };

  return withRetry(async () => {
    const { data } = await axios.post(config.upstream.url, payload, {
      headers: {
        "Content-Type": "application/json",
        ...config.upstream.headers,
        "X-Request-Token": config.upstream.getToken(),
      },
      timeout: UPSTREAM_TIMEOUT,
      responseType: "text",
    });
    return parseTheOldLlmSSE(data);
  });
}

export function forwardChatStream(body) {
  const { model, messages, stream, ...rest } = body;
  const upstreamModel = config.modelMap[model] ?? model ?? config.defaultModel;
  const payload = { model: upstreamModel, messages, stream: true, ...rest };

  return axios.post(config.upstream.url, payload, {
    headers: {
      "Content-Type": "application/json",
      ...config.upstream.headers,
      "X-Request-Token": config.upstream.getToken(),
    },
    timeout: STREAM_TIMEOUT,
    responseType: "stream",
  });
}