// The cap on the messages of each conversation that the state keeps: the
// blockr option chat_save_turns, which the deployment sets, since it governs
// whether a conversation may land in a shared file
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#how-much-of-a-conversation-the-state-keeps).
// - It is 50 where nothing sets it.
// - With 0, the state keeps no conversation.
// - With -1, it keeps every message, since JSON holds no infinite number, so
//   that R sends Inf as null. The cap is then Infinity.
// A string, as an environment variable gives, reads as the number that it
// holds, so that "20" is 20. Any other value fails, Inf among them, with a
// message that names the value as R sent it, so that no conversation lands in
// the state under a cap that nobody set.

import type { CoreApi } from "@blockr/core";
import { sentNumber } from "../blockr-options/index.ts";

export async function readCap(core: Pick<CoreApi, "blockrOption">): Promise<number> {
  const sent = await core.blockrOption("chat_save_turns");
  if (sent === undefined) return 50;
  const value = sentNumber(sent);
  if (value === -1) return Infinity;
  if (Number.isInteger(value) && value >= 0) return value;
  throw new RangeError(
    `The blockr option chat_save_turns is ${JSON.stringify(sent)}, where it takes a whole number of 0 or more, or -1 for every message.`,
  );
}
