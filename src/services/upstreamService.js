import axios from "axios";
import config from "../config/index.js";
import { openAIToAnthropic } from "../utils/formatConverter.js";

export function isZenMuxModel(model) {
  return model?.includes(config.zenmuxModelPrefix) ||
         model?.includes(config.zenmuxModelPrefixAlt) ||
         config.modelMap[model]?.includes("zenmux");
}

export function isOvhModel(model) {
  return model?.includes(config.ovhModelPrefix) ||
         config.modelMap[model]?.includes("ovh");
}

const UPSTREAM_TIMEOUT = 120000; // 120s
const STREAM_TIMEOUT = 180000;   // 180s

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

export async function forwardChat(body, model2) {
  const { model, messages, stream, ...rest } = body;
  const upstreamModel = config.modelMap[model] ?? model ?? config.defaultModel;
  const payload = { model: upstreamModel, messages, stream: false, ...rest };

  if (isZenMuxModel(model2) || isZenMuxModel(upstreamModel)) {
    const zenmuxPayload = openAIToAnthropic({ ...body, model: upstreamModel });
    return withRetry(async () => {
      const { data } = await axios.post(config.zenmux.url, zenmuxPayload, {
        headers: { ...config.zenmux.headers, "X-Request-Token": config.zenmux.getToken() },
        timeout: UPSTREAM_TIMEOUT,
      });
      return data;
    });
  }

  if (isOvhModel(model2) || isOvhModel(upstreamModel)) {
    return withRetry(async () => {
      const { data } = await axios.post(config.ovh.url, payload, {
        headers: { ...config.ovh.headers },
        timeout: UPSTREAM_TIMEOUT,
      });
      return data;
    });
  }

  return withRetry(async () => {
    const { data } = await axios.post(config.upstream.url, payload, {
      headers: {
        "Content-Type": "application/json",
        ...config.upstream.headers,
        "X-Request-Token": config.upstream.getToken(),
      },
      timeout: UPSTREAM_TIMEOUT,
    });
    return data;
  });
}

export function forwardChatStream(body, model2) {
  const { model, messages, stream, ...rest } = body;
  const upstreamModel = config.modelMap[model] ?? model ?? config.defaultModel;

  if (isZenMuxModel(model2) || isZenMuxModel(upstreamModel)) {
    const zenmuxPayload = openAIToAnthropic({ ...body, model: upstreamModel });
    return axios.post(config.zenmux.url, zenmuxPayload, {
      headers: { ...config.zenmux.headers, "X-Request-Token": config.zenmux.getToken() },
      timeout: STREAM_TIMEOUT,
      responseType: "stream",
    });
  }

  if (isOvhModel(model2) || isOvhModel(upstreamModel)) {
    const payload = { model: upstreamModel, messages, stream: true, ...rest };
    return axios.post(config.ovh.url, payload, {
      headers: { ...config.ovh.headers },
      timeout: STREAM_TIMEOUT,
      responseType: "stream",
    });
  }

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