import dotenv from "dotenv";
dotenv.config();

function generateRequestToken() {
  const n = Date.now();
  const e = `${n}-oldllm-client-2026-Mozilla/5.0`;
  let t = 0;
  for (let i = 0; i < e.length; i++) {
    const s = e.charCodeAt(i);
    t = (t << 5) - t + s;
    t = t & t;
  }
  const r = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${n.toString(36)}-${Math.abs(t).toString(36)}-${r}`;
}

const GPT_MODELS = {
  "gpt-5.4": "GPT_5_4",
  "gpt-5.3": "GPT_5_3",
  "gpt-5.2": "GPT_5_2",
  "gpt-5.1": "GPT_5_1",
  "gpt-5": "GPT_5",
  "gpt-5_4": "GPT_5_4",
  "gpt-5_3": "GPT_5_3",
  "gpt-5_2": "GPT_5_2",
  "gpt-5_1": "GPT_5_1",
  "gpt-4o": "GPT_5_4",
};

const CLAUDE_NAMES = {
  "claude-4.6-opus": "CLAUDE_4_6_OPUS",
  "claude-4.6-sonnet": "CLAUDE_4_6_SONNET",
  "claude-4.5-haiku": "CLAUDE_4_5_HAIKU",
  "claude-opus-4": "CLAUDE_4_6_OPUS",
  "claude-sonnet-4": "CLAUDE_4_6_SONNET",
  "claude-haiku-3_5": "CLAUDE_4_5_HAIKU",
  "claude-haiku-3.5": "CLAUDE_4_5_HAIKU",
};

const DEEP_SEEK_NAMES = {
  "openrouter-deepseek-r1": "openrouter_deepseek_r1",
  "openrouter-deepseek-v3": "openrouter_deepseek_v3",
};

const PERPLEXITY_NAME = {
  "sonar-pro": "sonar-pro",
};

const ALL_MODELS = { ...GPT_MODELS, ...CLAUDE_NAMES, ...DEEP_SEEK_NAMES, ...PERPLEXITY_NAME };

export function getModelsList() {
  return Object.keys(ALL_MODELS).map((id) => ({
    id,
    object: "model",
    created: 1700000000,
    owned_by: "organization",
  }));
}

export default {
  port: process.env.PORT || 5678,

  upstream: {
    url: process.env.UPSTREAM_URL,
    headers: {
      "X-Client-Version": process.env.X_CLIENT_VERSION,
      "User-Agent": process.env.USER_AGENT,
    },
    getToken: generateRequestToken,
  },

  modelMap: ALL_MODELS,
  defaultModel: "gpt-5.4",
};