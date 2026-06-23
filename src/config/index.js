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
  "gpt-4o": "GPT_4O",
  "gpt-4o": "GPT_4O",
  "gpt-5_3": "GPT_5_3",
  "gpt-5_2": "GPT_5_2",
  "gpt-5_1": "GPT_5_1",
  "gpt-5": "GPT_5",
};

const CLAUDE_NAMES = {
  "claude-4.6-opus": "CLAUDE_4_6_OPUS",
  "claude-4.6-sonnet": "CLAUDE_4_6_SONNET",
  "claude-4.5-haiku": "CLAUDE_4_5_HAIKU",
  "claude-opus-4": "CLAUDE_4_6_OPUS",
  "claude-sonnet-4": "CLAUDE_4_6_SONNET",
  "claude-haiku-3_5": "CLAUDE_4_5_HAIKU",
  "claude-opus-4": "CLAUDE_4_6_OPUS",
  "claude-sonnet-4": "CLAUDE_4_6_SONNET",
  "claude-haiku-3.5": "CLAUDE_4_5_HAIKU",
};

const DEEP_SEEK_NAMES = {
  "openrouter-deepseek-r1": "openrouter_deepseek_r1",
  "openrouter-deepseek-v3": "openrouter_deepseek_v3",

};
const PERPLEXITY_NAME = {
  "sonar-pro": "sonar-pro"
}
const ZENMUX_MODELS = {
  "stepfun-step-3.7-flash-free": "stepfun/step-3.7-flash-free:stepfun",
  "stepfun/step-3.7-flash-free:stepfun": "stepfun/step-3.7-flash-free:stepfun",
};

const ALL_MODELS = { ...GPT_MODELS, ...CLAUDE_NAMES, ...DEEP_SEEK_NAMES, ...PERPLEXITY_NAME, ...ZENMUX_MODELS };

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

  // ZenMux upstream configuration (Anthropic format)
  zenmux: {
    url: process.env.ZENMUX_URL || "https://zenmux.ai/api/anthropic/v1/messages",
    headers: {
      "accept": "*/*",
      "accept-language": "en-US,en;q=0.9,vi;q=0.8",
      "anthropic-version": "2023-06-01",
      "cache-control": "no-cache",
      "content-type": "application/json",
      "origin": "https://zenmux.ai",
      "pragma": "no-cache",
      "priority": "u=1,i",
      "referer": "https://zenmux.ai/platform/chat?chatId=newChat",
      "x-zenmux-accept-processing": "true, true",
      "x-zenmux-apikey-source": "subscription",
      'Cookie':'locale=en-US; ctoken=bigfish_ctoken_1aaaheak8f; receive-cookie-deprecation=1; acw_tc=0a0a01e317821963388012869e787ba7d9b41c4e99d8369ca945cae0a11744; sessionId=88b93030-ef8a-4715-827f-5be19613ac78; sessionId.sig=mOB-7_aK-ZojsmjcOcGy3IRc7c8mvJTAAdJAe89Tv3A; _ga=GA1.1.893583298.1782196339; _gcl_au=1.1.1531246788.1782196339.1357655056.1782197143.1782197149; _vid_t=fXFFnZsySSukgUyfyxeFJ4lKXEWtLFa4jHXhdZ55HJuf0xeYR70iKr/C2C34XUlqVXkIVTeDykAueeHIkQs9f+w1g8dEzzBUr1TVMh8=; ph_phc_Bury9eCEN52fBHZcCPmWqoeJv3PMb4ygHELVpAVqWkqH_posthog=%7B%22%24device_id%22%3A%22019ef32d-fff5-7316-af28-4fa370d87594%22%2C%22distinct_id%22%3A%222626ACEtGDL114907074%22%2C%22%24sesid%22%3A%5B1782197929355%2C%22019ef32e-0035-7b28-a758-8260229182f9%22%2C1782196338739%5D%2C%22%24epp%22%3Atrue%2C%22%24initial_person_info%22%3A%7B%22r%22%3A%22%24direct%22%2C%22u%22%3A%22https%3A%2F%2Fzenmux.ai%2F%22%7D%2C%22%24user_state%22%3A%22identified%22%7D; _ga_PV8J0P36S8=GS2.1.s1782196338$o1$g1$t1782197933$j60$l0$h0'
    },
    getToken: generateRequestToken,
  },

  // Map OpenAI model names → upstream model names
  // ZenMux models are prefixed with zenmux- to indicate they use ZenMux upstream
  modelMap: ALL_MODELS,

  // ZenMux model prefix to identify which models use ZenMux upstream
  zenmuxModelPrefix: "stepfun-",
  zenmuxModelPrefixAlt: "stepfun/",

  defaultModel: "gpt-5.4",
};
