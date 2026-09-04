/**
 * ==========================================================
 * Lotus AI - Chat Manager
 * Version : 3.1
 * Description : Handles chat, messages and conversations.
 * ==========================================================
 */
console.log("chat.js yüklendi");

import CommandManager from "./commands.js";
import APIManager from "./api.js";
import Storage from "./storage.js";
import Memory from "./memory.js";
import Speech from "./speech.js";
import config from "./config.js";
import { escapeHtml } from "./utils.js";
import { renderMarkdown, bindCodeCopyButtons } from "./markdown.js";

export default class ChatManager {

    constructor() {

        this.commandManager = new CommandManager();
        this.apiManager = new APIManager();

        this.chat = null;
        this.input = null;
        this.sendButton = null;

        // { role: "user" | "assistant", content: string } — sent to the
        // API as conversation history. Rebuilt whenever the active
        // conversation switches (see lotus:conversation-changed).
        this.messages = [];
        this.isTyping = false;
        this.typingElement = null;

        this.init();
    }

    init() {

        this.cacheElements();
        this.bindEvents();

        document.addEventListener("lotus:conversation-changed", event => {

            this.loadFromHistory(event.detail?.messages ?? []);
        });

        console.log("✅ ChatManager initialized.");
    }

    cacheElements() {

        this.chat = document.getElementById("chat");
        this.input = document.getElementById("message-input");
        this.sendButton = document.getElementById("send-button");
    }

    bindEvents() {

        this.sendButton.addEventListener("click", () => {

            this.sendMessage();
        });

        this.input.addEventListener("keydown", event => {

            if (event.key === "Enter" && !event.shiftKey) {

                event.preventDefault();

                this.sendMessage();
            }
        });
    }

    // ------------------------------------------------------
    // LOAD AN EXISTING CONVERSATION INTO THE CHAT VIEW
    // ------------------------------------------------------

    loadFromHistory(storedMessages) {

        this.chat.innerHTML = "";

        this.messages = [];

        storedMessages.forEach(message => {

            if (message.role === "user") {

                this.addUserMessage(message.content, { save: false });

            } else if (message.role === "assistant") {

                this.addAIMessage(message.content, { save: false, speak: false });
            }
        });

        this.scrollToBottom();
    }

    // ------------------------------------------------------
    // SEND
    // ------------------------------------------------------

    sendMessage() {

        const text = this.input.value.trim();

        if (!text || this.isTyping) return;

        this.addUserMessage(text);

        this.clearInput();

        this.scrollToBottom();

        this.processMessage(text);
    }

    addUserMessage(text, { save = true } = {}) {

        const message = document.createElement("div");

        message.className = "message user-message";

        message.innerHTML = `
            <div class="message-content">${escapeHtml(text)}</div>
        `;

        this.chat.appendChild(message);

        this.messages.push({ role: "user", content: text });

        if (save) Storage.appendMessage("user", text);
    }

    addAIMessage(text, { save = true, speak = true, isError = false } = {}) {

        const message = document.createElement("div");

        message.className = "message ai-message" + (isError ? " error-message" : "");

        const bodyHtml = isError ? `<p>${escapeHtml(text)}</p>` : renderMarkdown(text);

        message.innerHTML = `<div class="message-content">${bodyHtml}</div>`;

        if (isError) {

            const retryButton = document.createElement("button");

            retryButton.className = "message-retry-button";
            retryButton.textContent = "Tekrar dene";

            retryButton.addEventListener("click", () => {

                const lastUser = [...this.messages].reverse().find(m => m.role === "user");

                if (lastUser) this.processMessage(lastUser.content);
            });

            message.querySelector(".message-content").appendChild(retryButton);
        }

        this.chat.appendChild(message);

        bindCodeCopyButtons(message);

        this.scrollToBottom();

        if (!isError) {

            this.messages.push({ role: "assistant", content: text });

            if (save) Storage.appendMessage("assistant", text);

            if (speak) Speech.speak(text);
        }
    }

    showTyping() {

        if (this.typingElement) return;

        this.isTyping = true;

        const typing = document.createElement("div");

        typing.className = "message ai-message typing-message";

        typing.innerHTML = `
            <div class="message-content">Lotus düşünüyor...</div>
        `;

        this.chat.appendChild(typing);

        this.typingElement = typing;

        this.scrollToBottom();
    }

    hideTyping() {

        this.isTyping = false;

        if (!this.typingElement) return;

        this.typingElement.remove();

        this.typingElement = null;
    }

    clearInput() {

        this.input.value = "";
    }

    scrollToBottom() {

        this.chat.scrollTop = this.chat.scrollHeight;
    }

    // ------------------------------------------------------
    // PROCESS A MESSAGE: local commands first, then AI
    // ------------------------------------------------------

    async processMessage(text) {

        this.showTyping();

        const commandResponse = this.commandManager.handleCommand(text);

        if (commandResponse) {

            await new Promise(resolve => setTimeout(resolve, 400));

            this.hideTyping();

            this.addAIMessage(commandResponse);

            return;
        }

        let memoryContext = "";

        if (config.memoryEnabled) {

            try {

                const memories = await Memory.getMemories({ limit: 20 });

                memoryContext = Memory.formatForAI(memories);

            } catch (error) {

                console.warn("🧠 Hafıza bağlamı alınamadı:", error);
            }
        }

        // History sent to the API excludes the message just added by
        // addUserMessage (it's passed separately), so slice it off.
        const historyForApi = this.messages.slice(0, -1);

        try {

            const result = await this.apiManager.sendMessage(text, {
                history: historyForApi,
                memoryContext
            });

            this.hideTyping();

            if (result.error) {

                this.addAIMessage(result.text, { isError: true });

            } else {

                this.addAIMessage(result.text);
            }

        } catch (error) {

            console.error("💥 Beklenmeyen sohbet hatası:", error);

            this.hideTyping();

            this.addAIMessage("Beklenmeyen bir hata oluştu. Lütfen tekrar dene.", { isError: true });
        }
    }
}

const chatManager = new ChatManager();
