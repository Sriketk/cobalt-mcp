/**
 * SQL query validation and guard layer.
 * Blocks dangerous operations and classifies queries as read/write.
 */

const BLOCKED_PATTERNS = [
  /\bTRUNCATE\b/i,
  /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX)\b/i,
  /\bALTER\s+(TABLE|DATABASE|SCHEMA)\b/i,
  /\bCREATE\s+(TABLE|DATABASE|SCHEMA|INDEX)\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
];

const DELETE_WITHOUT_WHERE = /\bDELETE\s+FROM\s+\S+\s*(?:;|$)/i;

const WRITE_PATTERNS = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
];

export type QueryClassification = "read" | "write";

export interface GuardResult {
  allowed: boolean;
  classification: QueryClassification;
  reason?: string;
}

/** Strip SQL comments and leading/trailing whitespace */
function stripComments(sql: string): string {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

export function validateQuery(sql: string): GuardResult {
  const cleaned = stripComments(sql);

  if (!cleaned) {
    return { allowed: false, classification: "read", reason: "Empty query" };
  }

  // Check for blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cleaned)) {
      return {
        allowed: false,
        classification: "write",
        reason: `Blocked: ${pattern.source} operations are not allowed`,
      };
    }
  }

  // Check for DELETE without WHERE
  if (DELETE_WITHOUT_WHERE.test(cleaned)) {
    return {
      allowed: false,
      classification: "write",
      reason: "DELETE without WHERE clause is not allowed",
    };
  }

  // Classify as read or write
  const isWrite = WRITE_PATTERNS.some((p) => p.test(cleaned));

  return {
    allowed: true,
    classification: isWrite ? "write" : "read",
  };
}

export function isReadOnly(sql: string): boolean {
  const result = validateQuery(sql);
  return result.allowed && result.classification === "read";
}
