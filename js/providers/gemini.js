console.log("gemini.js yüklendi");

import config from "../config.js";
import { fetchWithTimeout } from "../utils.js";
import { ProviderError, classifyHttpStatus } from "./providerError.js";

export default class GeminiProvider {

    async sendMessage({ history = [], systemPrompt = "" } = {}) {

        const apiKey = config.providers.gemini.apiKey;

        if (!apiKey) {

            throw new ProviderError("Gemini API anahtarı ayarlanmamış.", "NO_KEY");
        }

        const model = config.providers.gemini.model || "gemini-2.0-flash";

        // Gemini uses "model" instead of "assistant", and takes the
        // system prompt as a separate field rather than a message.
        const contents = history.map(message => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }]
        }));

        let response;

        try {

            response = await fetchWithTimeout(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: systemPrompt }] },
                        contents
                    })
                },
                15000
            );

        } catch (error) {

            if (error.code === "TIMEOUT") throw new ProviderError("Gemini zaman aşımına uğradı.", "TIMEOUT");

            throw new ProviderError("Gemini bağlantısı başarısız.", "NETWORK");
        }

        if (!response.ok) {

            const code = classifyHttpStatus(response.status);

            throw new ProviderError(`Gemini hatası (${response.status})`, code);
        }

        const data = await response.json();

        const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text).join("");

        if (!text) throw new ProviderError("Gemini boş yanıt döndürdü.", "SERVER");

        return text;
    }
}
