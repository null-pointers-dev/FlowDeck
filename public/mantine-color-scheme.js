try {
  var storedColorScheme = window.localStorage.getItem("mantine-color-scheme-value");
  var colorScheme = ["light", "dark", "auto"].includes(storedColorScheme) ? storedColorScheme : "auto";
  var computedColorScheme = colorScheme !== "auto"
    ? colorScheme
    : window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  document.documentElement.setAttribute("data-mantine-color-scheme", computedColorScheme);
} catch {}