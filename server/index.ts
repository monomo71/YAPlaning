import { createApp } from "./app.ts";
const app = await createApp();
await app.listen({
  port: Number(process.env.PORT || 3210),
  host: process.env.HOST || "127.0.0.1",
});
console.log(
  `YAPlaning draait op http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3210}`,
);
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    void app.close().then(() => process.exit(0));
  });
