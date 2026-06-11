#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_TABLES = new Set([
  'chat_messages',
  'expenses',
  'profiles',
  'settlement_members',
  'settlements'
]);

const REQUIRED_COLUMNS = {
  chat_messages: [
    'id',
    'settlement_id',
    'user_id',
    'content',
    'created_at',
    'is_edited',
    'is_deleted',
    'is_hidden_admin'
  ],
  expenses: [
    'id',
    'created_at',
    'settlement_id',
    'name',
    'original_amount',
    'currency',
    'amount',
    'payer',
    'split',
    'shares',
    'expense_date',
    'user_id'
  ],
  profiles: ['user_id', 'nickname', 'created_at', 'admin_pin'],
  settlement_members: [
    'id',
    'settlement_id',
    'user_id',
    'email',
    'provider',
    'joined_at',
    'last_read_at'
  ],
  settlements: [
    'id',
    'created_at',
    'title',
    'date',
    'participants',
    'base_currency',
    'is_settled',
    'user_id',
    'invite_code',
    'deleted_at'
  ]
};

const REQUIRED_INDEXES = new Set([
  'idx_chat_messages_settlement_id',
  'idx_expenses_settlement_id',
  'idx_expenses_user_id',
  'idx_settlement_members_settlement_id',
  'idx_settlement_members_user_id'
]);

const REQUIRED_RPCS = new Set([
  'delete_user',
  'get_my_admin_pin',
  'get_public_settlement_by_invite_code',
  'get_settlement_id_by_invite_code',
  'join_settlement_by_invite_code',
  'kick_member',
  'set_my_admin_pin'
]);

const PRIVATE_RPCS = new Set([
  'delete_user',
  'get_my_admin_pin',
  'get_settlement_id_by_invite_code',
  'join_settlement_by_invite_code',
  'kick_member',
  'set_my_admin_pin'
]);

const SEVERITY_WEIGHT = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

function stripIdentifierQuotes(value) {
  return value.replaceAll('"', '').trim();
}

function objectName(value) {
  const clean = stripIdentifierQuotes(value)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, '');
  return clean.split('.').at(-1)?.toLowerCase() ?? '';
}

function roleNames(value) {
  return stripIdentifierQuotes(value)
    .split(',')
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
}

function statementHead(statement) {
  return statement.replace(/\s+/g, ' ').trim().slice(0, 240);
}

