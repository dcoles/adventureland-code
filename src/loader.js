/**
 * Fetch code from remote URL and run it.
 *
 * ⚠️ CAUTION -- Only use this with URLs you control and trust.
 * Untrusted code may hijack your account, use it to mine crypto currency,
 * steal personal data, cause your cat to run away and other nasty things.
 */

 /**
  * Enable strict mode to help catch more bugs.
  *
  * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode
  */
 "use strict";

/** URL to fetch code from */
const URL = "http://127.0.0.1:5500/src/main.js";

fetch(URL)
	.then((response) => response.text())
	.then((code) => eval(code))
	.catch((err) => {
		set_message("FETCH ERROR", "red");
		console.log("Error loading code:", err);
		log("Error loading code:", "red");
		safe_log(err.stack, "red");
	});