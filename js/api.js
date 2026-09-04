/**
 * ==========================================================
 * Lotus AI - API Manager
 * Version : 3.1
 * Description : Sends messages to AI providers with automatic
 *               fallback, timeout handling, and clear error
 *               classification.
 * ==========================================================
 */
console.log("api.js yüklendi");

import config from "./config.js";
import { buildSystemPrompt } from "./prompts/systemPrompt.js";

import GeminiProvider from "./providers/gemini.js";
import GroqProvider from "./providers/groq.js";
import OpenAIProvider from "./providers/openai.js";
import OpenRouterProvider from "./providers/openrouter.js";

const PROVIDER_LABELS = {
    groq: "Groq",
    gemini: "Gemini",
    openai: "OpenAI",
    openrouter: "OpenRouter"
};

export default class APIManager {

    constructor() {

        this.providers = {
            gemini: new GeminiProvider(),
            groq: new GroqProvider(),
            openai: new OpenAIProvider(),
            openrouter: new OpenRouterProvider()
        };
    }

    /**
     * @param {string} message - the new user message
     * @param {object} options
     * @param {Array<{role:string, content:string}>} [options.history] - prior turns (user/assistant only)
     * @param {string} [options.memoryContext] - formatted memory block (from Memory.formatForAI)
     * @returns {Promise<{ text: string, provider: string|null, error: string|null }>}
     */
    async sendMessage(message, { history = [], memoryContext = "" } = {}) {

        const fallbackOrder = config.getFallbackOrder();

        const systemPrompt = buildSystemPrompt({ memoryContext });

        const fullHistory = [...history, { role: "user", content: message }];

        if (fallbackOrder.length === 0) {

            return {
                text: "Henüz hiçbir yapay zekâ sağlayıcısı için API anahtarı girilmemiş. Ayarlar → Yapay Zekâ bölümünden bir anahtar ekle.",
                provider: null,
                error: "NO_KEY"
            };
        }

        const attemptedErrors = [];

        for (const providerName of fallbackOrder) {

            const provider = this.providers[providerName];

            if (!provider) continue;

            try {

                const text = await provider.sendMessage({ history: fullHistory, systemPrompt });

                return { text, provider: providerName, error: null };

            } catch (error) {

                console.warn(`⚠️ ${PROVIDER_LABELS[providerName] || providerName} başarısız (${error.code || "UNKNOWN"}):`, error.message);

                attemptedErrors.push({ provider: providerName, code: error.code, message: error.message });

                // AUTH errors mean the key itself is bad — still worth
                // trying the next provider, but worth surfacing clearly
                // if every provider ultimately fails.
                continue;
            }
        }

        const lastError = attemptedErrors[attemptedErrors.length - 1];

        const triedLabel = attemptedErrors.map(item => PROVIDER_LABELS[item.provider] || item.provider).join(", ");

        return {
            text: `Denenen tüm sağlayıcılar başarısız oldu (${triedLabel}). Son hata: ${lastError?.message || "bilinmiyor"}`,
            provider: null,
            error: lastError?.code || "UNKNOWN"
        };
    }
}
