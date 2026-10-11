/** Runs once when the server starts. Node-only work lives in instrumentation.node.ts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await (await import("./instrumentation.node")).warmDatabase();
  }
}
