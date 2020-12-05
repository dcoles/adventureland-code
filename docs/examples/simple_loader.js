/*
 * Fetch code from remote URL and execute it.
 *
 * This file must be pasted into the in-game CODE editor.
 * When run, it will try to fetch the remote file and execute it.
 *
 * ⚠️ IMPORTANT -- Only use this with URLs you control and trust.
 * Untrusted code may hijack your account, use it to mine crypto currency,
 * steal personal data, cause your cat to run away and other nasty things.
 */

// URLs to fetch code from
// Port 5500 is the default port of the VSCode Live Server extension
const MAIN_URL = 'http://127.0.0.1:5500/main.js';

// Create a new `<script>` tag
const script = document.createElement('script');
//script.type = 'module';  // Uncomment for ES6 modules
script.src = MAIN_URL;
script.onerror = function(e) {
	set_message('Load Error', 'red');
	log('Error loading remote script', 'red');
};

// Add `<script>` tag to CODE iframe
log('Loading ' + MAIN_URL);
document.head.appendChild(script);
