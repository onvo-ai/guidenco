import { NextResponse } from "next/server";
import puppeteer from "puppeteer";
import Handlebars from "handlebars";

export const maxDuration = 30;

// Register Handlebars helpers
Handlebars.registerHelper("range", function (start: number, end: number) {
  const result = [];
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  return result;
});

Handlebars.registerHelper("odd", function (value: number) {
  return value % 2 === 1;
});

Handlebars.registerHelper("even", function (value: number) {
  return value % 2 === 0;
});

export async function POST(req: Request) {
  try {
    const {
      template,
      width,
      height,
      format = "base64",
      googleFonts = [],
      scale = 1,
    } = await req.json();

    if (!template || !width || !height) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Compile Handlebars template with sample data
    let compiledHTML;
    try {
      const hbsTemplate = Handlebars.compile(template);
      const sampleData = {
        title: "Sample Title",
        description: "Sample Description",
        items: ["Item 1", "Item 2", "Item 3"],
        user: { name: "John Doe", email: "john@example.com" },
        count: 5,
        isActive: true,
      };
      compiledHTML = hbsTemplate(sampleData);
    } catch (error: any) {
      return NextResponse.json(
        { error: `Template compilation error: ${error.message}` },
        { status: 400 },
      );
    }

    // Build Google Fonts link if fonts are specified
    const googleFontsLink =
      googleFonts.length > 0
        ? `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?${googleFonts.map((font: string) => `family=${font.replace(/ /g, "+")}:wght@400;700`).join("&")}&display=swap" rel="stylesheet">`
        : "";

    // Build complete HTML document with optional scaling
    const fullHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  ${googleFontsLink}
  <style>
    html, body {
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    body {
      width: ${width}px;
      height: ${height}px;
      ${scale !== 1 ? `transform: scale(${scale}); transform-origin: top left;` : ""}
    }
  </style>
</head>
<body>
  ${compiledHTML}
</body>
</html>
    `;

    // Launch Puppeteer and render
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-crash-reporter",
        "--disable-dev-shm-usage",
        "--no-zygote",
      ],
    });

    const page = await browser.newPage();
    // Set viewport to scaled dimensions
    await page.setViewport({
      width: Math.ceil(width * scale),
      height: Math.ceil(height * scale),
    });
    await page.setContent(fullHTML, { waitUntil: "networkidle0" });

    // Take screenshot
    const screenshot = await page.screenshot({
      type: "png",
      encoding: format === "base64" ? "base64" : "binary",
      omitBackground: true,
    });

    await browser.close();

    if (format === "base64") {
      return NextResponse.json({
        success: true,
        image: `data:image/png;base64,${screenshot}`,
      });
    } else {
      return new NextResponse(
        Buffer.from(screenshot as unknown as Uint8Array),
        {
          headers: {
            "Content-Type": "image/png",
            "Content-Disposition": `attachment; filename="document-${Date.now()}.png"`,
          },
        },
      );
    }
  } catch (error: any) {
    console.error("Render error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
