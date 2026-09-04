/**
 * ==========================================================
 * Lotus AI - Theme Manager
 * ==========================================================
 */

const STORAGE_KEY = "lotus_theme";

const THEMES = ["neon", "light"];

const Themes = {

    current: "neon",

    init() {

        const stored = localStorage.getItem(STORAGE_KEY);

        this.apply(THEMES.includes(stored) ? stored : "neon");

        const themeButton = document.getElementById("theme-button");

        if (themeButton) {

            themeButton.addEventListener("click", event => {

                event.preventDefault();

                this.toggle();
            });
        }
    },

    apply(theme) {

        this.current = theme;

        document.documentElement.setAttribute("data-theme", theme);

        localStorage.setItem(STORAGE_KEY, theme);
    },

    toggle() {

        const next = this.current === "neon" ? "light" : "neon";

        this.apply(next);
    }
};

document.addEventListener("DOMContentLoaded", () => Themes.init());

export default Themes;
