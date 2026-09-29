const KEY = "theme";

export function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* Storage can be blocked. The attribute still switches the page. */
  }
  const button = document.querySelector("#theme-toggle");
  if (button) {
    button.setAttribute("aria-pressed", String(next === "dark"));
    button.textContent = next === "dark" ? "Light" : "Dark";
  }
}

export function initTheme() {
  let saved = "";
  try {
    saved = localStorage.getItem(KEY) || "";
  } catch {
    saved = "";
  }
  applyTheme(saved === "dark" ? "dark" : "light");
  document.querySelector("#theme-toggle")?.addEventListener("click", () => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
  });
}
