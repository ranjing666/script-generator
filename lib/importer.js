const fs = require("fs");
const path = require("path");

const HEADER_DROP_LIST = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "host",
  "origin",
  "pragma",
  "priority",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "x-forwarded-for",
]);

const AUTH_KIND_SET = new Set(["auth_nonce", "auth_login"]);

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeName(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function looksLikeEthAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function looksLikeBearer(value) {
  return typeof value === "string" && /^Bearer\s+.+/i.test(value.trim());
}

function looksLikeSiweMessage(value) {
  if (typeof value !== "string") {
    return false;
  }

  const text = value.trim();
  return (
    /wants you to sign in with your ethereum account:/i.test(text) &&
    /\nURI:\s*/i.test(text) &&
    /\nVersion:\s*1/i.test(text) &&
    /\nChain ID:\s*\d+/i.test(text) &&
    /\nNonce:\s*/i.test(text)
  );
}

function flattenObject(input, prefix = "") {
  const rows = [];

  if (Array.isArray(input)) {
    input.forEach((item, index) => {
      rows.push(...flattenObject(item, `${prefix}[${index}]`));
    });
    return rows;
  }

  if (input && typeof input === "object") {
    Object.entries(input).forEach(([key, value]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      rows.push(...flattenObject(value, nextPrefix));
    });
    return rows;
  }

  rows.push({
    path: prefix,
    value: input,
  });
  return rows;
}

function tokenizeShell(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }

    if ((char === "'" || char === '"')) {
      if (!quote) {
        quote = char;
        continue;
      }

      if (quote === char) {
        quote = null;
        continue;
      }
    }

    if (!quote && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function parseBody(text, mimeType = "") {
  if (!text) {
    return undefined;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  if (mimeType.toLowerCase().includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = safeJsonParse(trimmed);
    if (parsed !== null) {
      return parsed;
    }
  }

  if (mimeType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(trimmed);
    const data = {};
    for (const [key, value] of params.entries()) {
      data[key] = value;
    }
    return data;
  }

  return trimmed;
}

function sanitizeHeaders(headers) {
  const output = {};

  (headers || []).forEach((header) => {
    const name = (header.name || header.key || "").trim();
    const value = header.value;
    if (!name) {
      return;
    }

    if (HEADER_DROP_LIST.has(name.toLowerCase())) {
      return;
    }

    output[name] = value;
  });

  return output;
}

function decodeHarContentText(content) {
  if (!content || typeof content.text !== "string") {
    return "";
  }

  const text = content.text;
  const encoding = String(content.encoding || "").toLowerCase();
  if (encoding !== "base64") {
    return text;
  }

  try {
    return Buffer.from(text, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function shouldParseJsonPayload(mimeType, text) {
  const trimmed = String(text || "").trim();
  return String(mimeType || "").toLowerCase().includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[");
}

function buildSummary(method, url) {
  try {
    const parsed = new URL(url);
    return `${method.toUpperCase()} ${parsed.pathname}${parsed.search || ""}`;
  } catch {
    return `${method.toUpperCase()} ${url}`;
  }
}

function isLikelyApiUrl(url) {
  return !/\.(css|js|png|jpg|jpeg|svg|woff|woff2|ico|map)(\?|$)/i.test(url);
}

function getUrlInfo(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      pathname: parsed.pathname,
      segments: parsed.pathname.split("/").filter(Boolean),
    };
  } catch {
    return {
      host: "",
      pathname: url,
      segments: String(url || "").split("/").filter(Boolean),
    };
  }
}

function guessRequestKind(request) {
  const url = String(request.url || "").toLowerCase();
  const method = String(request.method || "GET").toUpperCase();

  if (/(login|signin|authenticate|verify|connect-wallet|connectwallet|session)/.test(url)) {
    return "auth_login";
  }

  if (/(nonce|challenge|siwe|message-to-sign|message_to_sign|sign-message|signature-message|prepare)/.test(url)) {
    return "auth_nonce";
  }

  if (url.includes("checkin") || url.includes("check-in") || /\bdaily\b/.test(url)) {
    return "api_checkin";
  }

  if (url.includes("heartbeat") || url.includes("ping") || url.includes("refresh")) {
    return "api_heartbeat";
  }

  if (url.includes("faucet")) {
    return "api_faucet";
  }

  if (url.includes("claim")) {
    return "claim";
  }

  if (method === "GET" && /(list|tasks|mission|reward|rewards|quests)/.test(url)) {
    return "list";
  }

  return "request";
}

function buildRequestName(candidate, index) {
  try {
    const parsed = new URL(candidate.url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const lastPart = parts[parts.length - 1] || "request";
    return normalizeName(`${guessRequestKind(candidate)}_${lastPart}_${index + 1}`);
  } catch {
    return normalizeName(`${guessRequestKind(candidate)}_${index + 1}`);
  }
}

function parseCurlCommand(text, index = 0) {
  const normalized = text
    .replace(/\\\r?\n/g, " ")
    .replace(/\^\r?\n/g, " ")
    .replace(/`\r?\n/g, " ");
  const tokens = tokenizeShell(normalized);
  const headers = [];
  let method = "GET";
  let url = null;
  let body = undefined;
  let mimeType = "";

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token === "curl") {
      continue;
    }

    if (token === "-X" || token === "--request") {
      method = (tokens[i + 1] || method).toUpperCase();
      i += 1;
      continue;
    }

    if (token === "-H" || token === "--header") {
      const rawHeader = tokens[i + 1] || "";
      const headerIndex = rawHeader.indexOf(":");
      if (headerIndex > -1) {
        const name = rawHeader.slice(0, headerIndex).trim();
        const value = rawHeader.slice(headerIndex + 1).trim();
        headers.push({ name, value });
        if (name.toLowerCase() === "content-type") {
          mimeType = value;
        }
      }
      i += 1;
      continue;
    }

    if (
      token === "--data" ||
      token === "--data-raw" ||
      token === "--data-binary" ||
      token === "--data-urlencode" ||
      token === "-d"
    ) {
      body = parseBody(tokens[i + 1] || "", mimeType);
      if (method === "GET") {
        method = "POST";
      }
      i += 1;
      continue;
    }

    if (token === "--url") {
      url = tokens[i + 1] || url;
      i += 1;
      continue;
    }

    if (token === "-b" || token === "--cookie") {
      headers.push({
        name: "Cookie",
        value: tokens[i + 1] || "",
      });
      i += 1;
      continue;
    }

    if (/^https?:\/\//i.test(token)) {
      url = token;
    }
  }

  if (!url || !isLikelyApiUrl(url)) {
    return null;
  }

  const request = {
    id: `curl_${index + 1}`,
    sourceType: "curl",
    method,
    url,
    headers: sanitizeHeaders(headers),
    body,
    responseBody: null,
    originalIndex: index,
  };

  return {
    ...request,
    kind: guessRequestKind(request),
    summary: buildSummary(method, url),
    name: buildRequestName(request, index),
  };
}

function splitCurlCommands(text) {
  const lines = text.split(/\r?\n/);
  const commands = [];
  let current = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.length > 0) {
        commands.push(current.join("\n"));
        current = [];
      }
      return;
    }

    if (/^curl(\s|$)/i.test(trimmed) && current.length > 0) {
      commands.push(current.join("\n"));
      current = [line];
      return;
    }

    current.push(line);
  });

  if (current.length > 0) {
    commands.push(current.join("\n"));
  }

  return commands;
}

function parseCurlFile(filePath) {
  const fullPath = path.resolve(filePath);
  const text = fs.readFileSync(fullPath, "utf8");
  return splitCurlCommands(text)
    .map((command, index) => parseCurlCommand(command, index))
    .filter(Boolean);
}

function parseHarFile(filePath) {
  const fullPath = path.resolve(filePath);
  const har = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  const entries = har && har.log && Array.isArray(har.log.entries) ? har.log.entries : [];

  return entries
    .map((entry, index) => {
      const request = entry.request || {};
      const response = entry.response || {};
      const url = request.url;
      if (!url || !isLikelyApiUrl(url)) {
        return null;
      }

      const mimeType =
        (request.postData && request.postData.mimeType) ||
        (response.content && response.content.mimeType) ||
        "";
      const responseText = decodeHarContentText(response.content);
      const parsedResponse = shouldParseJsonPayload(response.content && response.content.mimeType, responseText)
        ? safeJsonParse(responseText)
        : null;

      const candidate = {
        id: `har_${index + 1}`,
        sourceType: "har",
        method: request.method || "GET",
        url,
        headers: sanitizeHeaders(request.headers),
        body: parseBody(request.postData && request.postData.text, mimeType),
        responseBody: parsedResponse,
        originalIndex: index,
      };

      return {
        ...candidate,
        kind: guessRequestKind(candidate),
        summary: buildSummary(candidate.method, candidate.url),
        name: buildRequestName(candidate, index),
      };
    })
    .filter(Boolean);
}

function flattenPostmanItems(items, trail = []) {
  const output = [];
  (items || []).forEach((item) => {
    const currentTrail = item && item.name ? [...trail, item.name] : trail;
    if (item && Array.isArray(item.item)) {
      output.push(...flattenPostmanItems(item.item, currentTrail));
      return;
    }

    if (item && item.request) {
      output.push({
        item,
        trail: currentTrail,
      });
    }
  });
  return output;
}

function normalizePostmanUrl(urlLike) {
  if (!urlLike) {
    return "";
  }

  if (typeof urlLike === "string") {
    return urlLike;
  }

  if (urlLike.raw && typeof urlLike.raw === "string") {
    return urlLike.raw;
  }

  const protocol = urlLike.protocol ? `${urlLike.protocol}://` : "";
  const host = Array.isArray(urlLike.host) ? urlLike.host.join(".") : String(urlLike.host || "");
  const pathName = Array.isArray(urlLike.path) ? urlLike.path.join("/") : String(urlLike.path || "");
  const query = Array.isArray(urlLike.query)
    ? urlLike.query
        .filter((entry) => entry && !entry.disabled && entry.key)
        .map((entry) => `${entry.key}=${entry.value || ""}`)
        .join("&")
    : "";
  const slash = pathName ? "/" : "";
  const suffix = query ? `?${query}` : "";
  return `${protocol}${host}${slash}${pathName}${suffix}`;
}

function parsePostmanBody(body) {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const mode = String(body.mode || "").toLowerCase();
  if (!mode) {
    return undefined;
  }

  if (mode === "raw") {
    const language = body.options && body.options.raw && body.options.raw.language;
    const mimeType = language === "json" ? "application/json" : "";
    return parseBody(body.raw || "", mimeType);
  }

  if (mode === "urlencoded") {
    const data = {};
    (body.urlencoded || []).forEach((entry) => {
      if (!entry || entry.disabled || !entry.key) {
        return;
      }
      data[entry.key] = entry.value || "";
    });
    return data;
  }

  if (mode === "graphql") {
    return {
      query: body.graphql && body.graphql.query ? body.graphql.query : "",
      variables: body.graphql && body.graphql.variables ? body.graphql.variables : {},
    };
  }

  if (mode === "formdata") {
    const data = {};
    (body.formdata || []).forEach((entry) => {
      if (!entry || entry.disabled || !entry.key || entry.type === "file") {
        return;
      }
      data[entry.key] = entry.value || "";
    });
    return data;
  }

  return undefined;
}

function toEnvKey(input, fallback = "VALUE") {
  const value = String(input || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return value || fallback;
}

function toPathToken(input, fallback = "value") {
  const value = String(input || "")
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!value) {
    return fallback;
  }
  if (/^\d/.test(value)) {
    return `_${value}`;
  }
  return value;
}

function mapPostmanVariable(expression) {
  const raw = String(expression || "").trim();
  const lower = raw.toLowerCase();

  if (/^(token|access[_-]?token|id[_-]?token|jwt)$/i.test(raw) || lower.includes("token")) {
    return "state.token";
  }

  if (/(wallet|address)/i.test(raw)) {
    return "account.address";
  }

  if (/(private[_-]?key)/i.test(raw)) {
    return "account.privateKey";
  }

  if (/(password|passcode|passwd|pwd)/i.test(raw)) {
    return /passcode/i.test(raw) ? "account.passcode" : "account.password";
  }

  if (/(email|username|loginid|account)/i.test(raw)) {
    return `account.${toPathToken(raw, "email")}`;
  }

  if (/(baseurl|base_url|host|domain|endpoint|api_url|apiurl)/i.test(lower)) {
    return "env.BASE_URL";
  }

  if (raw.startsWith("$")) {
    return `env.POSTMAN_DYNAMIC_${toEnvKey(raw.slice(1), "VALUE")}`;
  }

  return `env.POSTMAN_${toEnvKey(raw, "VALUE")}`;
}

function replacePostmanVariablesInString(text) {
  if (typeof text !== "string") {
    return text;
  }

  return text.replace(/{{\s*([^}]+)\s*}}/g, (_, expression) => `{{${mapPostmanVariable(expression)}}}`);
}

function replacePostmanVariables(input) {
  if (typeof input === "string") {
    return replacePostmanVariablesInString(input);
  }

  if (Array.isArray(input)) {
    return input.map((item) => replacePostmanVariables(item));
  }

  if (input && typeof input === "object") {
    const output = {};
    Object.entries(input).forEach(([key, value]) => {
      output[key] = replacePostmanVariables(value);
    });
    return output;
  }

  return input;
}

function parsePostmanExampleResponse(item) {
  const responses = Array.isArray(item.response) ? item.response : [];
  for (const response of responses) {
    if (!response || typeof response.body !== "string") {
      continue;
    }

    const contentTypeHeader = (response.header || []).find((header) =>
      String(header.key || header.name || "").toLowerCase() === "content-type"
    );
    const contentType = contentTypeHeader ? String(contentTypeHeader.value || "") : "";
    if (!shouldParseJsonPayload(contentType, response.body)) {
      continue;
    }

    const parsed = safeJsonParse(response.body);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function parsePostmanFile(filePath) {
  const fullPath = path.resolve(filePath);
  const collection = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  const flattenedItems = flattenPostmanItems(collection && collection.item ? collection.item : []);

  return flattenedItems
    .map(({ item, trail }, index) => {
      const request = item.request || {};
      const method = String(request.method || "GET").toUpperCase();
      const url = normalizePostmanUrl(request.url);
      if (!url || !isLikelyApiUrl(url)) {
        return null;
      }

      const candidate = {
        id: `postman_${index + 1}`,
        sourceType: "postman",
        method,
        url: replacePostmanVariables(url),
        headers: replacePostmanVariables(sanitizeHeaders(request.header || [])),
        body: replacePostmanVariables(parsePostmanBody(request.body)),
        responseBody: parsePostmanExampleResponse(item),
        originalIndex: index,
      };

      const fallbackName = buildRequestName(candidate, index);
      const itemName = normalizeName(item.name || trail[trail.length - 1]);
      return {
        ...candidate,
        kind: guessRequestKind(candidate),
        summary: buildSummary(method, url),
        name: itemName || fallbackName,
      };
    })
    .filter(Boolean);
}

function loadImportCandidates(sourceType, filePath) {
  if (sourceType === "har") {
    return parseHarFile(filePath);
  }

  if (sourceType === "postman") {
    return parsePostmanFile(filePath);
  }

  return parseCurlFile(filePath);
}

function findTokenPath(responseBody) {
  if (!responseBody || typeof responseBody !== "object") {
    return "data.token";
  }

  const rows = flattenObject(responseBody);
  const tokenMatch = rows.find(({ path, value }) => {
    const lowerPath = path.toLowerCase();
    return /(token|access_token|idtoken|jwt)/.test(lowerPath) && typeof value === "string" && value.length >= 12;
  });

  return tokenMatch ? tokenMatch.path : "data.token";
}

function findMessagePath(responseBody) {
  if (!responseBody || typeof responseBody !== "object") {
    return "data.message";
  }

  const rows = flattenObject(responseBody);
  const siweMatch = rows.find(({ value }) => looksLikeSiweMessage(value));
  if (siweMatch) {
    return siweMatch.path;
  }

  const messageMatch = rows.find(({ path, value }) => {
    const lowerPath = path.toLowerCase();
    return /(message|challenge|siwe|to_sign|sign_message)/.test(lowerPath) && typeof value === "string";
  });

  if (messageMatch) {
    return messageMatch.path;
  }

  const nonceAsString = rows.find(({ path, value }) => {
    const lowerPath = path.toLowerCase();
    return /(nonce)/.test(lowerPath) && typeof value === "string";
  });

  if (nonceAsString) {
    return nonceAsString.path;
  }

  return "data.message";
}

function findNoncePath(responseBody) {
  if (!responseBody || typeof responseBody !== "object") {
    return null;
  }

  const rows = flattenObject(responseBody);
  const nonceMatch = rows.find(({ path, value }) => {
    const lowerPath = path.toLowerCase();
    const isNonceLikePath = /(nonce|challenge)/.test(lowerPath);
    const isValidValue =
      typeof value === "number" ||
      (typeof value === "string" && value.trim().length >= 4 && value.trim().length <= 256);
    return isNonceLikePath && isValidValue;
  });

  return nonceMatch ? nonceMatch.path : null;
}

function findValueByPath(responseBody, expression) {
  if (!responseBody || !expression) {
    return undefined;
  }

  const rows = flattenObject(responseBody);
  const matched = rows.find(({ path }) => path === expression);
  return matched ? matched.value : undefined;
}

function parseSiweMessage(message) {
  if (!looksLikeSiweMessage(message)) {
    return null;
  }

  const lines = String(message).replace(/\r\n/g, "\n").split("\n");
  const headerLine = lines[0] || "";
  const headerMatch = headerLine.match(/^(.*)\s+wants you to sign in with your Ethereum account:\s*$/i);
  const domain = headerMatch ? headerMatch[1].trim() : null;

  let address = null;
  let addressIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(line)) {
      address = line;
      addressIndex = index;
      break;
    }
  }

  const fields = {};
  let firstFieldIndex = lines.length;
  lines.forEach((line, index) => {
    const matched = line.match(/^([A-Za-z ]+):\s*(.*)$/);
    if (!matched) {
      return;
    }

    const key = matched[1].trim().toLowerCase();
    const value = matched[2].trim();
    fields[key] = value;
    firstFieldIndex = Math.min(firstFieldIndex, index);
  });

  const statementStart = addressIndex >= 0 ? addressIndex + 1 : 1;
  const statementLines = lines.slice(statementStart, firstFieldIndex);
  while (statementLines.length > 0 && !statementLines[0].trim()) {
    statementLines.shift();
  }
  while (statementLines.length > 0 && !statementLines[statementLines.length - 1].trim()) {
    statementLines.pop();
  }

  const resourcesIndex = lines.findIndex((line) => /^Resources:\s*$/i.test(line.trim()));
  const resources =
    resourcesIndex >= 0
      ? lines
          .slice(resourcesIndex + 1)
          .map((line) => line.trim())
          .filter((line) => line.startsWith("- "))
          .map((line) => line.slice(2).trim())
      : [];

  return {
    domain,
    address,
    statement: statementLines.join("\n"),
    uri: fields.uri || null,
    version: fields.version || "1",
    chainId: fields["chain id"] || null,
    nonce: fields.nonce || null,
    issuedAt: fields["issued at"] || null,
    expirationTime: fields["expiration time"] || null,
    notBefore: fields["not before"] || null,
    requestId: fields["request id"] || null,
    resources,
  };
}

function inferSiweContext({ siweFields, nonceCandidate, loginCandidate }) {
  const nonceUrl = nonceCandidate && nonceCandidate.url ? nonceCandidate.url : "";
  const loginUrl = loginCandidate && loginCandidate.url ? loginCandidate.url : "";
  const fallbackHost = getUrlInfo(nonceUrl).host || getUrlInfo(loginUrl).host || "example.com";

  return {
    domain: siweFields.domain || fallbackHost,
    uri: siweFields.uri || `https://${fallbackHost}`,
    version: siweFields.version || "1",
    chainId: siweFields.chainId || 1,
  };
}

function buildSiweMessageTemplate(siweFields) {
  const lines = [];
  lines.push("{{auth.siwe.domain}} wants you to sign in with your Ethereum account:");
  lines.push("{{account.address}}");
  lines.push("");
  if (siweFields.statement) {
    lines.push(siweFields.statement);
    lines.push("");
  }
  lines.push("URI: {{auth.siwe.uri}}");
  lines.push("Version: {{auth.siwe.version}}");
  lines.push("Chain ID: {{auth.siwe.chainId}}");
  lines.push("Nonce: {{auth.nonce}}");
  if (siweFields.issuedAt) {
    lines.push("Issued At: {{now.iso}}");
  }
  if (siweFields.expirationTime) {
    lines.push("Expiration Time: {{now.isoPlus10m}}");
  }
  if (siweFields.notBefore) {
    lines.push(`Not Before: ${siweFields.notBefore}`);
  }
  if (siweFields.requestId) {
    lines.push(`Request ID: ${siweFields.requestId}`);
  }
  if (Array.isArray(siweFields.resources) && siweFields.resources.length > 0) {
    lines.push("Resources:");
    siweFields.resources.forEach((resource) => {
      lines.push(`- ${resource}`);
    });
  }

  return lines.join("\n");
}

function inferSiweMessageTemplate({ loginCandidate, nonceCandidate, noncePath }) {
  if (!loginCandidate || !loginCandidate.body || typeof loginCandidate.body !== "object") {
    return {
      messageTemplate: null,
      siwe: null,
    };
  }

  const loginRows = flattenObject(loginCandidate.body);
  const messageRow = loginRows.find(({ value }) => looksLikeSiweMessage(value));
  if (!messageRow || typeof messageRow.value !== "string") {
    return {
      messageTemplate: null,
      siwe: null,
    };
  }

  const siweFields = parseSiweMessage(messageRow.value);
  if (!siweFields) {
    return {
      messageTemplate: null,
      siwe: null,
    };
  }

  const nonceValue =
    nonceCandidate && noncePath ? findValueByPath(nonceCandidate.responseBody, noncePath) : undefined;
  if (!siweFields.nonce && nonceValue !== undefined && nonceValue !== null) {
    siweFields.nonce = String(nonceValue);
  }

  return {
    messageTemplate: buildSiweMessageTemplate(siweFields),
    siwe: inferSiweContext({
      siweFields,
      nonceCandidate,
      loginCandidate,
    }),
  };
}

function inferAccountSource(candidates) {
  const authCandidates = candidates.filter((item) => AUTH_KIND_SET.has(item.kind));

  if (
    authCandidates.some((candidate) => {
      const bodyRows = flattenObject(candidate.body || {});
      return bodyRows.some(({ path, value }) => {
        return /(email|password|passcode|loginid|username)/.test(path.toLowerCase()) && typeof value === "string";
      });
    })
  ) {
    return "accounts";
  }

  if (
    authCandidates.some((candidate) => {
      const bodyRows = flattenObject(candidate.body || {});
      return bodyRows.some(({ path, value }) => {
        return /(address|wallet|signature|nonce)/.test(path.toLowerCase()) || looksLikeEthAddress(value);
      });
    })
  ) {
    return "privateKeys";
  }

  const hasBearer = candidates.some((candidate) =>
    Object.values(candidate.headers || {}).some((value) => looksLikeBearer(value))
  );

  return hasBearer ? "tokens" : "tokens";
}

function inferAccountFields(candidate) {
  const defaults = ["email", "password"];
  if (!candidate || !candidate.body || typeof candidate.body !== "object" || Array.isArray(candidate.body)) {
    return defaults;
  }

  const fields = Object.keys(candidate.body).filter((key) =>
    /(email|password|passcode|loginid|username|account)/i.test(key)
  );

  return fields.length > 0 ? fields : defaults;
}

function inferAuthStrategy(candidates, accountSource) {
  const authCandidates = candidates.filter((candidate) => candidate.kind === "auth_login");
  const nonceCandidates = candidates.filter((candidate) => candidate.kind === "auth_nonce");
  const hasSignaturePayload = authCandidates.some((candidate) =>
    flattenObject(candidate.body || {}).some(({ path, value }) => {
      const lowerPath = String(path || "").toLowerCase();
      return /(signature|signed)/.test(lowerPath) || /^0x[a-fA-F0-9]{130,}$/.test(String(value || ""));
    })
  );
  const hasBearer = candidates.some((candidate) =>
    Object.values(candidate.headers || {}).some((value) => looksLikeBearer(value))
  );

  if (accountSource === "tokens") {
    return "account_token";
  }

  if (accountSource === "accounts" && authCandidates.length > 0) {
    return "request";
  }

  if (
    accountSource === "privateKeys" &&
    authCandidates.length > 0 &&
    (nonceCandidates.length > 0 || hasSignaturePayload)
  ) {
    return "evm_sign";
  }

  return hasBearer ? "account_token" : "none";
}

function replaceStringTokens(value, replacements) {
  let output = value;
  replacements.forEach(({ from, to }) => {
    if (!from || typeof output !== "string") {
      return;
    }
    output = output.split(String(from)).join(to);
  });
  return output;
}

function applyReplacements(input, replacements) {
  if (typeof input === "string") {
    return replaceStringTokens(input, replacements);
  }

  if (typeof input === "number" || typeof input === "boolean") {
    const matched = replacements.find(({ from }) => String(from) === String(input));
    return matched ? matched.to : input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => applyReplacements(item, replacements));
  }

  if (input && typeof input === "object") {
    const output = {};
    Object.entries(input).forEach(([key, value]) => {
      output[key] = applyReplacements(value, replacements);
    });
    return output;
  }

  return input;
}

function inferAuthSamples({ accountSource, loginCandidate, nonceCandidate, accountFields }) {
  const replacements = [];

  if (accountSource === "tokens") {
    const bearerHeader = Object.entries(loginCandidate ? loginCandidate.headers || {} : {}).find(
      ([name, value]) => name.toLowerCase() === "authorization" && looksLikeBearer(value)
    );
    if (bearerHeader) {
      replacements.push({
        from: bearerHeader[1],
        to: "Bearer {{state.token}}",
      });
    }
  }

  if (accountSource === "accounts" && loginCandidate && loginCandidate.body && typeof loginCandidate.body === "object") {
    accountFields.forEach((field) => {
      const value = loginCandidate.body[field];
      if (typeof value === "string" && value) {
        replacements.push({
          from: value,
          to: `{{account.${field}}}`,
        });
      }
    });
  }

  if (accountSource === "privateKeys") {
    if (loginCandidate && loginCandidate.body && typeof loginCandidate.body === "object") {
      const rows = flattenObject(loginCandidate.body);
      const messageRow = rows.find(({ path: bodyPath }) => /(message)/i.test(bodyPath));
      if (messageRow && typeof messageRow.value === "string") {
        replacements.push({
          from: messageRow.value,
          to: "{{auth.message}}",
        });
      }
    }

    [loginCandidate, nonceCandidate].filter(Boolean).forEach((candidate) => {
      flattenObject(candidate.body || {}).forEach(({ path: bodyPath, value }) => {
        const lowerPath = bodyPath.toLowerCase();
        if (looksLikeEthAddress(value) || /(address|wallet)/.test(lowerPath)) {
          replacements.push({
            from: value,
            to: "{{account.address}}",
          });
        }

        if (/(signature)/.test(lowerPath) && typeof value === "string") {
          replacements.push({
            from: value,
            to: "{{auth.signature}}",
          });
        }

        if (/(nonce|challenge)/.test(lowerPath) && (typeof value === "string" || typeof value === "number")) {
          replacements.push({
            from: value,
            to: "{{auth.nonce}}",
          });
        }
      });
    });
  }

  return replacements.filter((item) => item.from !== undefined && item.from !== null && String(item.from).length > 0);
}

function convertCandidateToRequestTask(candidate, replacements, index) {
  const headers = {};
  Object.entries(candidate.headers || {}).forEach(([name, value]) => {
    if (name.toLowerCase() === "authorization" && looksLikeBearer(value)) {
      headers[name] = "Bearer {{state.token}}";
      return;
    }
    headers[name] = applyReplacements(value, replacements);
  });

  return {
    type: "request",
    name: candidate.name || normalizeName(`imported_request_${index + 1}`),
    notes: [`从 ${candidate.sourceType.toUpperCase()} 导入`, candidate.summary],
    method: candidate.method,
    url: applyReplacements(candidate.url, replacements),
    headers,
    ...(candidate.body !== undefined
      ? {
          body: applyReplacements(candidate.body, replacements),
        }
      : {}),
  };
}

function buildImportedAuth({ authMode, loginCandidate, nonceCandidate, accountSource, accountFields }) {
  if (authMode === "none") {
    return null;
  }

  if (authMode === "account_token") {
    return {
      type: "account_token",
      tokenField: "token",
      notes: ["当前导入流程按 token 文件模式运行。"],
    };
  }

  const replacements = inferAuthSamples({
    accountSource,
    loginCandidate,
    nonceCandidate,
    accountFields,
  });

  if (authMode === "request") {
    return {
      type: "request",
      notes: ["该登录请求从抓包导入，请检查字段和 token 提取路径。"],
      request: {
        method: loginCandidate.method,
        url: applyReplacements(loginCandidate.url, replacements),
        headers: applyReplacements(loginCandidate.headers, replacements),
        ...(loginCandidate.body !== undefined
          ? {
              body: applyReplacements(loginCandidate.body, replacements),
            }
          : {}),
      },
      extractTokenPath: findTokenPath(loginCandidate.responseBody),
    };
  }

  if (authMode === "evm_sign") {
    const messagePath = findMessagePath(nonceCandidate.responseBody);
    const noncePath = findNoncePath(nonceCandidate.responseBody);
    const siweInfo = inferSiweMessageTemplate({
      loginCandidate,
      nonceCandidate,
      noncePath,
    });

    const notes = ["该签名登录从抓包导入，请重点检查 messagePath 和 tokenPath。"];
    if (siweInfo.messageTemplate) {
      notes.push("检测到 SIWE 风格消息，已自动生成 messageTemplate。");
    }

    return {
      type: "evm_sign",
      notes,
      nonceRequest: {
        method: nonceCandidate.method,
        url: applyReplacements(nonceCandidate.url, replacements),
        headers: applyReplacements(nonceCandidate.headers, replacements),
        ...(nonceCandidate.body !== undefined
          ? {
              body: applyReplacements(nonceCandidate.body, replacements),
            }
          : {}),
      },
      ...(noncePath ? { noncePath } : {}),
      ...(siweInfo.messageTemplate ? { messageTemplate: siweInfo.messageTemplate } : { messagePath }),
      ...(siweInfo.siwe ? { siwe: siweInfo.siwe } : {}),
      loginRequest: {
        method: loginCandidate.method,
        url: applyReplacements(loginCandidate.url, replacements),
        headers: applyReplacements(loginCandidate.headers, replacements),
        ...(loginCandidate.body !== undefined
          ? {
              body: applyReplacements(loginCandidate.body, replacements),
            }
          : {}),
      },
      extractTokenPath: findTokenPath(loginCandidate.responseBody),
    };
  }

  return null;
}

function isObjectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function findCollections(input, prefix = "") {
  const collections = [];

  if (Array.isArray(input)) {
    if (input.length > 0 && input.every((item) => isObjectRecord(item))) {
      collections.push({
        path: prefix,
        items: input,
      });
    }

    input.forEach((item, index) => {
      collections.push(...findCollections(item, `${prefix}[${index}]`));
    });
    return collections;
  }

  if (isObjectRecord(input)) {
    Object.entries(input).forEach(([key, value]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      collections.push(...findCollections(value, nextPrefix));
    });
  }

  return collections;
}

function pickCollectionInfo(responseBody) {
  if (!responseBody || typeof responseBody !== "object") {
    return null;
  }

  const collections = findCollections(responseBody);
  if (collections.length === 0) {
    return null;
  }

  const scored = collections
    .map((collection) => {
      const sampleItem = collection.items[0] || {};
      const keys = Object.keys(sampleItem);
      let score = 0;

      if (/\b(items|tasks|rewards|quests|missions)\b/i.test(collection.path)) {
        score += 4;
      }
      if (keys.some((key) => /(id|taskId|questId|rewardId|missionId|uuid|slug)/i.test(key))) {
        score += 3;
      }
      if (keys.some((key) => /(claimed|completed|done|status|available)/i.test(key))) {
        score += 2;
      }
      score += Math.min(collection.items.length, 5);

      return {
        ...collection,
        sampleItem,
        score,
      };
    })
    .sort((left, right) => right.score - left.score);

  return scored[0] || null;
}

function pickIdField(sampleItem) {
  const preferred = ["id", "taskId", "questId", "rewardId", "missionId", "uuid", "slug", "code"];
  for (const key of preferred) {
    if (key in sampleItem) {
      return key;
    }
  }

  return Object.keys(sampleItem).find((key) => /(id|uuid|slug|code)/i.test(key)) || null;
}

function pickClaimField(sampleItem) {
  const preferred = ["claimed", "isClaimed", "completed", "isCompleted", "done", "available", "status"];
  for (const key of preferred) {
    if (key in sampleItem) {
      return key;
    }
  }

  return Object.keys(sampleItem).find((key) => /(claimed|completed|done|available|status)/i.test(key)) || null;
}

function buildFilterConfig(sampleItem, claimField) {
  if (!claimField) {
    return null;
  }

  const value = sampleItem[claimField];
  if (typeof value === "boolean") {
    return {
      field: claimField,
      equals: false,
    };
  }

  if (typeof value === "number" && value === 0) {
    return {
      field: claimField,
      equals: 0,
    };
  }

  if (typeof value === "string" && /(unclaimed|pending|todo|available|not_claimed)/i.test(value)) {
    return {
      field: claimField,
      equals: value,
    };
  }

  return null;
}

function buildItemReplacements(sampleItem) {
  const replacements = [];
  Object.entries(sampleItem || {}).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }

    if (!/(id|task|quest|reward|mission|slug|code|evidence|name)/i.test(key)) {
      return;
    }

    if (typeof value === "string" || typeof value === "number") {
      replacements.push({
        from: String(value),
        to: `{{item.${key}}}`,
      });
    }
  });

  return replacements;
}

function scoreClaimMatch(listCandidate, claimCandidate, collectionInfo) {
  const listUrl = getUrlInfo(listCandidate.url);
  const claimUrl = getUrlInfo(claimCandidate.url);
  if (listUrl.host && claimUrl.host && listUrl.host !== claimUrl.host) {
    return -1;
  }

  let score = 0;
  const listSegments = listUrl.segments.map((segment) => segment.toLowerCase());
  const claimSegments = claimUrl.segments.map((segment) => segment.toLowerCase());

  const overlap = listSegments.filter((segment) => claimSegments.includes(segment));
  score += overlap.length * 2;

  if (claimSegments.includes("claim")) {
    score += 2;
  }

  const sampleItem = collectionInfo.sampleItem || {};
  const rawText = JSON.stringify({
    url: claimCandidate.url,
    body: claimCandidate.body,
  });

  Object.values(sampleItem).forEach((value) => {
    if (typeof value === "string" || typeof value === "number") {
      if (rawText.includes(String(value))) {
        score += 3;
      }
    }
  });

  return score;
}

function buildClaimListTaskGroup(listCandidate, claimCandidates, replacements, groupIndex) {
  const collectionInfo = pickCollectionInfo(listCandidate.responseBody);
  if (!collectionInfo || !collectionInfo.sampleItem) {
    return null;
  }

  const idField = pickIdField(collectionInfo.sampleItem);
  if (!idField) {
    return null;
  }

  const matches = claimCandidates
    .map((candidate) => ({
      candidate,
      score: scoreClaimMatch(listCandidate, candidate, collectionInfo),
    }))
    .filter((item) => item.score >= 4)
    .sort((left, right) => right.score - left.score);

  const bestMatch = matches[0];
  if (!bestMatch) {
    return null;
  }

  const itemReplacements = buildItemReplacements(collectionInfo.sampleItem);
  const localReplacements = [...replacements, ...itemReplacements];
  const filter = buildFilterConfig(collectionInfo.sampleItem, pickClaimField(collectionInfo.sampleItem));
  const listTask = convertCandidateToRequestTask(listCandidate, replacements, groupIndex);
  const claimTask = convertCandidateToRequestTask(bestMatch.candidate, localReplacements, groupIndex);

  const task = {
    type: "claimList",
    name: normalizeName(`${listCandidate.name}_claim_list`),
    notes: [
      `自动分组: ${listCandidate.summary} + ${bestMatch.candidate.summary}`,
      "这是根据列表响应和 claim 请求自动合并的任务组。",
    ],
    listRequest: {
      method: listTask.method,
      url: listTask.url,
      headers: listTask.headers,
      ...(listTask.body !== undefined ? { body: listTask.body } : {}),
    },
    itemsPath: collectionInfo.path,
    ...(filter ? { filter } : {}),
    claimRequest: {
      method: claimTask.method,
      url: claimTask.url,
      headers: claimTask.headers,
      ...(claimTask.body !== undefined ? { body: claimTask.body } : {}),
    },
  };

  return {
    id: normalizeName(`group_${groupIndex + 1}_${task.name}`),
    label: `列表 + Claim: ${listCandidate.name}`,
    summary: `${listCandidate.summary} -> ${bestMatch.candidate.summary}`,
    task,
    sourceCandidateIds: [listCandidate.id, bestMatch.candidate.id],
    sourceKinds: ["list", "claim"],
    orderWeight: 30,
  };
}

function getOrderWeight(kindOrTaskType) {
  const weights = {
    api_checkin: 10,
    api_faucet: 20,
    claimList: 30,
    claim: 35,
    request: 50,
    api_heartbeat: 90,
  };

  return weights[kindOrTaskType] || 50;
}

function buildSingleTaskGroup(candidate, replacements, groupIndex) {
  const task = convertCandidateToRequestTask(candidate, replacements, groupIndex);
  return {
    id: normalizeName(`group_${groupIndex + 1}_${task.name}`),
    label: `${candidate.kind}: ${candidate.name}`,
    summary: candidate.summary,
    task,
    sourceCandidateIds: [candidate.id],
    sourceKinds: [candidate.kind],
    orderWeight: getOrderWeight(candidate.kind),
  };
}

function buildImportedTaskGroups({
  candidates,
  authMode,
  loginCandidate,
  nonceCandidate,
  accountSource,
  accountFields,
}) {
  const replacements = inferAuthSamples({
    accountSource,
    loginCandidate,
    nonceCandidate,
    accountFields,
  });

  const taskCandidates = candidates.filter((candidate) => !AUTH_KIND_SET.has(candidate.kind));
  const listCandidates = taskCandidates.filter((candidate) => candidate.kind === "list");
  const claimCandidates = taskCandidates.filter((candidate) => candidate.kind === "claim");
  const usedCandidateIds = new Set();
  const groups = [];

  listCandidates.forEach((listCandidate, index) => {
    const group = buildClaimListTaskGroup(listCandidate, claimCandidates.filter((candidate) => !usedCandidateIds.has(candidate.id)), replacements, index);
    if (group) {
      group.sourceCandidateIds.forEach((candidateId) => usedCandidateIds.add(candidateId));
      groups.push(group);
      return;
    }

    usedCandidateIds.add(listCandidate.id);
    groups.push(buildSingleTaskGroup(listCandidate, replacements, index));
  });

  taskCandidates.forEach((candidate, index) => {
    if (usedCandidateIds.has(candidate.id)) {
      return;
    }

    usedCandidateIds.add(candidate.id);
    groups.push(buildSingleTaskGroup(candidate, replacements, listCandidates.length + index));
  });

  groups.sort((left, right) => {
    if (left.orderWeight !== right.orderWeight) {
      return left.orderWeight - right.orderWeight;
    }

    const leftCandidate = candidates.find((candidate) => candidate.id === left.sourceCandidateIds[0]);
    const rightCandidate = candidates.find((candidate) => candidate.id === right.sourceCandidateIds[0]);
    return (leftCandidate?.originalIndex || 0) - (rightCandidate?.originalIndex || 0);
  });

  return groups.map((group, index) => ({
    ...group,
    recommendedOrder: index + 1,
  }));
}

function buildImportedTasks({
  taskCandidates,
  authMode,
  loginCandidate,
  nonceCandidate,
  accountSource,
  accountFields,
}) {
  const groups = buildImportedTaskGroups({
    candidates: taskCandidates,
    authMode,
    loginCandidate,
    nonceCandidate,
    accountSource,
    accountFields,
  });

  return groups.map((group) => group.task);
}

function deepClone(input) {
  return JSON.parse(JSON.stringify(input));
}

function isUsefulDynamicScalar(pathText, value) {
  const lowerPath = String(pathText || "").toLowerCase();

  if (/(token|access_token|jwt|password|signature|message)/.test(lowerPath)) {
    return false;
  }

  if (typeof value === "number") {
    return /(id|code|index|nonce|chain|round|epoch)/.test(lowerPath);
  }

  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 180) {
    return false;
  }

  if (looksLikeBearer(trimmed)) {
    return false;
  }

  if (/^(true|false|null|undefined)$/i.test(trimmed)) {
    return false;
  }

  return true;
}

function extractDynamicScalars(responseBody) {
  if (!responseBody || typeof responseBody !== "object") {
    return [];
  }

  return flattenObject(responseBody).filter(({ path: bodyPath, value }) =>
    isUsefulDynamicScalar(bodyPath, value)
  );
}

function buildBindingAlias(pathText, fallbackIndex) {
  const segments = String(pathText || "")
    .replace(/\[\d+\]/g, "")
    .split(".")
    .filter(Boolean);
  const candidate = segments.slice(-2).join("_") || `value_${fallbackIndex + 1}`;
  return normalizeName(candidate) || `value_${fallbackIndex + 1}`;
}

function ensureUniqueAlias(baseAlias, usedAliases) {
  let alias = baseAlias;
  let counter = 2;
  while (usedAliases.has(alias)) {
    alias = `${baseAlias}_${counter}`;
    counter += 1;
  }
  usedAliases.add(alias);
  return alias;
}

function replaceLiteralInNode(node, from, to) {
  if (typeof node === "string") {
    if (!String(from)) {
      return { value: node, changed: false };
    }
    const changed = node.includes(String(from));
    return {
      value: changed ? node.split(String(from)).join(to) : node,
      changed,
    };
  }

  if (typeof node === "number" || typeof node === "boolean") {
    const changed = String(node) === String(from);
    return {
      value: changed ? to : node,
      changed,
    };
  }

  if (Array.isArray(node)) {
    let changed = false;
    const value = node.map((item) => {
      const result = replaceLiteralInNode(item, from, to);
      changed = changed || result.changed;
      return result.value;
    });
    return { value, changed };
  }

  if (node && typeof node === "object") {
    let changed = false;
    const value = {};
    Object.entries(node).forEach(([key, item]) => {
      const result = replaceLiteralInNode(item, from, to);
      value[key] = result.value;
      changed = changed || result.changed;
    });
    return { value, changed };
  }

  return { value: node, changed: false };
}

function replaceInRequestShape(requestShape, from, to) {
  if (!requestShape) {
    return false;
  }

  let changed = false;
  ["url", "headers", "body", "params"].forEach((key) => {
    if (!(key in requestShape)) {
      return;
    }

    const result = replaceLiteralInNode(requestShape[key], from, to);
    requestShape[key] = result.value;
    changed = changed || result.changed;
  });

  return changed;
}

function replaceInTask(task, from, to) {
  if (!task || !task.type) {
    return false;
  }

  if (task.type === "request") {
    return replaceInRequestShape(task, from, to);
  }

  if (task.type === "claimList") {
    const changedList = replaceInRequestShape(task.listRequest, from, to);
    const changedClaim = replaceInRequestShape(task.claimRequest, from, to);
    return changedList || changedClaim;
  }

  return false;
}

function attachSaveBinding(target, statePath, responsePath) {
  if (!target.saveToState) {
    target.saveToState = {};
  }

  target.saveToState[statePath] = responsePath;
}

function pickGroupResponseCandidate(group, candidateMap) {
  return (group.sourceCandidateIds || [])
    .map((candidateId) => candidateMap.get(candidateId))
    .find((candidate) => candidate && candidate.responseBody && typeof candidate.responseBody === "object");
}

function applyDynamicBindingsToGroups(taskGroups, candidateMap) {
  for (let index = 0; index < taskGroups.length; index += 1) {
    const currentGroup = taskGroups[index];
    const responseCandidate = pickGroupResponseCandidate(currentGroup, candidateMap);
    if (!responseCandidate) {
      continue;
    }

    const scalars = extractDynamicScalars(responseCandidate.responseBody);
    let aliasCounter = 0;
    const usedAliases = new Set();

    scalars.forEach(({ path: responsePath, value }) => {
      let changedAnywhere = false;
      const alias = ensureUniqueAlias(buildBindingAlias(responsePath, aliasCounter), usedAliases);
      const statePath = `imported.${currentGroup.task.name}.${alias}`;
      const template = `{{state.${statePath}}}`;

      for (let nextIndex = index + 1; nextIndex < taskGroups.length; nextIndex += 1) {
        changedAnywhere =
          replaceInTask(taskGroups[nextIndex].task, value, template) || changedAnywhere;
      }

      if (changedAnywhere) {
        attachSaveBinding(currentGroup.task, statePath, responsePath);
        aliasCounter += 1;
      }
    });
  }
}

function applyDynamicBindingsToAuth(auth, loginCandidate, taskGroups) {
  if (!auth || !loginCandidate || !loginCandidate.responseBody || typeof loginCandidate.responseBody !== "object") {
    return;
  }

  const tokenPath = auth.extractTokenPath || "";
  const scalars = extractDynamicScalars(loginCandidate.responseBody).filter(
    ({ path: responsePath }) => responsePath !== tokenPath
  );

  let aliasCounter = 0;
  const usedAliases = new Set();
  scalars.forEach(({ path: responsePath, value }) => {
    let changedAnywhere = false;
    const alias = ensureUniqueAlias(buildBindingAlias(responsePath, aliasCounter), usedAliases);
    const statePath = `imported.auth.${alias}`;
    const template = `{{state.${statePath}}}`;

    taskGroups.forEach((group) => {
      changedAnywhere = replaceInTask(group.task, value, template) || changedAnywhere;
    });

    if (changedAnywhere) {
      attachSaveBinding(auth, statePath, responsePath);
      aliasCounter += 1;
    }
  });
}

function finalizeImportedPlan({ auth, taskGroups, loginCandidate, candidates }) {
  const authCopy = auth ? deepClone(auth) : auth;
  const groupsCopy = deepClone(taskGroups || []);
  const candidateMap = new Map((candidates || []).map((candidate) => [candidate.id, candidate]));

  applyDynamicBindingsToAuth(authCopy, loginCandidate, groupsCopy);
  applyDynamicBindingsToGroups(groupsCopy, candidateMap);

  return {
    auth: authCopy,
    taskGroups: groupsCopy,
  };
}

module.exports = {
  loadImportCandidates,
  inferAccountSource,
  inferAccountFields,
  inferAuthStrategy,
  buildImportedAuth,
  buildImportedTasks,
  buildImportedTaskGroups,
  finalizeImportedPlan,
};
