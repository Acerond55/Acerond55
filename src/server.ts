import express, { type Express, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "./config.js";
import { router } from "./webhooks/routes.js";
import { onboardingRouter } from "./webhooks/onboardingRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createServer(): Express {
  const app = express();

  // Capture the raw body so Calendly's HMAC signature can be verified over it.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf.toString("utf8");
      },
    })
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, dryRun: config.dryRun });
  });

  // Candidate-facing choice screen.
  const publicDir = path.join(__dirname, "public");
  app.get("/apply", (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, "apply.html"));
  });
  // Inject env URLs into the page config so the static HTML stays generic.
  app.get("/apply/config.js", (_req: Request, res: Response) => {
    res.type("application/javascript").send(
      `window.USN_CONFIG = ${JSON.stringify({
        videoaskUrl: config.videoask.url,
        calendlyUrl: config.calendly.url,
      })};`
    );
  });

  app.use(router);
  app.use(onboardingRouter);

  return app;
}
