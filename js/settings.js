/**
 * ==========================================================
 * Lotus AI - Settings Panels
 * ==========================================================
 * The settings modal previously had a static menu list
 * (account / personalization / ai / appearance / chat / voice
 * / about) where every item except "Hesap" did nothing when
 * clicked — the HTML comment above it literally said
 * "Şimdilik gizli. İleride UI ile bağlanacak." ("hidden for
 * now, will be wired up later"). "Hesap" is wired by auth.js;
 * this file wires the rest.
 *
 * Each panel replaces #settings-content in place and offers a
 * "← Geri" button that restores the original menu.
 * ==========================================================
 */

import config from "./config.js";
import Memory from "./memory.js";
import Themes from "./themes.js";

const PROVIDER_NAMES = {
    groq: "Groq",
    gemini: "Gemini",
    openai: "OpenAI",
    openrouter: "OpenRouter"
};

function panelShell(title, bodyHtml) {

    return `
        <div class="settings-panel">
            <button class="settings-back-button" type="button">← Geri</button>
            <h3 class="settings-panel-title">${title}</h3>
            ${bodyHtml}
        </div>
    `;
}

function renderAIPanel() {

    const providerOptions = Object.keys(PROVIDER_NAMES)
        .map(key => `<option value="${key}" ${config.provider === key ? "selected" : ""}>${PROVIDER_NAMES[key]}</option>`)
        .join("");

    const keyInputs = Object.keys(PROVIDER_NAMES).map(key => `
        <label class="settings-field">
            <span>${PROVIDER_NAMES[key]} API Anahtarı</span>
            <input type="password" data-provider-key="${key}" value="${config.providers[key].apiKey}" placeholder="sk-...">
        </label>
    `).join("");

    return panelShell("Yapay Zekâ", `
        <label class="settings-field">
            <span>Aktif Sağlayıcı</span>
            <select id="settings-provider-select">${providerOptions}</select>
        </label>

        <p class="settings-note">
            Anahtarlar sadece bu cihazda, tarayıcının yerel deposunda tutulur —
            hiçbir sunucuya gönderilmez. Bir sağlayıcı başarısız olursa
            (limit, hata, zaman aşımı) Lotus AI otomatik olarak anahtarı
            girilmiş bir sonraki sağlayıcıya geçer.
        </p>

        ${keyInputs}
    `);
}

function renderVoicePanel() {

    return panelShell("Ses", `
        <label class="settings-field settings-field-row">
            <span>Sesle yazma (mikrofon)</span>
            <input type="checkbox" id="settings-stt-toggle" ${config.voice.sttEnabled ? "checked" : ""}>
        </label>

        <label class="settings-field settings-field-row">
            <span>Cevapları sesli oku</span>
            <input type="checkbox" id="settings-tts-toggle" ${config.voice.ttsEnabled ? "checked" : ""}>
        </label>
    `);
}

function renderAppearancePanel() {

    return panelShell("Görünüm", `
        <label class="settings-field settings-field-row">
            <span>Tema</span>
            <button id="settings-theme-toggle" class="settings-inline-button" type="button">
                ${Themes.current === "neon" ? "🌸 Neon (aktif)" : "☀️ Açık (aktif)"}
            </button>
        </label>
    `);
}

function renderChatPanel() {

    return panelShell("Sohbet", `
        <label class="settings-field settings-field-row">
            <span>Hafızayı sohbetlerde kullan</span>
            <input type="checkbox" id="settings-memory-toggle" ${config.memoryEnabled ? "checked" : ""}>
        </label>

        <button id="settings-clear-memory-button" class="settings-inline-button danger" type="button">
            🧠 Tüm hafızayı sil
        </button>
    `);
}

function renderPersonalizationPanel() {

    return panelShell("Kişiselleştirme", `
        <p class="settings-note">
            Hafızanı buradan değil, sol menüdeki 🧠 Hafıza bölümünden
            görüntüleyip yönetebilirsin.
        </p>
    `);
}

function renderAboutPanel() {

    return panelShell("Hakkında", `
        <p class="settings-note">Lotus AI — Düşün. Üret. Geliş. 🌸</p>
    `);
}

const PANEL_RENDERERS = {
    ai: renderAIPanel,
    voice: renderVoicePanel,
    appearance: renderAppearancePanel,
    chat: renderChatPanel,
    personalization: renderPersonalizationPanel,
    about: renderAboutPanel
};

function bindPanelEvents(container, key) {

    container.querySelector(".settings-back-button")?.addEventListener("click", () => {

        renderMenu(container);
    });

    if (key === "ai") {

        container.querySelector("#settings-provider-select")?.addEventListener("change", event => {

            config.setProvider(event.target.value);
        });

        container.querySelectorAll("[data-provider-key]").forEach(input => {

            input.addEventListener("change", () => {

                config.setProviderKey(input.dataset.providerKey, input.value);
            });
        });
    }

    if (key === "voice") {

        container.querySelector("#settings-stt-toggle")?.addEventListener("change", event => {

            config.setVoice({ sttEnabled: event.target.checked });
        });

        container.querySelector("#settings-tts-toggle")?.addEventListener("change", event => {

            config.setVoice({ ttsEnabled: event.target.checked });
        });
    }

    if (key === "appearance") {

        container.querySelector("#settings-theme-toggle")?.addEventListener("click", () => {

            Themes.toggle();

            renderPanel(container, "appearance");
        });
    }

    if (key === "chat") {

        container.querySelector("#settings-memory-toggle")?.addEventListener("change", event => {

            config.setMemoryEnabled(event.target.checked);
        });

        container.querySelector("#settings-clear-memory-button")?.addEventListener("click", async () => {

            if (!confirm("Tüm hafızanı silmek istediğine emin misin? Bu işlem geri alınamaz.")) return;

            const result = await Memory.clearAll();

            alert(result.success ? "Hafıza temizlendi." : `Hafıza temizlenemedi: ${result.error}`);
        });
    }
}

function renderPanel(container, key) {

    const renderer = PANEL_RENDERERS[key];

    if (!renderer) return;

    container.innerHTML = renderer();

    bindPanelEvents(container, key);
}

let originalMenuHtml = null;

function renderMenu(container) {

    if (originalMenuHtml) container.innerHTML = originalMenuHtml;

    bindMenuClicks(container);
}

function bindMenuClicks(container) {

    container.querySelectorAll(".settings-item").forEach(item => {

        const key = item.dataset.setting;

        if (key === "account" || !PANEL_RENDERERS[key]) return;

        item.addEventListener("click", event => {

            event.preventDefault();
            event.stopPropagation();

            renderPanel(container, key);
        });
    });
}

document.addEventListener("DOMContentLoaded", () => {

    const container = document.getElementById("settings-content");

    if (!container) return;

    originalMenuHtml = container.innerHTML;

    bindMenuClicks(container);
});
