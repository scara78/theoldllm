import axios from "axios";
import config from "../config/index.js";
import { openAIToAnthropic } from "../utils/formatConverter.js";

/**
 * Check if model should use ZenMux upstream
 * @param {string} model - Model identifier
 * @returns {boolean} - True if should use ZenMux
 */
export function isZenMuxModel(model) {
  return model?.includes(config.zenmuxModelPrefix) ||
         model?.includes(config.zenmuxModelPrefixAlt) ||
         config.modelMap[model]?.includes("zenmux");
}

/**
 * Check if model should use OVH upstream
 * @param {string} model - Model identifier
 * @returns {boolean} - True if should use OVH
 */
export function isOvhModel(model) {
  return model?.includes(config.ovhModelPrefix) ||
         config.modelMap[model]?.includes("ovh");
}

/**
 * Forward a chat completion request to theoldllm.vercel.app
 * @param {object} body - OpenAI-compatible request body
 * @returns {Promise<object>} - Raw response from upstream (non-stream)
 */
export async function forwardChat(body) {
  const { model, messages, stream, ...rest } = body;
  const upstreamModel = config.modelMap[model] ?? model ?? config.defaultModel;

  const payload = { model: upstreamModel, messages, stream: stream ?? false, ...rest };

  // Check if this is a ZenMux model
  if (isZenMuxModel(model) || isZenMuxModel(upstreamModel)) {
    const zenmuxPayload = openAIToAnthropic({ ...body, model: upstreamModel });

    const { data } = await axios.post(config.zenmux.url, zenmuxPayload, {
      headers: {
        ...config.zenmux.headers,
        "X-Request-Token": config.zenmux.getToken(),
      },
      timeout: 120_000,
    });

    return data;
  }

  // Check if this is an OVH model
  if (isOvhModel(model) || isOvhModel(upstreamModel)) {
    const { data } = await axios.post(config.ovh.url, payload, {
      headers: {
        ...config.ovh.headers,
      },
      timeout: 120_000,
    });

    return data;
  }

  const { data } = await axios.post(config.upstream.url, payload, {
    headers: {
      "Content-Type": "application/json",
      ...config.upstream.headers,
      "X-Request-Token": config.upstream.getToken(),
    },
    timeout: 120_000,
  });

  return data;
}

/**
 * Forward a chat completion request with streaming enabled
 * Returns an Axios stream for the caller to pipe to the client
 */
export function forwardChatStream(body,model2) {
  const { model, messages, stream, ...rest } = body;
  const upstreamModel = config.modelMap[model] ?? model ?? config.defaultModel;
  
  // Check if this is a ZenMux model
  if (isZenMuxModel(model2) || isZenMuxModel(upstreamModel)) {
    const zenmuxPayload = openAIToAnthropic({ ...body, model: upstreamModel });

    return axios.post(config.zenmux.url, zenmuxPayload, {
      headers: {
        ...config.zenmux.headers,
        "X-Request-Token": config.zenmux.getToken(),
      },
      timeout: 20000,
      responseType: "stream",
    });
  }

  // Check if this is an OVH model
  if (isOvhModel(model2) || isOvhModel(upstreamModel)) {
    const payload = { model: upstreamModel, messages, stream: true, ...rest };
    
    return axios.post(config.ovh.url, payload, {
      headers: {
        ...config.ovh.headers,
      },
      timeout: 20000,
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
    timeout: 20000,
    responseType: "stream",
  });
}
