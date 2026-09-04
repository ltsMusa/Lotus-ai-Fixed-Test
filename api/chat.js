/**
 * ==========================================================
 * Lotus AI - Backend Proxy (Vercel Serverless Function)
 * ==========================================================
 * This is the "doğru mimari" from the audit report:
 *
 *   Lotus AI Client → Lotus Backend → Provider → Groq/Gemini/...
 *
 * Right now the app calls provider APIs directly from the
 * browser with a key the user pastes into Settings — that
 * works, but the key lives in the user's own localStorage and
 * every user needs their own key. It is NOT a shared backend
 * secret.
 *
 * This file is the next step: deploy it on Vercel, set real
 * provider keys as Vercel Environment Variables (never in
 * source), and the frontend can call POST /api/chat instead of
 * calling providers directly — so ONE shared key lives only on
 * the server and is never shipped to the browser.
 *
 * NOT wired into the frontend yet (js/providers/*.js still call
 * providers directly) — flipping that over is a deliberate,
 * separate step so you can test this endpoint on its own first.
 *
 * DEPLOY:
 *   1. vercel env add GROQ_API_KEY
 *   2. vercel env add GEMINI_API_KEY   (optional)
 *   3. vercel env add OPENAI_API_KEY   (optional)
 *   4. vercel env add OPENROUTER_API_KEY (optional)
 *   5. vercel deploy
 *
 * To switch the frontend over later: in js/providers/groq.js
 * (etc.), replace the direct fetch() to api.groq.com with a
 * fetch() to "/api/chat" and drop the apiKey from the request
 * body entirely — the server attaches it instead.
 * ==========================================================
 */

const PROVIDER_ENDPOINTS = {
    groq: {
        url: "https://api.groq.com/openai/v1/chat/completions",
        envKey: "GROQ_API_KEY",
        defaultModel: "llama-3.3-70b-versatile",
        buildBody: (messages, model) => ({ model, messages })
    },
    openai: {
        url: "https://api.openai.com/v1/chat/completions",
        envKey: "OPENAI_API_KEY",
        defaultModel: "gpt-4o-mini",
        buildBody: (messages, model) => ({ model, messages })
    },
    openrouter: {
        url: "https://openrouter.ai/api/v1/chat/completions",
        envKey: "OPENROUTER_API_KEY",
        defaultModel: "openai/gpt-4o-mini",
        buildBody: (messages, model) => ({ model, messages })
    }
};

// Very small in-memory rate limiter. Resets on cold start, so
// it's a speed bump against casual abuse, not a real limiter —
// for production, back this with Vercel KV / Upstash Redis
// keyed by IP or user id.
const requestLog = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

function isRateLimited(clientId) {

    const now = Date.now();

    const timestamps = (requestLog.get(clientId) || []).filter(
        ts => now - ts < RATE_LIMIT_WINDOW_MS
    );

    timestamps.push(now);

    requestLog.set(clientId, timestamps);

    return timestamps.length > RATE_LIMIT_MAX;
}

export default async function handler(req, res) {

    if (req.method !== "POST") {

        res.status(405).json({ error: "Yalnızca POST destekleniyor." });

        return;
    }

    const clientId = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";

    if (isRateLimited(clientId)) {

        res.status(429).json({ error: "Çok fazla istek. Lütfen biraz bekleyip tekrar dene." });

        return;
    }

    const { provider = "groq", messages, model } = req.body || {};

    const providerConfig = PROVIDER_ENDPOINTS[provider];

    if (!providerConfig) {

        res.status(400).json({ error: `Bilinmeyen sağlayıcı: ${provider}` });

        return;
    }

    if (!Array.isArray(messages) || messages.length === 0) {

        res.status(400).json({ error: "'messages' dizisi gerekli." });

        return;
    }

    const apiKey = process.env[providerConfig.envKey];

    if (!apiKey) {

        res.status(500).json({
            error: `Sunucuda ${providerConfig.envKey} tanımlı değil. Vercel proje ayarlarından ekle.`
        });

        return;
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {

        const upstreamResponse = await fetch(providerConfig.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify(
                providerConfig.buildBody(messages, model || providerConfig.defaultModel)
            ),
            signal: controller.signal
        });

        const data = await upstreamResponse.json();

        if (!upstreamResponse.ok) {

            // Never forward the raw upstream error body to the client —
            // it can leak account/billing details tied to the server's
            // own key. Sanitize down to a status + generic message.
            res.status(upstreamResponse.status).json({
                error: `Sağlayıcı hatası (${upstreamResponse.status}).`
            });

            return;
        }

        res.status(200).json({ text: data?.choices?.[0]?.message?.content ?? "" });

    } catch (error) {

        if (error.name === "AbortError") {

            res.status(504).json({ error: "İstek zaman aşımına uğradı." });

            return;
        }

        console.error("Lotus backend proxy error:", error);

        res.status(500).json({ error: "Sunucu hatası." });

    } finally {

        clearTimeout(timeout);
    }
}
