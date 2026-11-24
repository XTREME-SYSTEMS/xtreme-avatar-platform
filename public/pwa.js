/* Installation is opt-in. This module never reloads the page or reads account data. */
(() => {
  'use strict';
  let installEvent = null, registration = null, registering = false;
  const displayMode = window.matchMedia?.('(display-mode: standalone)');
  const standalone = () => Boolean(displayMode?.matches || navigator.standalone === true);
  const isiOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function announce() { window.dispatchEvent(new CustomEvent('xtreme:pwa-status', { detail: { standalone: standalone(), canPrompt: Boolean(installEvent) } })); }
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installEvent = event; announce(); });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    const status = document.querySelector('#xtreme-pwa-status');
    if (status) status.textContent = 'Xtreme Avatar was added to your apps. You can keep using this page.';
    const button = document.querySelector('#xtreme-pwa-native');
    if (button) button.remove();
    announce();
  });
  displayMode?.addEventListener?.('change', announce);
  function showInstall() {
    if (window.XtremeAccount?.locked) return false;
    const existing = document.querySelector('#xtreme-pwa-install');
    if (existing?.open) return true;
    // A call/account dialog owns focus until the user closes it.
    if (document.querySelector('dialog[open]')) return false;
    const opener = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.id = 'xtreme-pwa-install';
    dialog.setAttribute('aria-labelledby', 'xtreme-pwa-title');
    dialog.setAttribute('aria-describedby', 'xtreme-pwa-status');
    const title = standalone() ? 'Already in your apps' : 'Add Xtreme Avatar';
    let instructions;
    if (standalone()) instructions = '<p id="xtreme-pwa-status" role="status">You’re using the installed app.</p>';
    else if (installEvent) instructions = '<p id="xtreme-pwa-status" role="status">Open Xtreme Avatar from your home screen or app launcher.</p><button id="xtreme-pwa-native" class="pwa-install" type="button">Install app</button>';
    else if (isiOS()) instructions = '<p id="xtreme-pwa-status" role="status">On iPhone or iPad, open this site in Safari.</p><ol><li>Tap Share.</li><li>Choose <strong>Add to Home Screen</strong>.</li><li>If shown, turn on <strong>Open as Web App</strong>, then tap Add.</li></ol>';
    else instructions = '<p id="xtreme-pwa-status" role="status">Use your browser’s menu to install Xtreme Avatar.</p><ol><li>In Chrome or Edge, look for <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li><li>On a Mac in Safari, choose <strong>File → Add to Dock</strong>.</li></ol><p>If installation is unavailable, you can keep using this site in your browser.</p>';
    dialog.innerHTML = `<button type="button" class="pwa-close" aria-label="Close install instructions">×</button><h2 id="xtreme-pwa-title">${title}</h2>${instructions}<p class="pwa-note">Internet and sign-in are required for your account and live conversations. Installing does not enable offline calls or video.</p>`;
    const remove = () => { dialog.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
    dialog.addEventListener('close', remove, { once: true });
    dialog.querySelector('.pwa-close').addEventListener('click', () => dialog.close());
    dialog.querySelector('#xtreme-pwa-native')?.addEventListener('click', async event => {
      const prompt = installEvent;
      if (!prompt) return;
      installEvent = null;
      event.currentTarget.disabled = true;
      const status = dialog.querySelector('#xtreme-pwa-status');
      try {
        await prompt.prompt();
        const result = await prompt.userChoice;
        if (dialog.isConnected) status.textContent = result.outcome === 'accepted' ? 'Installation requested. Follow your browser’s instructions.' : 'Installation dismissed. You can keep using this page.';
      } catch {
        if (dialog.isConnected) status.textContent = 'Use your browser’s menu to add this app, or try again later.';
      } finally {
        if (dialog.isConnected) dialog.querySelector('#xtreme-pwa-native')?.remove();
        announce();
      }
    });
    document.body.append(dialog);
    dialog.showModal();
    return true;
  }
  async function register() {
    if (registering || !('serviceWorker' in navigator) || !window.isSecureContext || window.top !== window.self) return;
    registering = true;
    try { registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }); }
    catch { /* Installation support is optional; account and session UI stay usable. */ }
  }
  window.addEventListener('xtreme:account-ended', () => document.querySelector('#xtreme-pwa-install')?.close());
  window.XtremePWA = { showInstall, get standalone() { return standalone(); }, get canPrompt() { return Boolean(installEvent); }, get registered() { return Boolean(registration); } };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', register, { once: true });
})();
