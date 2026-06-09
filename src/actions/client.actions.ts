"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { normalizeEmployeePermissions } from "@/lib/employee-permissions";
import { createClientSchema, updateClientSchema } from "@/lib/validations/client.schema";
import { logActivity } from "./activity-log.actions";

export interface ClientListItem {
  id: string;
  name: string;
  collegeName: string | null;
  email: string;
  phone: string | null;
  country: string | null;
  serviceName: string | null;
  projectName: string | null;
  tags: string | null;
  isActive: boolean;
  createdAt: Date;
  activityCount: number;
}

interface ClientRow extends Omit<ClientListItem, "activityCount"> {
  activityCount: bigint | number;
}

export type ClientStatusFilter = "all" | "active" | "inactive";

export interface StoredCollegeEntry {
  id: string;
  name: string;
  address: string | null;
}

type ImportClientRecordInput = {
  rowNumber: number;
  values: Record<string, string>;
};

type ImportClientRecordResult = {
  rowNumber: number;
  clientName: string;
  success: boolean;
  message: string;
};

interface GetClientsInput {
  query?: string;
  page?: number;
  pageSize?: number;
  status?: ClientStatusFilter;
}

async function requireClientModuleAccess() {
  const user = await requireAuth();
  if (user.role === "ADMIN") {
    return user;
  }

  const permissions = normalizeEmployeePermissions(user.permissions);
  const hasClientsModule = permissions.moduleAccess.includes("CRM");

  if (!hasClientsModule) {
    throw new Error("Forbidden: Missing module access CRM");
  }

  return user;
}

async function requireClientActionPermission(action: "CREATE" | "UPDATE" | "DELETE") {
  const user = await requireClientModuleAccess();
  if (user.role === "ADMIN") {
    return user;
  }

  const permissions = normalizeEmployeePermissions(user.permissions);
  if (!permissions.actionPermissions.includes(action)) {
    throw new Error(`Forbidden: Missing permission actionPermissions:${action}`);
  }

  return user;
}

