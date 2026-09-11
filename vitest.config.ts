import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Release archives under artifacts/ may contain older copies of these tests.
    // Run only the current repository's suite so counts and results stay accurate.
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
