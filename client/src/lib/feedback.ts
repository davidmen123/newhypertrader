export const OPEN_FEEDBACK_EVENT = "pnlnote:open-feedback";

export function openFeedbackDialog() {
  window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT));
}
