export const OPEN_ASK_WENGER_EVENT = "pnlnote:open-ask-wenger";

export function openAskWengerDialog() {
  window.dispatchEvent(new Event(OPEN_ASK_WENGER_EVENT));
}
