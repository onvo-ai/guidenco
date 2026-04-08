import { NextResponse } from "next/server";
import { z } from "zod";

type NotionProperty = {
  id: string;
  type: string;
};

type NotionDatabase = {
  properties: Record<string, NotionProperty>;
};

type Submission = z.infer<typeof submissionSchema>;

const submissionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(5).max(40),
  budget: z.string().trim().min(1).max(120),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  source: z.string().trim().max(120).optional(),
});

const NOTION_API_VERSION = "2022-06-28";
const notionToken =
  process.env.NOTION_API_KEY ??
  process.env.NOTION_TOKEN ??
  process.env.NOTION_INTEGRATION_TOKEN ??
  process.env.NOTION_SECRET;
const notionDatabaseId =
  process.env.NOTION_DEMO_REQUESTS_DATABASE_ID ?? process.env.NOTION_DATABASE_ID;

const titleAliases = ["name", "full name", "lead name", "visitor name"];
const companyAliases = ["company", "company name", "organization", "organisation"];
const emailAliases = ["email", "e-mail"];
const phoneAliases = ["phone", "phone number", "mobile", "telephone"];
const budgetAliases = ["budget", "marketing budget", "monthly budget", "ad spend"];
const messageAliases = ["message", "notes", "details", "project details", "what do you want to improve?"];
const sourceAliases = ["source", "lead source", "origin"];
const submittedAtAliases = ["submitted at", "submission date", "created at", "requested at"];

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findProperty(
  properties: Record<string, NotionProperty>,
  aliases: string[],
  type?: string,
) {
  const normalizedAliases = aliases.map(normalizeLabel);
  const entries = Object.entries(properties);

  return (
    entries.find(
      ([name, property]) => normalizedAliases.includes(normalizeLabel(name)) && (!type || property.type === type),
    ) ?? (type ? entries.find(([, property]) => property.type === type) : undefined)
  );
}

function extractNotionError(body: string) {
  try {
    const parsed = JSON.parse(body) as { message?: string; code?: string };
    return parsed.message || parsed.code || body;
  } catch {
    return body;
  }
}

function budgetToNumber(value: string) {
  const normalized = value.toLowerCase().replace(/[$,\s]/g, "");
  const match = normalized.match(/(\d+(?:\.\d+)?)/);

  if (!match) {
    return null;
  }

  const numeric = Number(match[1]);
  if (Number.isNaN(numeric)) {
    return null;
  }

  return normalized.includes("k") && numeric < 1000 ? numeric * 1000 : numeric;
}

function buildPropertyValue(type: string, value: string) {
  switch (type) {
    case "title":
      return {
        title: [
          {
            type: "text",
            text: {
              content: value,
            },
          },
        ],
      };
    case "rich_text":
      return {
        rich_text: [
          {
            type: "text",
            text: {
              content: value,
            },
          },
        ],
      };
    case "email":
      return { email: value };
    case "phone_number":
      return { phone_number: value };
    case "select":
      return { select: { name: value } };
    case "multi_select":
      return { multi_select: [{ name: value }] };
    case "number": {
      const numeric = budgetToNumber(value);
      return numeric === null ? null : { number: numeric };
    }
    case "date":
      return { date: { start: value } };
    case "url":
      return { url: value };
    default:
      return null;
  }
}

function createPageProperties(database: NotionDatabase, submission: Submission) {
  const properties: Record<string, unknown> = {};

  const titleProperty = findProperty(database.properties, titleAliases, "title") ?? findProperty(database.properties, [], "title");
  if (!titleProperty) {
    throw new Error("The Notion database does not have a title property.");
  }

  properties[titleProperty[0]] = buildPropertyValue("title", submission.name);

  const mapping: Array<{ aliases: string[]; value: string }> = [
    { aliases: companyAliases, value: submission.company },
    { aliases: emailAliases, value: submission.email },
    { aliases: phoneAliases, value: submission.phone },
    { aliases: budgetAliases, value: submission.budget },
    { aliases: messageAliases, value: submission.message || "" },
    { aliases: sourceAliases, value: submission.source || "website-book-demo-page" },
    { aliases: submittedAtAliases, value: new Date().toISOString() },
  ];

  for (const item of mapping) {
    if (!item.value) {
      continue;
    }

    const property = findProperty(database.properties, item.aliases);
    if (!property) {
      continue;
    }

    const propertyValue = buildPropertyValue(property[1].type, item.value);
    if (propertyValue) {
      properties[property[0]] = propertyValue;
    }
  }

  return properties;
}

async function loadNotionDatabase(databaseId: string, token: string) {
  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_API_VERSION,
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to load Notion database: ${extractNotionError(await response.text())}`);
  }

  return (await response.json()) as NotionDatabase;
}

async function createNotionPage(databaseId: string, token: string, properties: Record<string, unknown>) {
  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
    }),
  });

  if (!response.ok) {
    throw new Error(`Unable to create Notion page: ${extractNotionError(await response.text())}`);
  }
}

export async function POST(request: Request) {
  try {
    if (!notionToken) {
      return NextResponse.json(
        { error: "Notion is not configured. Set NOTION_API_KEY (or NOTION_TOKEN)." },
        { status: 500 },
      );
    }

    if (!notionDatabaseId) {
      return NextResponse.json(
        { error: "Notion database is not configured. Set NOTION_DEMO_REQUESTS_DATABASE_ID." },
        { status: 500 },
      );
    }

    const payload = (await request.json()) as unknown;
    const submission = submissionSchema.parse(payload);

    const database = await loadNotionDatabase(notionDatabaseId, notionToken);
    const properties = createPageProperties(database, submission);

    await createNotionPage(notionDatabaseId, notionToken, properties);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to submit book demo request:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Please fill in all required fields correctly." }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Failed to save the demo request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
