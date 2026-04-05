import { nanoid } from "nanoid";
import { db } from "~/db";
import { wikiPage } from "~/db/schema";

const MAIN_PAGE_SLUG = "main-page";
const HOW_TO_SLUG = "how-to-use-markdown";

const MAIN_PAGE_CONTENT = `# Welcome to the Guidebook

This is your convention's knowledge base. Staff members can create and edit pages to document processes, policies, and important information.

## Getting started

- Use the sidebar to browse pages
- Click **New Page** to create content
- Link pages together using wiki links

New to writing pages? Check out the [[How to Use Markdown]] guide.
`;

const HOW_TO_CONTENT = `# How to Use Markdown

This page covers everything you need to write great Guidebook pages. Markdown is a simple way to format text — you write plain text with a few special characters and it gets rendered into nicely formatted content.

## Headings

Use \`#\` symbols to create headings. More \`#\` symbols means a smaller heading.

\`\`\`
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
\`\`\`

## Text formatting

\`\`\`
**Bold text**
*Italic text*
~~Strikethrough~~
\`Inline code\`
\`\`\`

**Bold text**, *italic text*, ~~strikethrough~~, and \`inline code\`.

## Links

Regular links use square brackets and parentheses:

\`\`\`
[Link text](https://example.com)
\`\`\`

[Link text](https://example.com)

## Wiki links

Reference other Guidebook pages by wrapping their title in double brackets:

\`\`\`
[[Page Name]]
[[Page Name|Custom Text]]
\`\`\`

The first form displays the page title as the link text. The second form lets you choose different display text. If the page doesn't exist yet, the link will appear with a visual indicator.

## Lists

### Unordered lists

\`\`\`
- First item
- Second item
  - Nested item
  - Another nested item
- Third item
\`\`\`

- First item
- Second item
  - Nested item
  - Another nested item
- Third item

### Ordered lists

\`\`\`
1. First step
2. Second step
3. Third step
\`\`\`

1. First step
2. Second step
3. Third step

### Task lists

\`\`\`
- [x] Completed task
- [ ] Pending task
- [ ] Another pending task
\`\`\`

- [x] Completed task
- [ ] Pending task
- [ ] Another pending task

## Blockquotes

\`\`\`
> This is a blockquote.
> It can span multiple lines.
>
> And have multiple paragraphs.
\`\`\`

> This is a blockquote.
> It can span multiple lines.
>
> And have multiple paragraphs.

## Code

### Inline code

Wrap text in single backticks:

\`\`\`
Use the \\\`config.json\\\` file to change settings.
\`\`\`

Use the \`config.json\` file to change settings.

### Code blocks

Wrap multiple lines in triple backticks:

\`\`\`\`
\`\`\`
{
  "name": "example",
  "version": "1.0.0"
}
\`\`\`
\`\`\`\`

\`\`\`
{
  "name": "example",
  "version": "1.0.0"
}
\`\`\`

## Tables

\`\`\`
| Name | Role | Department |
|------|------|------------|
| Alice | Lead | Operations |
| Bob | Staff | Logistics |
| Carol | Admin | Security |
\`\`\`

| Name | Role | Department |
|------|------|------------|
| Alice | Lead | Operations |
| Bob | Staff | Logistics |
| Carol | Admin | Security |

## Horizontal rules

Use three dashes to create a divider:

\`\`\`
---
\`\`\`

---

## Images

\`\`\`
![Alt text](https://example.com/image.png)
\`\`\`

## Combining it all

You can combine any of these elements freely. A typical Guidebook page might look like:

\`\`\`
# Radio Procedures

All staff must follow these procedures during the event.

## Channel assignments

| Channel | Department | Use |
|---------|-----------|-----|
| 1 | Operations | General coordination |
| 2 | Security | Security team only |
| 3 | Medical | Medical emergencies |

## Before your shift

- [x] Pick up your radio from Ops
- [ ] Test that it works on your assigned channel
- [ ] Confirm you have a charged battery

> **Important:** Always carry a spare battery.

See [[Radio Equipment]] for hardware details.
\`\`\`
`;

async function ensurePage(
	slug: string,
	title: string,
	content: string,
	parentSlug: string | null,
	sortOrder: number,
) {
	const { eq } = await import("drizzle-orm");

	const [existing] = await db
		.select({ id: wikiPage.id })
		.from(wikiPage)
		.where(eq(wikiPage.slug, slug))
		.limit(1);

	if (existing) return;

	const now = new Date();
	await db.insert(wikiPage).values({
		id: nanoid(),
		title,
		slug,
		content,
		parentSlug,
		sortOrder,
		createdBy: "system",
		updatedBy: "system",
		createdAt: now,
		updatedAt: now,
	});

	console.log(`Created default page: ${title}`);
}

export async function ensureMainPage() {
	await ensurePage(MAIN_PAGE_SLUG, "Main Page", MAIN_PAGE_CONTENT, null, 0);
	await ensurePage(
		HOW_TO_SLUG,
		"How to Use Markdown",
		HOW_TO_CONTENT,
		MAIN_PAGE_SLUG,
		0,
	);
}
