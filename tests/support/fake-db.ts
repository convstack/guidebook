type Row = Record<string, unknown>;
type Pred = (row: Row) => boolean;
type Table = { __table: string };

export const tables: Record<string, Row[]> = {};

export function seed(data: Record<string, Row[]>) {
	for (const name of Object.keys(tables)) delete tables[name];
	for (const [name, rows] of Object.entries(data)) {
		tables[name] = rows.map((r) => ({ ...r }));
	}
}

// a column the fake doesn't know would match no row and pass every negative test
const table = (name: string, columns: string[]) =>
	new Proxy(
		{
			__table: name,
			...Object.fromEntries(columns.map((c) => [c, c])),
		} as Record<string, string>,
		{
			get(target, prop, receiver) {
				// then and toJSON are asked for by await and by a failing expect's diff
				if (
					typeof prop === "string" &&
					!(prop in target) &&
					prop !== "then" &&
					prop !== "toJSON"
				) {
					throw new Error(`fake schema has no column ${name}.${prop}`);
				}
				return Reflect.get(target, prop, receiver);
			},
		},
	);

export const schemaModule = {
	wikiPage: table("wikiPage", [
		"id",
		"slug",
		"title",
		"content",
		"parentSlug",
		"createdBy",
		"updatedBy",
		"updatedAt",
	]),
	wikiRevision: table("wikiRevision", [
		"id",
		"pageId",
		"title",
		"content",
		"editedBy",
		"editSummary",
		"createdAt",
	]),
	wikiPagePermission: table("wikiPagePermission", [
		"id",
		"pageId",
		"departmentId",
		"access",
	]),
};

// LIKE as Postgres reads it: % and _ are wildcards, a backslash escapes one
function likeToRegExp(pattern: string, flags: string): RegExp {
	let source = "";
	for (let i = 0; i < pattern.length; i++) {
		const ch = pattern[i];
		if (ch === "\\" && i + 1 < pattern.length) {
			source += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		} else if (ch === "%") source += ".*";
		else if (ch === "_") source += ".";
		else source += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
	return new RegExp(`^${source}$`, flags);
}

const matches =
	(column: string, pattern: string, flags: string): Pred =>
	(row) =>
		likeToRegExp(pattern, flags).test(String(row[column]));

export const drizzleModule = {
	eq:
		(column: string, value: unknown): Pred =>
		(row) =>
			row[column] === value,
	and:
		(...preds: Array<Pred | undefined>): Pred =>
		(row) =>
			preds.every((p) => !p || p(row)),
	desc: (column: string) => column,
	like: (column: string, pattern: string) => matches(column, pattern, "s"),
	ilike: (column: string, pattern: string) => matches(column, pattern, "is"),
};

function query(rows: Row[]) {
	return Object.assign(Promise.resolve(rows), {
		where: (pred: Pred) => query(rows.filter(pred)),
		orderBy: () => query(rows),
		limit: (n: number) => query(rows.slice(0, n)),
	});
}

export const db = {
	select: () => ({
		from: (t: Table) => query(tables[t.__table] ?? []),
	}),
	insert: (t: Table) => ({
		values: async (values: Row | Row[]) => {
			tables[t.__table] = [...(tables[t.__table] ?? []), ...[values].flat()];
		},
	}),
	update: (t: Table) => ({
		set: (values: Row) => ({
			where: async (pred: Pred) => {
				for (const row of tables[t.__table] ?? []) {
					if (pred(row)) Object.assign(row, values);
				}
			},
		}),
	}),
	delete: (t: Table) => ({
		where: (pred: Pred) => {
			const rows = tables[t.__table] ?? [];
			const gone = rows.filter(pred);
			tables[t.__table] = rows.filter((r) => !pred(r));
			return Object.assign(Promise.resolve(gone), {
				returning: async () => gone,
			});
		},
	}),
};
