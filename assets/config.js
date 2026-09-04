/**
 * ==========================================================
 * Lotus AI - Configuration
 * ==========================================================
 * SECURITY NOTE
 * ----------------------------------------------------------
 * This file is shipped to the browser, so nothing written
 * here as a literal string is ever secret — anyone can open
 * DevTools and read it. That's why provider API keys are NOT
 * hardcoded below. Instead they're entered by the user in
 * Settings → Yapay Zekâ and persisted in localStorage on
 * their own device only.
 *
 * This is still a client-side key model (not a real secret,
 * just "not in source control"). The correct production
 * architecture is a backend proxy that holds the real keys
 * server-side — see /api/chat.js for a Vercel serverless
 * scaffold that does this. Until that proxy is wired up,
 * Lotus AI runs in "bring your own key" mode.
 * ==========================================================
 */

const STORAGE_KEY = "lotus_config_v1";

const DEFAULTS = {
    provider: "groq",
    // Fallback order used by APIManager when the active
    // provider fails, times out, or is rate-limited.
    providerPriority: ["groq", "openrouter", "gemini", "openai"],

    providers: {
        gemini: { apiKey: "", model: "gemini-2.0-flash" },
        groq: { apiKey: "", model: "llama-3.3-70b-versatile" },
        openai: { apiKey: "", model: "gpt-4o-mini" },
        openrouter: { apiKey: "", model: "openai/gpt-4o-mini" }
    },

    voice: {
        sttEnabled: true,
        ttsEnabled: false,
        language: "tr-TR",
        rate: 1
    },

    memoryEnabled: true
};

function loadStoredConfig() {

    try {

        const raw = localStorage.getItem(STORAGE_KEY);

        if (!raw) return {};

        return JSON.parse(raw);

    } catch (error) {

        console.warn("⚙️ Config okunamadı, varsayılanlar kullanılıyor:", error);

        return {};
    }
}

function deepMerge(base, override) {

    const result = { ...base };

    for (const key of Object.keys(override || {})) {

        if (
            override[key] &&
            typeof override[key] === "object" &&
            !Array.isArray(override[key])
        ) {
            result[key] = deepMerge(base[key] || {}, override[key]);
        } else {
            result[key] = override[key];
        }
    }

    return result;
}

const config = deepMerge(DEFAULTS, loadStoredConfig());

function persist() {

    try {

        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

    } catch (error) {

        console.warn("⚙️ Config kaydedilemedi:", error);
    }
}

// ----------------------------------------------------------
// Mutators — always go through these so changes are saved.
// ----------------------------------------------------------

config.setProvider = function (providerName) {

    if (!this.providers[providerName]) return false;

    this.provider = providerName;

    persist();

    return true;
};

config.setProviderKey = function (providerName, apiKey) {

    if (!this.providers[providerName]) return false;

    this.providers[providerName].apiKey = String(apiKey || "").trim();

    persist();

    return true;
};

config.setProviderModel = function (providerName, model) {

    if (!this.providers[providerName]) return false;

    this.providers[providerName].model = String(model || "").trim();

    persist();

    return true;
};

config.setVoice = function (updates = {}) {

    this.voice = { ...this.voice, ...updates };

    persist();
};

config.setMemoryEnabled = function (enabled) {

    this.memoryEnabled = Boolean(enabled);

    persist();
};

// Providers that currently have a usable key, in priority order,
// starting with the actively selected provider.
config.getFallbackOrder = function () {

    const configured = this.providerPriority.filter(
        name => this.providers[name] && this.providers[name].apiKey
    );

    const ordered = [this.provider, ...configured].filter(
        (name, index, arr) =>
            this.providers[name] &&
            this.providers[name].apiKey &&
            arr.indexOf(name) === index
    );

    return ordered;
};

export default config;
