// What the plugin sends with the assistant's requests and reads of R's
// answers and failures.

export {
  answeredObject,
  answeredText,
  answeredTexts,
  appPackages,
  failureMessage,
  isRequestError,
  isSessionEnded,
  requestOnOpen,
  sendRequest,
} from "./requests.ts";
export type { OnOpen, Reply } from "./requests.ts";
