/**
 * Load Plaid Link v2 (vanilla JS). Avoids react-plaid-link, which does not yet declare React 19 peer support.
 * @see https://plaid.com/docs/link/web/
 */
export function loadPlaidLinkScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Plaid Link requires a browser'));
      return;
    }
    if (window.Plaid) {
      resolve(window.Plaid);
      return;
    }
    const existing = document.querySelector('script[data-plaid-link-v2]');
    if (existing) {
      const done = () => {
        if (window.Plaid) resolve(window.Plaid);
        else reject(new Error('Plaid script loaded but Plaid global missing'));
      };
      existing.addEventListener('load', done);
      existing.addEventListener('error', () => reject(new Error('Failed to load Plaid Link script')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    s.async = true;
    s.dataset.plaidLinkV2 = '1';
    s.onload = () => {
      if (window.Plaid) resolve(window.Plaid);
      else reject(new Error('Plaid script loaded but Plaid global missing'));
    };
    s.onerror = () => reject(new Error('Failed to load Plaid Link script'));
    document.body.appendChild(s);
  });
}

/**
 * @param {object} opts
 * @param {string} opts.linkToken
 * @param {(publicToken: string, metadata: object) => void | Promise<void>} opts.onSuccess
 * @param {(err: unknown | null, metadata: object) => void} [opts.onExit]
 */
export async function openPlaidLink({ linkToken, onSuccess, onExit }) {
  const Plaid = await loadPlaidLinkScript();
  const handler = Plaid.create({
    token: linkToken,
    onSuccess,
    onExit: (err, metadata) => {
      if (onExit) onExit(err, metadata);
    },
  });
  handler.open();
}
