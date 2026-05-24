import { Hono } from "hono";
import { x402Hono } from "@trango/x402-middleware/hono";

const app = new Hono();

// Payment config — use "base-sepolia" during development, switch to "base" for production
const gate = x402Hono(
  {
    payTo: "0xYourWalletAddress",
    network: "base-sepolia",
    description: "Trango asset download",
  },
  {
    // Exact path — specific price
    "/download/premium.svg": { amount: "1.00", description: "Premium SVG" },
    // Wildcard — all other downloads cost 0.25
    "/download/*": "0.25",
    // Different price tier for exports
    "/export/pdf": { amount: "0.50", description: "PDF export" },
    "/export/bulk": { amount: "2.00", description: "Bulk ZIP export" },
  }
);

// Apply the middleware to gated route groups
app.use("/download/*", gate);
app.use("/export/*", gate);

// These handlers only run after payment is verified
app.get("/download/:filename", async (c) => {
  const filename = c.req.param("filename");
  const content = `<svg xmlns="http://www.w3.org/2000/svg"><!-- ${filename} --></svg>`;
  return c.body(content, 200, {
    "Content-Type": "image/svg+xml",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});

app.get("/export/pdf", async (c) => {
  // Generate PDF...
  return c.body("PDF content", 200, { "Content-Type": "application/pdf" });
});

// Public routes — no payment needed
app.get("/", (c) => c.text("Trango API"));

export default app;
