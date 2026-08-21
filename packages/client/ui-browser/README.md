# @deepseek-ai/dsh-client-ui-browser

English | [中文](README.zh.md)

Reference for the docked browser plugin. The package adds an icon-only **Open tools panel** action at the right edge of each live Session header and opens a browser in the application's rightmost utility column. The panel occupies layout width instead of covering the conversation, closes the mutually exclusive Session details column, and disappears when no Session is current. Its generic panel icon names the shared utility area rather than the browser tool it currently contains.

The browser keeps multiple tabs mounted in one transient shared store. Each tab is blank, a normalized `http:` or `https:` URL, or a local `.html`/`.htm` file selected through the browser file picker. HTTP(S) links clicked in the application open as browser tabs. In the packaged desktop application, opening a produced HTML file reads it through the isolated desktop bridge and opens it in the panel; other file types retain the operating system's normal open behavior. Selecting another tab hides the previous frame without reloading it; Reload increments only the active tab's frame revision. Closing the final tab immediately creates a blank replacement.

Remote addresses without a scheme receive `https://`. Other schemes and the application's own origin are rejected. Remote pages and local HTML run in sandboxed iframes with scripts, forms, and modal dialogs enabled but without same-origin access; the plugin does not grant Node.js or Electron APIs to page content. **Open in system browser** is available only for remote web tabs and follows the desktop host's external-navigation policy.

Local HTML uses a renderer-lifetime object URL. The desktop bridge accepts only absolute `.html` and `.htm` paths, limits files to 10 MB, and returns text without exposing Electron or Node.js to the application page. Replacing or closing a local tab releases its URL, and plugin teardown releases every remaining local URL. The store is deliberately not persisted because these URLs are invalid after a renderer restart.

The client plugin waits for the Session-scoped `conversation.session.header.utilities` and `shell.utility-panel` declarations through the slot registry, then registers one entry in each with the same store handle. Its client service routes link and produced-HTML requests into that store, so the trigger, panel, and conversation file opener share per-Session open state, tab order, selection, and navigation without importing owning components.

## Model Experience

None, as the browser is a local viewing surface; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Some websites refuse iframe embedding** — sites that send `X-Frame-Options` or restrictive `frame-ancestors` policy may show a blank or refusal page; use **Open in system browser** for those sites.
- **Local HTML is single-file oriented** — relative images, stylesheets, scripts, and sibling documents cannot be resolved from the temporary object URL; self-contained HTML works normally.
- **Embedded navigation is opaque across origins** — the address bar records the URL submitted for the tab and cannot follow cross-origin links clicked inside the page, so browser history controls are not exposed.
- **Tabs are transient** — restarting or reloading the application clears all open pages.