export function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let state = 'normal';
  let dollarTag = '';

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (state === 'line-comment') {
      current += char;
      if (char === '\n') state = 'normal';
      continue;
    }

    if (state === 'block-comment') {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        index += 1;
        state = 'normal';
      }
      continue;
    }

    if (state === 'single-quote') {
      current += char;
      if (char === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (char === "'") {
        state = 'normal';
      }
      continue;
    }

    if (state === 'double-quote') {
      current += char;
      if (char === '"' && next === '"') {
        current += next;
        index += 1;
      } else if (char === '"') {
        state = 'normal';
      }
      continue;
    }

    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length - 1;
        state = 'normal';
      } else {
        current += char;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      current += char + next;
      index += 1;
      state = 'line-comment';
      continue;
    }

    if (char === '/' && next === '*') {
      current += char + next;
      index += 1;
      state = 'block-comment';
      continue;
    }

    if (char === "'") {
      current += char;
      state = 'single-quote';
      continue;
    }

    if (char === '"') {
      current += char;
      state = 'double-quote';
      continue;
    }

    if (char === '$') {
      const match = sql.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        index += dollarTag.length - 1;
        state = 'dollar-quote';
        continue;
      }
    }

    if (char === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

function splitTopLevel(value) {
  const parts = [];
  let current = '';
  let depth = 0;
  let quote = '';

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (quote) {
      current += char;
      if (char === quote && next === quote) {
        current += next;
        index += 1;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
    } else if (char === '(') {
      depth += 1;
      current += char;
    } else if (char === ')') {
      depth -= 1;
      current += char;
    } else if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function tableColumns(statement) {
  const open = statement.indexOf('(');
  const close = statement.lastIndexOf(')');
  if (open === -1 || close <= open) return new Set();

  const ignored = new Set([
    'check',
    'constraint',
    'exclude',
    'foreign',
    'primary',
    'unique'
  ]);

  return new Set(
    splitTopLevel(statement.slice(open + 1, close))
      .map((entry) => entry.match(/^\s*"?([A-Za-z_][\w$]*)"?\s+/)?.[1]?.toLowerCase())
      .filter((name) => name && !ignored.has(name))
  );
}

export function inventorySchema(sql) {
  const inventory = {
    tables: new Map(),
    functions: new Map(),
    indexes: new Set(),
    policies: new Map(),
    rlsTables: new Set(),
    statements: splitSqlStatements(sql)
  };

  for (const statement of inventory.statements) {
    const tableMatch = statement.match(
      /^create\s+table(?:\s+if\s+not\s+exists)?\s+(?:"?public"?\s*\.\s*)?"?([A-Za-z_][\w$]*)"?/i
    );
    if (tableMatch) {
      inventory.tables.set(tableMatch[1].toLowerCase(), tableColumns(statement));
      continue;
    }

    const functionMatch = statement.match(
      /^create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\s*\.\s*)?"?([A-Za-z_][\w$]*)"?/i
    );
    if (functionMatch) {
      inventory.functions.set(functionMatch[1].toLowerCase(), statement);
      continue;
    }

    const indexMatch = statement.match(
      /^create\s+(?:unique\s+)?index\s+"?([A-Za-z_][\w$]*)"?/i
    );
    if (indexMatch) {
      inventory.indexes.add(indexMatch[1].toLowerCase());
      continue;
    }

    const policyMatch = statement.match(
      /^create\s+policy\s+("(?:""|[^"])+"|[^\s]+)\s+on\s+(?:"?public"?\s*\.\s*)?"?([A-Za-z_][\w$]*)"?/i
    );
    if (policyMatch) {
      const name = stripIdentifierQuotes(policyMatch[1]).toLowerCase();
      const table = policyMatch[2].toLowerCase();
      inventory.policies.set(`${table}:${name}`, statement);
      continue;
    }

    const rlsMatch = statement.match(
      /^alter\s+table\s+(?:only\s+)?(?:"?public"?\s*\.\s*)?"?([A-Za-z_][\w$]*)"?\s+enable\s+row\s+level\s+security/i
    );
    if (rlsMatch) inventory.rlsTables.add(rlsMatch[1].toLowerCase());
  }

  return inventory;
}

function addFinding(findings, severity, code, message, evidence = '') {
  findings.push({
    severity,
    code,
    message,
    evidence: evidence ? statementHead(evidence) : ''
  });
}

function inspectPolicies(inventory, findings) {
  for (const [key, statement] of inventory.policies) {
    const [table, name] = key.split(':');
    if (!APP_TABLES.has(table)) continue;

    const command =
      statement.match(/\bfor\s+(select|insert|update|delete|all)\b/i)?.[1]?.toLowerCase() ??
      'all';
    const rolesClause = statement.match(
      /\bto\s+(.+?)(?=\busing\b|\bwith\s+check\b|$)/is
    )?.[1];
    const roles = rolesClause ? roleNames(rolesClause) : ['public'];
    const publicRole = roles.some((role) => role === 'anon' || role === 'public');
    const authenticatedRole = roles.includes('authenticated');
    const unconditional =
      /\busing\s*\(\s*true\s*\)/i.test(statement) ||
      /\bwith\s+check\s*\(\s*true\s*\)/i.test(statement);
    const publicProfileRead =
      table === 'profiles' && command === 'select' && publicRole;

    if (unconditional && publicRole && !publicProfileRead) {
      addFinding(
        findings,
        'critical',
        'PUBLIC_UNCONDITIONAL_POLICY',
        `${table}.${name} permits unconditional ${command.toUpperCase()} for ${roles.join(', ')}.`,
        statement
      );
    } else if (unconditional && authenticatedRole && !publicProfileRead) {
      addFinding(
        findings,
        'high',
        'AUTHENTICATED_UNCONDITIONAL_POLICY',
        `${table}.${name} permits every authenticated user to perform ${command.toUpperCase()}.`,
        statement
      );
    }

    if (
      /auth\s*\.\s*jwt\s*\(\s*\)/i.test(statement) &&
      /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(statement)
    ) {
      addFinding(
        findings,
        'medium',
        'HARDCODED_ADMIN_EMAIL',
        `${table}.${name} embeds an administrator email in an RLS policy.`,
        statement
      );
    }
  }
}

function inspectGrants(inventory, findings) {
  for (const statement of inventory.statements) {
    const grantMatch = statement.match(
      /^grant\s+(.+?)\s+on\s+(table|sequence|function)\s+(.+?)\s+to\s+(.+?)(?:\s+with\s+grant\s+option)?$/is
    );
    if (!grantMatch) continue;

    const privileges = grantMatch[1].replace(/\s+/g, ' ').trim().toLowerCase();
    const kind = grantMatch[2].toLowerCase();
    const target = objectName(grantMatch[3]);
    const roles = roleNames(grantMatch[4]);
    const publicRole = roles.some((role) => role === 'anon' || role === 'public');

    if (kind === 'function' && publicRole && PRIVATE_RPCS.has(target)) {
      addFinding(
        findings,
        'critical',
        'PRIVATE_RPC_PUBLIC_EXECUTE',
        `${target} can be executed by ${roles.join(', ')}.`,
        statement
      );
    }

    if (kind === 'table' && publicRole && APP_TABLES.has(target)) {
      const safeProfileSelect =
        target === 'profiles' &&
        privileges.startsWith('select') &&
        !privileges.includes('all');

      if (!safeProfileSelect) {
        addFinding(
          findings,
          privileges.includes('all') ? 'critical' : 'high',
          'PUBLIC_TABLE_GRANT',
          `${roles.join(', ')} has ${privileges.toUpperCase()} on ${target}.`,
          statement
        );
      }
    }
  }

  for (const statement of inventory.statements) {
    if (
      /^alter\s+default\s+privileges/i.test(statement) &&
      /\bgrant\s+all\b/i.test(statement) &&
      /\bto\s+"?(?:anon|public)"?\b/i.test(statement)
    ) {
      addFinding(
        findings,
        'high',
        'PUBLIC_DEFAULT_PRIVILEGES',
        'New public-schema objects inherit broad anonymous privileges.',
        statement
      );
    }
  }
}

function inspectFunctions(inventory, findings) {
  for (const [name, statement] of inventory.functions) {
    if (!/\bsecurity\s+definer\b/i.test(statement)) continue;

    const emptySearchPath =
      /\bset\s+"?search_path"?\s*(?:=|to)\s*''/i.test(statement) ||
      /\bset\s+"?search_path"?\s*(?:=|to)\s*""/i.test(statement);

    if (!emptySearchPath) {
      addFinding(
        findings,
        'high',
        'UNSAFE_SECURITY_DEFINER_SEARCH_PATH',
        `${name} is SECURITY DEFINER without an empty search_path.`,
        statement
      );
    }
  }
}

export function auditSchema(sql, baselineSql = '') {
  const inventory = inventorySchema(sql);
  const findings = [];

  for (const [table, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const columns = inventory.tables.get(table);
    if (!columns) {
      addFinding(findings, 'critical', 'MISSING_APP_TABLE', `Required table ${table} is missing.`);
      continue;
    }

    for (const column of requiredColumns) {
      if (!columns.has(column)) {
        addFinding(
          findings,
          'high',
          'MISSING_REQUIRED_COLUMN',
          `${table}.${column} is missing.`
        );
      }
    }

    if (!inventory.rlsTables.has(table)) {
      addFinding(
        findings,
        'critical',
        'RLS_DISABLED',
        `Row Level Security is not enabled on ${table}.`
      );
    }
  }

  for (const rpc of REQUIRED_RPCS) {
    if (!inventory.functions.has(rpc)) {
      addFinding(findings, 'medium', 'MISSING_REQUIRED_RPC', `Required RPC ${rpc} is missing.`);
    }
  }

  for (const index of REQUIRED_INDEXES) {
    if (!inventory.indexes.has(index)) {
      addFinding(findings, 'low', 'MISSING_RECOMMENDED_INDEX', `Recommended index ${index} is missing.`);
    }
  }

  inspectPolicies(inventory, findings);
  inspectGrants(inventory, findings);
  inspectFunctions(inventory, findings);

  const baseline = baselineSql ? inventorySchema(baselineSql) : null;
  const drift = baseline
    ? {
        missingTables: [...baseline.tables.keys()].filter((name) => !inventory.tables.has(name)),
        extraTables: [...inventory.tables.keys()].filter((name) => !baseline.tables.has(name)),
        missingFunctions: [...baseline.functions.keys()].filter(
          (name) => !inventory.functions.has(name)
        ),
        extraFunctions: [...inventory.functions.keys()].filter(
          (name) => !baseline.functions.has(name)
        ),
        missingIndexes: [...baseline.indexes].filter((name) => !inventory.indexes.has(name)),
        extraIndexes: [...inventory.indexes].filter((name) => !baseline.indexes.has(name)),
        missingPolicies: [...baseline.policies.keys()].filter(
          (name) => !inventory.policies.has(name)
        ),
        extraPolicies: [...inventory.policies.keys()].filter(
          (name) => !baseline.policies.has(name)
        )
      }
    : null;

  findings.sort(
    (left, right) =>
      SEVERITY_WEIGHT[right.severity] - SEVERITY_WEIGHT[left.severity] ||
      left.code.localeCompare(right.code)
  );

  return {
    findings,
    drift,
    summary: {
      critical: findings.filter((finding) => finding.severity === 'critical').length,
      high: findings.filter((finding) => finding.severity === 'high').length,
      medium: findings.filter((finding) => finding.severity === 'medium').length,
      low: findings.filter((finding) => finding.severity === 'low').length
    }
  };
}

function markdownList(values) {
  return values.length ? values.map((value) => `\`${value}\``).join(', ') : 'None';
}

export function formatAuditReport(result, sourceName, baselineName = '') {
  const lines = [
    '# Supabase Schema Security Audit',
    '',
    `- Source: \`${sourceName}\``,
    ...(baselineName ? [`- Baseline: \`${baselineName}\``] : []),
    `- Findings: ${result.summary.critical} critical, ${result.summary.high} high, ${result.summary.medium} medium, ${result.summary.low} low`,
    ''
  ];

  if (result.drift) {
    lines.push(
      '## Object Drift',
      '',
      `- Missing tables: ${markdownList(result.drift.missingTables)}`,
      `- Extra tables: ${markdownList(result.drift.extraTables)}`,
      `- Missing functions: ${markdownList(result.drift.missingFunctions)}`,
      `- Extra functions: ${markdownList(result.drift.extraFunctions)}`,
      `- Missing indexes: ${markdownList(result.drift.missingIndexes)}`,
      `- Extra indexes: ${markdownList(result.drift.extraIndexes)}`,
      `- Missing policies: ${markdownList(result.drift.missingPolicies)}`,
      `- Extra policies: ${markdownList(result.drift.extraPolicies)}`,
      ''
    );
  }

  lines.push('## Findings', '');
  if (!result.findings.length) {
    lines.push('No security-contract findings.');
  } else {
    lines.push('| Severity | Code | Finding |', '| --- | --- | --- |');
    for (const finding of result.findings) {
      lines.push(
        `| ${finding.severity.toUpperCase()} | \`${finding.code}\` | ${finding.message.replaceAll('|', '\\|')} |`
      );
    }
  }

  lines.push(
    '',
    '> This audit is read-only. It inspects a schema dump and never connects to or modifies a database.',
    ''
  );
  return lines.join('\n');
}

function parseArguments(argv) {
  const options = {
    schema: '',
    baseline: '',
    output: '',
    json: '',
    failOn: 'high'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--baseline') options.baseline = argv[++index] ?? '';
    else if (argument === '--output') options.output = argv[++index] ?? '';
    else if (argument === '--json') options.json = argv[++index] ?? '';
    else if (argument === '--fail-on') options.failOn = argv[++index] ?? '';
    else if (!argument.startsWith('--') && !options.schema) options.schema = argument;
    else throw new Error(`Unknown argument: ${argument}`);
  }

  if (!options.schema) {
    throw new Error(
      'Usage: node scripts/audit-supabase-schema.mjs <schema.sql> [--baseline baseline.sql] [--output report.md] [--json report.json] [--fail-on critical|high|medium|low|none]'
    );
  }

  if (!['critical', 'high', 'medium', 'low', 'none'].includes(options.failOn)) {
    throw new Error(`Invalid --fail-on value: ${options.failOn}`);
  }

  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const schemaPath = resolve(options.schema);
  const baselinePath = options.baseline ? resolve(options.baseline) : '';
  const [sql, baselineSql] = await Promise.all([
    readFile(schemaPath, 'utf8'),
    baselinePath ? readFile(baselinePath, 'utf8') : Promise.resolve('')
  ]);

  const result = auditSchema(sql, baselineSql);
  const report = formatAuditReport(
    result,
    basename(schemaPath),
    baselinePath ? basename(baselinePath) : ''
  );

  if (options.output) await writeFile(resolve(options.output), report, 'utf8');
  if (options.json) {
    await writeFile(resolve(options.json), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${report}\n`);

  if (
    options.failOn !== 'none' &&
    result.findings.some(
      (finding) => SEVERITY_WEIGHT[finding.severity] >= SEVERITY_WEIGHT[options.failOn]
    )
  ) {
    process.exitCode = 2;
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
