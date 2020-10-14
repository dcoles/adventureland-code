/*
 * Fetch code from remote URL and run it.
 *
 * ⚠️ CAUTION -- Only use this with URLs you control and trust.
 * Untrusted code may hijack your account, use it to mine crypto currency,
 * steal personal data, cause your cat to run away and other nasty things.
 */

// URLs to fetch code from
const RUNNER_EXT_URL = 'http://127.0.0.1:5500/runner_functions_ext.js';
const MAIN_URL = 'http://127.0.0.1:5500/main.js';

const runner_ext = document.createElement('script');
runner_ext.src = RUNNER_EXT_URL;
document.head.appendChild(runner_ext);

const main = document.createElement('script');
main.type = 'module';
main.textContent = `import * as Code from ${JSON.stringify(MAIN_URL)}; window.Code = Code;`;
main.onerror = function() {
	set_message('Load Error', 'red');
	log('Error loading remote script', 'red');
};
document.head.appendChild(main);
