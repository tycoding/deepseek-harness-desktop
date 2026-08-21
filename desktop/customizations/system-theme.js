(() => {
  let dark = false

  const apply = () => {
    const scheme = dark ? 'dark' : 'light'
    if (document.documentElement.style.colorScheme !== scheme) {
      document.documentElement.style.colorScheme = scheme
    }
    if (document.body.hasAttribute('data-ds-dark-theme') !== dark) {
      document.body.toggleAttribute('data-ds-dark-theme', dark)
    }
  }

  const observer = new MutationObserver(apply)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })

  globalThis.__dshDesktopSetSystemTheme = (nextDark) => {
    dark = nextDark
    apply()
  }
})()
