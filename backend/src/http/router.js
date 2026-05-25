export async function routeRequest(req, res, service) {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { data: { ok: true } });
    if (req.method === "GET" && url.pathname === "/api/kols") return json(res, 200, { data: service.listKols() });
    if (req.method === "POST" && url.pathname === "/api/kols") return json(res, 201, { data: service.createKol(await readJson(req)) });

    if (req.method === "GET" && url.pathname === "/api/sources") return json(res, 200, { data: service.listSources() });
    if (req.method === "POST" && url.pathname === "/api/sources") return json(res, 201, { data: service.createSource(await readJson(req)) });

    if (req.method === "GET" && url.pathname === "/api/holdings") {
      return json(res, 200, { data: service.listHoldings({ ticker: url.searchParams.get("ticker"), kolId: url.searchParams.get("kolId") }) });
    }
    if (req.method === "POST" && url.pathname === "/api/holdings") return json(res, 201, { data: service.createHolding(await readJson(req)) });

    if (req.method === "GET" && url.pathname === "/api/consensus") return json(res, 200, { data: service.consensusMatrix() });

    if (req.method === "GET" && url.pathname === "/api/ingest") {
      return json(res, 200, { data: service.listIngestItems(url.searchParams.get("status")) });
    }
    if (req.method === "POST" && url.pathname === "/api/ingest") return json(res, 201, { data: service.createIngestItem(await readJson(req)) });
    if (req.method === "PATCH" && url.pathname.startsWith("/api/ingest/")) {
      const id = decodeURIComponent(url.pathname.split("/").at(-1));
      const body = await readJson(req);
      return json(res, 200, { data: service.updateIngestStatus(id, body.status) });
    }

    if (req.method === "GET" && url.pathname === "/api/alert-rules") return json(res, 200, { data: service.listAlertRules() });
    if (req.method === "POST" && url.pathname === "/api/alert-rules") return json(res, 201, { data: service.createAlertRule(await readJson(req)) });

    if (req.method === "GET" && url.pathname === "/api/quality/summary") return json(res, 200, { data: service.qualitySummary() });

    return json(res, 404, { error: { code: "NOT_FOUND", message: "route not found" } });
  } catch (error) {
    return json(res, error.statusCode ?? 500, {
      error: {
        code: error.code ?? "INTERNAL_ERROR",
        message: error.message ?? "Internal server error"
      }
    });
  }
}

export function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*"
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

