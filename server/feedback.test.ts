import { describe, expect, it } from "vitest";
import { feedbackInputSchema } from "./routers/feedback";

describe("feedback input", () => {
  it("allows feedback without contact details", () => {
    const result = feedbackInputSchema.safeParse({
      kind: "feedback",
      content: "页面建议",
    });

    expect(result.success).toBe(true);
  });

  it("requires contact details for questions", () => {
    const result = feedbackInputSchema.safeParse({
      kind: "question",
      content: "如何控制单笔风险？",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a question with contact details", () => {
    const result = feedbackInputSchema.safeParse({
      kind: "question",
      content: "如何控制单笔风险？",
      contact: "example@example.com",
    });

    expect(result.success).toBe(true);
  });
});
