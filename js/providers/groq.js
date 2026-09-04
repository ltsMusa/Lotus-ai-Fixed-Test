console.log("groq.js yüklendi");

import config from "../config.js";
import { fetchWithTimeout } from "../utils.js";
import { ProviderError, classifyHttpStatus } from "./providerError.js";

export default class GroqProvider {

    async sendMessage({ history = [], systemPrompt = "" } = {}) {

        const apiKey = config.providers.groq.apiKey;

        if (!apiKey) {

            throw new ProviderError("Groq API anahtarı ayarlanmamış.", "NO_KEY");
        }

        let response;

        try {

            response = await fetchWithTimeout(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: config.providers.groq.model || "llama-3.3-70b-versatile",
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...history
                        ]
                    })
                },
                15000
            );

        } catch (error) {

            if (error.code === "TIMEOUT") throw new ProviderError("Groq zaman aşımına uğradı.", "TIMEOUT");

            throw new ProviderError("Groq bağlantısı başarısız.", "NETWORK");
        }

        if (!response.ok) {

            const code = classifyHttpStatus(response.status);

            throw new ProviderError(`Groq hatası (${response.status})`, code);
        }

        const data = await response.json();

        const text = data?.choices?.[0]?.message?.content;

        if (!text) throw new ProviderError("Groq boş yanıt döndürdü.", "SERVER");

        return text;
    }
}
