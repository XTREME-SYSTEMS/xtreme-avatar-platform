# Voice input

The authenticated app loads `voice-fields.js` and adds a Dictate control beside editable text, search, email, URL, phone, numeric, date, time, range and single-select fields. The existing dial-pad Dictate control remains. Passwords, API-key-like fields, hidden/file fields, disabled/read-only controls, and multiple-select controls are excluded. Date-time controls expose a device voice-control fallback.

Speech starts only from a button tap. One recognition session is allowed at a time. A live GPT voice conversation blocks field dictation. Starting a video, call, route change or the existing phone dictation stops field recognition. Account end, hidden page, Escape, page departure, removed fields, and manual edits invalidate pending results.

Only final recognition updates a field. It dispatches the existing input/change events, so normal draft/profile autosaving still applies. It never submits a form, approves account permissions, creates a call, sends a message, deletes a record, or starts an agent job. Existing text selection, maximum length, and browser input validity are respected; invalid values leave the original entry untouched. Ambiguous dates and choices are rejected rather than guessed.

Browser speech support varies. The browser may process audio online. No new speech provider, API credential, recorded-audio storage, or paid transcription service was added. Unsupported browsers show keyboard-microphone/device-voice guidance. Physical iPhone/Android recognition and rendering are NOT TESTED.

This is a voice-entry layer, not yet an autonomous assistant that operates every form from a live conversation. The Etherverse execution connection remains a separate dependency.

Tests: `node --test tests/voice-fields.test.mjs` covers conversion, actual input/change propagation, invalid values, account/route transitions, late events, denial, live voice conflicts and unsupported browsers.
