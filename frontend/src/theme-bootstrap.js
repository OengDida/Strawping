try {
  const savedTheme = window.localStorage.getItem('strawp.theme');
  const theme = savedTheme === 'dark' || savedTheme === 'light'
    ? savedTheme
    : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if (theme === 'dark') document.documentElement.classList.add('dark');
} catch {
  // Theme bootstrap is best-effort when browser storage is unavailable.
}
