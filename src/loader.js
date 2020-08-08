/**
 * Fetch code from remote URL and run it.
 *
 * ⚠️ CAUTION -- Only use this with URLs you control and trust.
 * Untrusted code may hijack your account, use it to mine crypto currency,
 * steal personal data, cause your cat to run away and other nasty things.
 */

// URL to fetch code from
const URL = "http://127.0.0.1:5500/src/main.js";

const script = document.createElement("script");
script.src = URL;
script.type = "module";
document.head.appendChild(script);