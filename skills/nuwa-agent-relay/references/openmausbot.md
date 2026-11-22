# OpenMausBot: Office Gateway

Read the core Nuwa Skill for the shared-office onboarding, trusted Wake event and reply format. This guide governs native conversation binding, first contact and subsequent delivery.

### OpenMausBot — explicit native conversation

**Setup.** The Nuwa MCP connector is enabled independently for each assistant
on OpenMausBot. Check the Gateway and every selected coworker in the
platform's connector settings, or have the administrator verify the UI.
Name each assistant with a disabled `nuwa-agent-relay` connector and ask
the administrator to enable it. Verify both `coordinate_bots` and
`relayGatewayConfirmFirstContact` in the receiving Routine itself, including
access to the actual native receipt. Enroll with
`threadMode: "explicit", firstContactMode: "automatic"`.

An installed OpenMausBot Gateway updates its existing Routine instructions
in place when adopting this procedure. Keep its verified Wake, identity,
roster and native bindings. Replace the entire forwarding instruction, so
the first-contact completion rule applies to every new execution.

**Routine procedure.** For an authenticated message event, read
`recipientPlatformThreadID` from that event:

1. **Reserved first contact — null.**
   - Call `coordinate_bots` once using `bot_ids: [recipientBotID]`,
     `thread: "new"`, `reply: "none"` and the prepared full message.
   - Read the actual target native Thread ID from the successful tool receipt.
   - Immediately call
     `relayGatewayConfirmFirstContact({recipientSessionID, senderSessionID, messageID, nativeThreadID})`
     using the event's `recipientSessionID`, `senderSessionID` and
     `messageID`, together with the actual `nativeThreadID` from that receipt.
   - Confirm success, then finish. The confirmation saves the native ID
     and releases waiting Wake notifications. Native submission alone
     is incomplete for this branch.
2. **Established contact — nonempty string.**
   - Call `coordinate_bots` once using `bot_ids: [recipientBotID]`,
     `thread: recipientPlatformThreadID`, `reply: "none"` and the prepared
     full message. Finish after submission.
3. A missing or invalid field is a routing error for this explicit adapter.
   Report the error and stop.

Relay stores the mapping by sender and recipient Session. A→B reuses one
native conversation even for new Relay Threads. C→B receives a separate
conversation. Use the event's native ID directly; never substitute
`relayThreadID`, use `standing` or create a replacement on error.

For uncertain first submission or failed confirmation, retain the original
event IDs and trusted receipt for recovery and report the error. Recover
a pending first contact by confirming the original message and actual
receipt with the same authorized Gateway. Repeating confirmation with
the same receipt is idempotent; repeating native creation is not.
