# Persistent voice and assistant action receipts

This change keeps the existing GPT Live WebRTC session alive across hash-route navigation. It does not replace GPT Live with browser speech synthesis or a different voice protocol. The session retains its existing server time limit, account checks, pending-session recovery, and authenticated stop path.

The voice dock is attached to `document.body`, outside the route-rendered `#main`. It appears only when a session or cleanup is pending and the Voice screen is not open. Mute and End remain available while visiting work screens. A mute selected during a pending microphone grant applies before the granted track is added to the peer. Explicit stop, account end/change, pagehide, and `xtreme:voice-privacy-close` release local media. Existing app-level explicit switches to Video/Call retain their cleanup behavior.

`XtremeAssistantVoice.getSessionState()` returns a frozen object containing only `{state,active,pending,muted,requestId,sessionId}`. Changes dispatch `xtreme:voice-session-changed`. No transcript, review token or provider credentials are included. Unknown data-channel command/delegation events do not run browser actions.

`toggleMute()` is a bounded local microphone toggle for explicit modal buttons. Calendar's native dialog includes its own Mute/End buttons because a modal makes the external voice dock inert. The modal consumes the same state event and calls `toggleMute()` or `stop()`; it does not start voice automatically.

`assistant-actions.js` consumes only validated action receipts arriving through the authenticated app's chat or voice responses. Its `receive(actions,{source,requestId,automatic:true})` method deduplicates by issued action UUID and can navigate only the fixed permitted screen list. It may open an already-prepared Calendar review through `XtremeJobCalendar.showPreparedReview({connectionRevision,review})`; it has no calendar write API. The Calendar module rechecks the current grant and displays its established review/confirmation/status flow. A saved receipt is labeled saved, not completed or externally delivered.

Chat history renders receipt buttons without automatically reopening routes or reviews. Only a newly confirmed current chat response or a receipt matching the active voice request can trigger the bounded automatic presentation. Review tokens stay in the signed-in page's transient private response state; they are not placed in HTML attributes, session/local storage, notifications, metadata events, or model context. Account teardown discards pending action delivery and disables stale controls.

The shared action bridge and its CSS must be loaded by the account bootstrap. It emits `xtreme:assistant-actions-ready`; Chat and Voice tolerate late loading. The Calendar review handoff is asynchronous and returns boolean. Review expiry is canonical ISO UTC with milliseconds; its token is 43 URL-safe characters, and the review request ID equals the action UUID. Create reviews have null event references; updates require the existing opaque event reference.

An automatic voice review that cannot open because Calendar is loading or cannot verify the current grant retains an explicit Review appointment retry button. Deduplication does not discard its retry path. The token remains only in transient private page state, and the retry still invokes the existing review UI without committing.

Builder verification: 47 executable client tests passed in the isolated workspace based on JARVIS migration HEAD `7ab348cb9aa62ef949dd4a3d35bab64ffcee4ae4`. Tests cover route persistence, late permission grants, mute/end/recovery, account teardown, safe receipt presentation, malformed action rejection, late-module delivery, and inert history replay. These are mocked media/DOM tests. No real microphone, carrier call, provider request, commit, deployment, or spoken write approval was tested or performed by this workstream.

Fully hands-free external writes require a separately verified original user-turn confirmation tied to the exact pending review. A model's narration or delegation metadata is not treated as that confirmation by this client.