async function ensureCollegeDirectoryTable() {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "college_directory" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "address" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "college_directory_name_unique_idx"
    ON "college_directory" (LOWER("name"))
  `);
}

const CLIENT_IMPORT_FIELD_ALIASES = {
  name: ["name", "client_name", "contact_name", "student_name"],
  email: ["email", "client_email", "contact_email", "mail"],
  phone: ["phone", "mobile", "client_phone", "contact_phone"],
  collegeName: ["college_name", "company", "organization"],
  street: ["street", "street_1"],
  city: ["city"],
  zip: ["zip", "zipcode", "postal_code"],
  state: ["state"],
  country: ["country"],
  serviceName: ["service_name", "service"],
  projectName: ["project_name", "project"],
  tags: ["tags", "tag"],
  address: ["address"],
  notes: ["notes", "note", "description"],
  isActive: ["is_active", "active", "status"],
} as const;

function normalizeImportFieldKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function createNormalizedImportRow(values: Record<string, string>) {
  return new Map(
    Object.entries(values).map(([key, value]) => [
      normalizeImportFieldKey(key),
      typeof value === "string" ? value.trim() : "",
    ])
  );
}

function getImportField(row: Map<string, string>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = row.get(alias);
    if (value) {
      return value;
    }
  }

  return "";
}

function resolveImportedClientActiveState(value: string) {
  const normalized = normalizeImportFieldKey(value);
  if (!normalized) return true;
  if (["inactive", "false", "no", "0", "disabled"].includes(normalized)) return false;
  return true;
}

function formatClientImportError(error: unknown) {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    return Object.values(error as Record<string, string[] | undefined>)
      .flat()
      .filter(Boolean)
      .join(", ");
  }

  return "Unable to import contact";
}

function buildClientWhereInput(query?: string, status: ClientStatusFilter = "all"): Prisma.ClientWhereInput {
  const trimmedQuery = query?.trim() || "";
  const where: Prisma.ClientWhereInput = {};

  if (trimmedQuery) {
    where.OR = [
      { name: { contains: trimmedQuery, mode: "insensitive" } },
      { collegeName: { contains: trimmedQuery, mode: "insensitive" } },
      { email: { contains: trimmedQuery, mode: "insensitive" } },
      { phone: { contains: trimmedQuery, mode: "insensitive" } },
      { country: { contains: trimmedQuery, mode: "insensitive" } },
      { serviceName: { contains: trimmedQuery, mode: "insensitive" } },
      { projectName: { contains: trimmedQuery, mode: "insensitive" } },
      { tags: { contains: trimmedQuery, mode: "insensitive" } },
    ];
  }

  if (status === "active") {
    where.isActive = true;
  } else if (status === "inactive") {
    where.isActive = false;
  }

  return where;
}

export async function getClients(input: GetClientsInput = {}) {
  await requireClientModuleAccess();
  const query = input.query?.trim() || "";
  const page = Math.max(1, input.page || 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize || 10));
  const status = input.status === "active" || input.status === "inactive" ? input.status : "all";
  const offset = (page - 1) * pageSize;

  const filters: Prisma.Sql[] = [];
  if (query) {
    const searchTerm = `%${query}%`;
    filters.push(Prisma.sql`
      (
        c."name" ILIKE ${searchTerm}
        OR COALESCE(c."collegeName", '') ILIKE ${searchTerm}
        OR c."email" ILIKE ${searchTerm}
        OR COALESCE(c."phone", '') ILIKE ${searchTerm}
        OR COALESCE(c."country", '') ILIKE ${searchTerm}
        OR COALESCE(c."serviceName", '') ILIKE ${searchTerm}
        OR COALESCE(c."projectName", '') ILIKE ${searchTerm}
        OR COALESCE(c."tags", '') ILIKE ${searchTerm}
      )
    `);
  }

  if (status === "active") {
    filters.push(Prisma.sql`c."isActive" = true`);
  }

  if (status === "inactive") {
    filters.push(Prisma.sql`c."isActive" = false`);
  }

  const whereClause =
    filters.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`
      : Prisma.empty;

  const countRows = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "clients" c
    ${whereClause}
  `;

  const clients = await db.$queryRaw<ClientRow[]>`
    SELECT
      c."id",
      c."name",
      c."collegeName",
      c."email",
      c."phone",
      c."country",
      c."serviceName",
      c."projectName",
      c."tags",
      c."isActive",
      c."createdAt",
      COUNT(a."id")::bigint AS "activityCount"
    FROM "clients" c
    LEFT JOIN "activity_logs" a
      ON a."entityType" = 'client'
      AND a."entityId" = c."id"
    ${whereClause}
    GROUP BY c."id"
    ORDER BY c."createdAt" DESC
    OFFSET ${offset}
    LIMIT ${pageSize}
  `;

  const total = Number(countRows[0]?.count || 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const items: ClientListItem[] = clients.map((client) => ({
    ...client,
    activityCount: Number(client.activityCount || 0),
  }));

  return {
    clients: items,
    total,
    pages,
    page,
    pageSize,
    query,
    status,
  };
}

export async function getStoredColleges(): Promise<StoredCollegeEntry[]> {
  await requireClientModuleAccess();
  await ensureCollegeDirectoryTable();

  const [directoryRows, clientRows] = await Promise.all([
    db.$queryRaw<StoredCollegeEntry[]>`
      SELECT "id", "name", "address"
      FROM "college_directory"
      ORDER BY LOWER("name") ASC
    `,
    db.client.findMany({
      where: {
        collegeName: {
          not: null,
        },
      },
      select: {
        collegeName: true,
        address: true,
      },
      distinct: ["collegeName"],
      orderBy: {
        collegeName: "asc",
      },
    }),
  ]);

  const merged = new Map<string, StoredCollegeEntry>();

  for (const row of directoryRows) {
    const normalizedName = row.name.trim().toLowerCase();
    if (!normalizedName) {
      continue;
    }

    merged.set(normalizedName, {
      id: row.id,
      name: row.name.trim(),
      address: row.address?.trim() || null,
    });
  }

  for (const row of clientRows) {
    const normalizedName = row.collegeName?.trim().toLowerCase() || "";
    if (!normalizedName || merged.has(normalizedName)) {
      continue;
    }

    merged.set(normalizedName, {
      id: `client-${normalizedName}`,
      name: row.collegeName?.trim() || "",
      address: row.address?.trim() || null,
    });
  }

  return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export async function createStoredCollege(input: { name: string; address?: string }) {
  const user = await requireClientActionPermission("CREATE");
  await ensureCollegeDirectoryTable();

  const name = input.name.trim();
  const address = input.address?.trim() || null;

  if (!name) {
    return { error: "College name is required" };
  }

  if (name.length > 160) {
    return { error: "College name must be 160 characters or fewer" };
  }

  if (address && address.length > 1000) {
    return { error: "College address must be 1000 characters or fewer" };
  }

  const existingRows = await db.$queryRaw<StoredCollegeEntry[]>`
    SELECT "id", "name", "address"
    FROM "college_directory"
    WHERE LOWER("name") = LOWER(${name})
    LIMIT 1
  `;

  const existing = existingRows[0];

  if (existing) {
    if (address && address !== (existing.address || "")) {
      const updatedRows = await db.$queryRaw<StoredCollegeEntry[]>`
        UPDATE "college_directory"
        SET "address" = ${address}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${existing.id}
        RETURNING "id", "name", "address"
      `;

      revalidatePath("/clients");
      return { success: true, data: updatedRows[0] };
    }

    return { success: true, data: existing };
  }

  const insertedRows = await db.$queryRaw<StoredCollegeEntry[]>`
    INSERT INTO "college_directory" ("id", "name", "address")
    VALUES (${randomUUID()}, ${name}, ${address})
    RETURNING "id", "name", "address"
  `;

  const college = insertedRows[0];

  await logActivity({
    action: "CREATE",
    entityType: "college_directory",
    entityId: college.id,
    createdById: user.id,
    metadata: { name: college.name },
  });

  revalidatePath("/clients");
  return { success: true, data: college };
}

export async function getStoredCollegeNames() {
  const colleges = await getStoredColleges();
  return colleges.map((college) => college.name);
}

export async function getStoredCollegeNamesLegacy() {
  const rows = await db.client.findMany({
    where: {
      collegeName: {
        not: null,
      },
    },
    select: {
      collegeName: true,
    },
    distinct: ["collegeName"],
    orderBy: {
      collegeName: "asc",
    },
  });

  return rows
    .map((row) => row.collegeName?.trim() || "")
    .filter(Boolean);
}

export async function exportClientsCsv(input: { query?: string; status?: ClientStatusFilter } = {}) {
  await requireClientModuleAccess();

  const status =
    input.status === "active" || input.status === "inactive" ? input.status : "all";
  const clients = await db.client.findMany({
    where: buildClientWhereInput(input.query, status),
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      email: true,
      phone: true,
      collegeName: true,
      country: true,
      serviceName: true,
      projectName: true,
      tags: true,
      isActive: true,
      createdAt: true,
    },
  });

  const escapeCsvCell = (value: string | boolean | Date | null) =>
    `"${String(value ?? "")
      .replace(/"/g, '""')}"`;

  const lines = [
    [
      "Name",
      "Email",
      "Phone",
      "College",
      "Country",
      "Service Name",
      "Project Name",
      "Tags",
      "Status",
      "Created At",
    ]
      .map(escapeCsvCell)
      .join(","),
    ...clients.map((client) =>
      [
        client.name,
        client.email,
        client.phone,
        client.collegeName,
        client.country,
        client.serviceName,
        client.projectName,
        client.tags,
        client.isActive ? "Active" : "Inactive",
        client.createdAt.toISOString().split("T")[0],
      ]
        .map(escapeCsvCell)
        .join(",")
    ),
  ];

  return lines.join("\n");
}

export async function getClient(id: string) {
  await requireClientModuleAccess();
  const rows = await db.$queryRaw<
    {
      id: string;
      name: string;
      collegeName: string | null;
      email: string;
      phone: string | null;
      street: string | null;
      city: string | null;
      zip: string | null;
      state: string | null;
      country: string | null;
      serviceName: string | null;
      projectName: string | null;
      tags: string | null;
      address: string | null;
      notes: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    }[]
  >`
    SELECT
      "id",
      "name",
      "collegeName",
      "email",
      "phone",
      "street",
      "city",
      "zip",
      "state",
      "country",
      "serviceName",
      "projectName",
      "tags",
      "address",
      "notes",
      "isActive",
      "createdAt",
      "updatedAt"
    FROM "clients"
    WHERE "id" = ${id}
    LIMIT 1
  `;

  return rows[0] || null;
}

export async function createClient(formData: FormData) {
  const user = await requireClientActionPermission("CREATE");

  const validatedFields = createClientSchema.safeParse({
    name: formData.get("name"),
    collegeName: formData.get("collegeName") || undefined,
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    street: formData.get("street") || undefined,
    city: formData.get("city") || undefined,
    zip: formData.get("zip") || undefined,
    state: formData.get("state") || undefined,
    country: formData.get("country") || undefined,
    serviceName: formData.get("serviceName") || undefined,
    projectName: formData.get("projectName") || undefined,
    tags: formData.get("tags") || undefined,
    address: formData.get("address") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!validatedFields.success) {
    return { error: validatedFields.error.flatten().fieldErrors };
  }
  const email = validatedFields.data.email.trim().toLowerCase();
  let client: { id: string; name: string; email: string };

  try {
    client = await db.client.create({
      data: {
        name: validatedFields.data.name,
        collegeName: validatedFields.data.collegeName || null,
        email,
        phone: validatedFields.data.phone || null,
        street: validatedFields.data.street || null,
        city: validatedFields.data.city || null,
        zip: validatedFields.data.zip || null,
        state: validatedFields.data.state || null,
        country: validatedFields.data.country || null,
        serviceName: validatedFields.data.serviceName || null,
        projectName: validatedFields.data.projectName || null,
        tags: validatedFields.data.tags || null,
        address: validatedFields.data.address || null,
        notes: validatedFields.data.notes || null,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return { error: "Email already exists" };
      }
      if (error.code === "P2024") {
        return {
          error:
            "Database is busy right now. Please try again in a few seconds.",
        };
      }
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return {
        error:
          "Cannot connect to the database right now. Please check your DB connection and try again.",
      };
    }

    return {
      error:
        "Unable to create client due to a temporary server issue. Please try again.",
    };
  }

  await logActivity({
    action: "CREATE",
    entityType: "client",
    entityId: client.id,
    createdById: user.id,
    metadata: { name: client.name, email: client.email },
  });

  revalidatePath("/clients");
  return { success: true, data: client };
}

export async function importClientsFromRecords(records: ImportClientRecordInput[]) {
  const user = await requireClientActionPermission("CREATE");

  if (!Array.isArray(records) || records.length === 0) {
    return { error: "Please upload a CSV file with at least one contact row" };
  }

  if (records.length > 250) {
    return { error: "Please import 250 contacts or fewer at a time" };
  }

  const results: ImportClientRecordResult[] = [];

  for (const record of records) {
    const normalizedRow = createNormalizedImportRow(record.values);
    const name = getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.name);
    const email = getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.email).toLowerCase();

    if (!name) {
      results.push({
        rowNumber: record.rowNumber,
        clientName: "",
        success: false,
        message: "Contact name is required",
      });
      continue;
    }

    const validatedFields = createClientSchema.safeParse({
      name,
      email,
      phone: getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.phone) || undefined,
      collegeName: getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.collegeName) || undefined,
      street: getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.street) || undefined,
      city: getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.city) || undefined,
      zip: getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.zip) || undefined,
      state: getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.state) || undefined,
      country: getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.country) || undefined,
      serviceName: getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.serviceName) || undefined,
      projectName: getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.projectName) || undefined,
      tags: getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.tags) || undefined,
      address: getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.address) || undefined,
      notes: getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.notes) || undefined,
    });

    if (!validatedFields.success) {
      results.push({
        rowNumber: record.rowNumber,
        clientName: name,
        success: false,
        message: formatClientImportError(validatedFields.error.flatten().fieldErrors),
      });
      continue;
    }

    try {
      const createdClient = await db.client.create({
        data: {
          name: validatedFields.data.name,
          email: validatedFields.data.email.trim().toLowerCase(),
          phone: validatedFields.data.phone || null,
          collegeName: validatedFields.data.collegeName || null,
          street: validatedFields.data.street || null,
          city: validatedFields.data.city || null,
          zip: validatedFields.data.zip || null,
          state: validatedFields.data.state || null,
          country: validatedFields.data.country || null,
          serviceName: validatedFields.data.serviceName || null,
          projectName: validatedFields.data.projectName || null,
          tags: validatedFields.data.tags || null,
          address: validatedFields.data.address || null,
          notes: validatedFields.data.notes || null,
          isActive: resolveImportedClientActiveState(
            getImportField(normalizedRow, CLIENT_IMPORT_FIELD_ALIASES.isActive)
          ),
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      await logActivity({
        action: "CREATE",
        entityType: "client",
        entityId: createdClient.id,
        createdById: user.id,
        metadata: { name: createdClient.name, email: createdClient.email, source: "csv_import" },
      });

      results.push({
        rowNumber: record.rowNumber,
        clientName: createdClient.name,
        success: true,
        message: "Contact imported successfully",
      });
    } catch (error) {
      let message = "Unable to import contact";

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        message = "Email already exists";
      }

      results.push({
        rowNumber: record.rowNumber,
        clientName: name,
        success: false,
        message,
      });
    }
  }

  revalidatePath("/clients");

  const importedCount = results.filter((result) => result.success).length;
  const failedCount = results.length - importedCount;

  return {
    success: failedCount === 0,
    importedCount,
    failedCount,
    results,
  };
}

export async function updateClient(id: string, formData: FormData) {
  const user = await requireClientActionPermission("UPDATE");

  const validatedFields = updateClientSchema.safeParse({
    name: formData.get("name") || undefined,
    collegeName: formData.get("collegeName") || undefined,
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    street: formData.get("street") || undefined,
    city: formData.get("city") || undefined,
    zip: formData.get("zip") || undefined,
    state: formData.get("state") || undefined,
    country: formData.get("country") || undefined,
    serviceName: formData.get("serviceName") || undefined,
    projectName: formData.get("projectName") || undefined,
    tags: formData.get("tags") || undefined,
    address: formData.get("address") || undefined,
    notes: formData.get("notes") || undefined,
    isActive: formData.get("isActive")
      ? formData.get("isActive") === "true"
      : undefined,
  });

  if (!validatedFields.success) {
    return { error: validatedFields.error.flatten().fieldErrors };
  }

  const current = await getClient(id);
  if (!current) {
    return { error: "Client not found" };
  }

  if (validatedFields.data.email && validatedFields.data.email !== current.email) {
    const existing = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "clients" WHERE "email" = ${validatedFields.data.email} AND "id" <> ${id} LIMIT 1
    `;

    if (existing.length > 0) {
      return { error: "Email already exists" };
    }
  }

  const rows = await db.$queryRaw<
    {
      id: string;
      name: string;
      email: string;
      isActive: boolean;
    }[]
  >`
    UPDATE "clients"
    SET
      "name" = ${validatedFields.data.name ?? current.name},
      "collegeName" = ${validatedFields.data.collegeName ?? current.collegeName},
      "email" = ${validatedFields.data.email ?? current.email},
      "phone" = ${validatedFields.data.phone ?? current.phone},
      "street" = ${validatedFields.data.street ?? current.street},
      "city" = ${validatedFields.data.city ?? current.city},
      "zip" = ${validatedFields.data.zip ?? current.zip},
      "state" = ${validatedFields.data.state ?? current.state},
      "country" = ${validatedFields.data.country ?? current.country},
      "serviceName" = ${validatedFields.data.serviceName ?? current.serviceName},
      "projectName" = ${validatedFields.data.projectName ?? current.projectName},
      "tags" = ${validatedFields.data.tags ?? current.tags},
      "address" = ${validatedFields.data.address ?? current.address},
      "notes" = ${validatedFields.data.notes ?? current.notes},
      "isActive" = ${validatedFields.data.isActive ?? current.isActive},
      "updatedAt" = NOW()
    WHERE "id" = ${id}
    RETURNING "id", "name", "email", "isActive"
  `;

  const updated = rows[0];

  await logActivity({
    action: "UPDATE",
    entityType: "client",
    entityId: id,
    createdById: user.id,
    metadata: { changes: Object.keys(validatedFields.data) },
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { success: true, data: updated };
}

export async function deleteClient(id: string) {
  const user = await requireClientActionPermission("DELETE");
  const client = await getClient(id);

  if (!client) {
    return { error: "Client not found" };
  }

  await db.$executeRaw`
    DELETE FROM "clients" WHERE "id" = ${id}
  `;

  await logActivity({
    action: "DELETE",
    entityType: "client",
    entityId: id,
    createdById: user.id,
    metadata: { name: client.name, email: client.email },
  });

  revalidatePath("/clients");
  return { success: true };
}

export async function toggleClientStatus(id: string) {
  const client = await getClient(id);

  if (!client) {
    return { error: "Client not found" };
  }

  const formData = new FormData();
  formData.set("name", client.name);
  if (client.collegeName) formData.set("collegeName", client.collegeName);
  formData.set("email", client.email);
  if (client.phone) formData.set("phone", client.phone);
  if (client.street) formData.set("street", client.street);
  if (client.city) formData.set("city", client.city);
  if (client.zip) formData.set("zip", client.zip);
  if (client.state) formData.set("state", client.state);
  if (client.country) formData.set("country", client.country);
  if (client.serviceName) formData.set("serviceName", client.serviceName);
  if (client.projectName) formData.set("projectName", client.projectName);
  if (client.tags) formData.set("tags", client.tags);
  if (client.address) formData.set("address", client.address);
  if (client.notes) formData.set("notes", client.notes);
  formData.set("isActive", (!client.isActive).toString());

  return updateClient(id, formData);
}

export async function addClientNote(id: string, note: string) {
  const user = await requireClientActionPermission("UPDATE");
  const trimmed = note.trim();

  if (!trimmed) {
    return { error: "Note is required" };
  }

  const client = await getClient(id);
  if (!client) {
    return { error: "Client not found" };
  }

  await logActivity({
    action: "UPDATE",
    entityType: "client",
    entityId: id,
    createdById: user.id,
    metadata: {
      note: trimmed,
      name: client.name,
      email: client.email,
    },
  });

  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
  return { success: true };
}

export async function getClientActivityLogs(clientId: string, limit = 20) {
  await requireClientModuleAccess();

  return db.activityLog.findMany({
    where: {
      entityType: "client",
      entityId: clientId,
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(100, limit)),
    include: {
      createdBy: { select: { name: true } },
    },
  });
}
