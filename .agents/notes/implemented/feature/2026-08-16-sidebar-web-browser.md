# Agent Note: Docked web browser

Status: implemented

English | [中文](2026-08-16-sidebar-web-browser.zh.md)

## Problem

The desktop application can run the Harness front end and backend without an external Node.js installation, but users still leave the application to inspect a local HTML result or a web reference. The client needs a browsing surface that preserves the current conversation, supports several working pages, and does not grant untrusted content access to the Harness origin or Electron APIs.

## Decision

**A single client plugin owns the entry, right-side panel, and open operations.** `@deepseek-ai/dsh-client-ui-browser` registers an icon-only action in `conversation.session.header.utilities`, a bounded panel in `shell.utility-panel`, and a client service that opens URLs and desktop-readable HTML paths. Both registrations use one Session-scoped store handle. The shell renders the panel as its rightmost column, so it reduces conversation width instead of covering application content; opening it closes the mutually exclusive Session details column.

**Tabs retain frames only for the current renderer lifetime.** The store holds plain tab metadata and active selection without persistence. Every non-empty tab remains mounted while inactive, which preserves ordinary page state across tab switches. Closing the last tab creates a blank tab so the address and file actions remain available.

**Remote and local sources have separate admission paths.** Address text and application link clicks accept only normalized HTTP and HTTPS URLs and reject the Harness application's own origin. Local HTML enters through a file input or, in the desktop application, through an isolated preload bridge that accepts absolute HTML paths up to 10 MB. Both paths create an object URL whose lifetime is tied to its tab and the panel component. Replacing, closing, or tearing down a local tab revokes its object URL.

**Page content stays sandboxed.** Iframes allow scripts, forms, and modal dialogs but omit same-origin permission. The plugin neither enables Electron webviews nor exposes Node.js or Electron APIs. Opening a remote URL outside the panel delegates to the desktop host's existing external-navigation policy.

## Alternatives considered

**Electron `webview` tags with full browser navigation.** Rejected because webviews require a broader Electron configuration and create another privileged content lifecycle when iframe isolation is sufficient for the first browsing surface.

**A Host filesystem endpoint for local pages and their asset trees.** Rejected because it would expand the network-facing Host API and file-serving authority. The packaged application instead uses an Electron preload operation that validates file type and size without exposing Electron capabilities to either the application page or embedded content.

**Persist tabs across application restarts.** Rejected because local object URLs cannot survive a renderer restart, and restoring remote pages would also restore network activity without an explicit user action.

**Render the browser in the frame-wide overlay.** Rejected because a floating panel covers the conversation and cannot participate in application sizing. The dedicated utility column leaves the conversation mounted, gives it the remaining width, and returns that space when the panel closes.

## Consequences

The desktop and web compositions gain a Session-header tools action and a docked browser with multiple retained tabs, internal application-link routing, remote URL loading, local single-file HTML loading, refresh, and external opening. The action uses a generic right-panel glyph so the area can host related tools without presenting itself as a browser-only control. Produced HTML files open internally when the desktop bridge is present; other files retain native opening. Sites may still refuse iframe embedding, and cross-origin frame navigation cannot update the address bar or expose reliable history controls. The package README owns these visible limitations and the object-URL lifetime rule.
