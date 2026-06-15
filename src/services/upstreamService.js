import axios from "axios";
import config from "../config/index.js";

/**
 * Forward a chat completion request to theoldllm.vercel.app
 * @param {object} body - OpenAI-compatible request body
 * @returns {Promise<object>} - Raw response from upstream (non-stream)
 */
export async function forwardChat(body) {
  const payload = {
    model: body.model,
    messages: body.messages,
    stream: body.stream ?? false,
  };
  console.log("messages",body.messages)
  const { data } = await axios.post(config.upstream.url, payload, {
    headers: {
      "Content-Type": "application/json",
      ...config.upstream.headers,
      "X-Request-Token": config.upstream.getToken(),
    },
    timeout: 120_000,
  });
  console.log("datadata",data)

  return data;
}

/**
 * Forward a chat completion request with streaming enabled
 * Returns an Axios stream for the caller to pipe to the client
 */
export function forwardChatStream(body) {
  const payload = {
    model: body.model,
    messages: body.messages,
    stream: true,
  };
  console.log("messages",body.messages)
  return axios.post(config.upstream.url, payload, {
    headers: {
      "Content-Type": "application/json",
      ...config.upstream.headers,
      "X-Request-Token": config.upstream.getToken(),
    },
    timeout: 120_000,
    responseType: "stream",
  });
}
