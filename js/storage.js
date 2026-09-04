/**
 * ==========================================================
 * Lotus AI - Chat History / Conversation Storage
 * ==========================================================
 * Signed-in users: conversations + messages are persisted to
 * Supabase (tables defined in supabase/schema.sql), scoped to
 * the user via RLS.
 *
 * Guests / Supabase failures: falls back to localStorage
 * automatically, so chat history still works with no account
 * and the app never hard-fails just because the network or
 * the database is unavailable.
 *
 * Fires "lotus:conversation-changed" on document whenever the
 * active conversation switches, and "lotus:conversations-updated"
 * whenever the list itself changes — chat.js listens for both.
 * ==========================================================
 */

import { supabase, Auth } from "./auth.js";
import { generateId, formatRelativeDate, escapeHtml, debounce } from "./utils.js";

const LOCAL_KEY = "lotus_conversations_v1";
const ACTIVE_KEY = "lotus_active_conversation";

function loadLocal() {

    try {

        return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];

    } catch {

        return [];
    }
}

function saveLocal(conversations) {

    localStorage.setItem(LOCAL_KEY, JSON.stringify(conversations));
}

const Storage = {

    activeId: null,
    useSupabase: false,

    // ------------------------------------------------------
    // INIT
    // ------------------------------------------------------

    async init() {

        const user = await Auth.getCurrentUser?.().catch(() => null);

        this.useSupabase = Boolean(user);

        this.activeId = localStorage.getItem(ACTIVE_KEY) || null;

        await this.renderSidebar();

        this.bindUI();
    },

    bindUI() {

        const newChatButtons = [
            document.getElementById("new-chat-button"),
            document.getElementById("mobile-new-chat")
        ];

        newChatButtons.forEach(button => {

            if (!button) return;

            button.addEventListener("click", event => {

                event.preventDefault();

                this.startNewConversation();
            });
        });

        const search = document.getElementById("search-chat");

        if (search) {

            search.addEventListener("input", debounce(() => {

                this.renderSidebar(search.value.trim().toLowerCase());

            }, 200));
        }
    },

    // ------------------------------------------------------
    // LIST / LOAD
    // ------------------------------------------------------

    async listConversations() {

        if (this.useSupabase) {

            const user = await Auth.getCurrentUser();

            const { data, error } = await supabase
                .from("conversations")
                .select("id, title, created_at, updated_at")
                .eq("user_id", user.id)
                .order("updated_at", { ascending: false });

            if (error) {

                console.warn("💾 Sohbetler Supabase'den alınamadı, localStorage kullanılıyor:", error);

                this.useSupabase = false;

                return loadLocal();
            }

            return data ?? [];
        }

        return loadLocal().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    },

    async loadMessages(conversationId) {

        if (!conversationId) return [];

        if (this.useSupabase) {

            const { data, error } = await supabase
                .from("messages")
                .select("role, content, created_at")
                .eq("conversation_id", conversationId)
                .order("created_at", { ascending: true });

            if (error) {

                console.warn("💾 Mesajlar alınamadı:", error);

                return [];
            }

            return data ?? [];
        }

        const conversation = loadLocal().find(c => c.id === conversationId);

        return conversation?.messages ?? [];
    },

    // ------------------------------------------------------
    // CREATE / UPDATE
    // ------------------------------------------------------

    async startNewConversation() {

        this.activeId = null;

        localStorage.removeItem(ACTIVE_KEY);

        document.dispatchEvent(new CustomEvent("lotus:conversation-changed", {
            detail: { id: null, messages: [] }
        }));

        await this.renderSidebar();
    },

    async ensureConversation(firstUserMessage) {

        if (this.activeId) return this.activeId;

        const title = firstUserMessage.slice(0, 40) + (firstUserMessage.length > 40 ? "…" : "");

        if (this.useSupabase) {

            const user = await Auth.getCurrentUser();

            const { data, error } = await supabase
                .from("conversations")
                .insert({ user_id: user.id, title })
                .select()
                .single();

            if (!error && data) {

                this.activeId = data.id;

            } else {

                console.warn("💾 Sohbet oluşturulamadı, localStorage kullanılıyor:", error);

                this.useSupabase = false;
            }
        }

        if (!this.useSupabase) {

            const conversations = loadLocal();

            const conversation = {
                id: generateId(),
                title,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                messages: []
            };

            conversations.push(conversation);

            saveLocal(conversations);

            this.activeId = conversation.id;
        }

        localStorage.setItem(ACTIVE_KEY, this.activeId);

        await this.renderSidebar();

        return this.activeId;
    },

    async appendMessage(role, content) {

        const conversationId = await this.ensureConversation(role === "user" ? content : "Lotus AI");

        if (this.useSupabase) {

            const { error } = await supabase
                .from("messages")
                .insert({ conversation_id: conversationId, role, content });

            if (error) console.warn("💾 Mesaj kaydedilemedi:", error);

            await supabase
                .from("conversations")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", conversationId);

        } else {

            const conversations = loadLocal();

            const conversation = conversations.find(c => c.id === conversationId);

            if (conversation) {

                conversation.messages.push({ role, content, created_at: new Date().toISOString() });

                conversation.updated_at = new Date().toISOString();

                saveLocal(conversations);
            }
        }

        return conversationId;
    },

    async deleteConversation(conversationId) {

        if (this.useSupabase) {

            await supabase.from("messages").delete().eq("conversation_id", conversationId);

            await supabase.from("conversations").delete().eq("id", conversationId);

        } else {

            saveLocal(loadLocal().filter(c => c.id !== conversationId));
        }

        if (this.activeId === conversationId) {

            await this.startNewConversation();
        }

        await this.renderSidebar();
    },

    async switchTo(conversationId) {

        this.activeId = conversationId;

        localStorage.setItem(ACTIVE_KEY, conversationId);

        const messages = await this.loadMessages(conversationId);

        document.dispatchEvent(new CustomEvent("lotus:conversation-changed", {
            detail: { id: conversationId, messages }
        }));

        await this.renderSidebar();
    },

    // ------------------------------------------------------
    // SIDEBAR RENDER
    // ------------------------------------------------------

    async renderSidebar(filter = "") {

        const list = document.getElementById("chat-list");

        if (!list) return;

        const conversations = await this.listConversations();

        const filtered = filter
            ? conversations.filter(c => (c.title || "").toLowerCase().includes(filter))
            : conversations;

        if (filtered.length === 0) {

            list.innerHTML = `<div class="chat-list-empty">Henüz sohbet yok.</div>`;

            return;
        }

        list.innerHTML = filtered.map(conversation => `
            <div class="chat-list-item ${conversation.id === this.activeId ? "active" : ""}" data-id="${conversation.id}">
                <div class="chat-list-item-title">${escapeHtml(conversation.title || "Yeni Sohbet")}</div>
                <div class="chat-list-item-date">${formatRelativeDate(conversation.updated_at)}</div>
                <button class="chat-list-item-delete" data-id="${conversation.id}" title="Sil">🗑</button>
            </div>
        `).join("");

        list.querySelectorAll(".chat-list-item").forEach(item => {

            item.addEventListener("click", event => {

                if (event.target.closest(".chat-list-item-delete")) return;

                this.switchTo(item.dataset.id);
            });
        });

        list.querySelectorAll(".chat-list-item-delete").forEach(button => {

            button.addEventListener("click", event => {

                event.stopPropagation();

                if (confirm("Bu sohbeti silmek istediğine emin misin?")) {

                    this.deleteConversation(button.dataset.id);
                }
            });
        });
    }
};

document.addEventListener("DOMContentLoaded", () => Storage.init());

export default Storage;
