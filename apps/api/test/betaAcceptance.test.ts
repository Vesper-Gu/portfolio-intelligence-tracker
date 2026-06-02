import assert from "node:assert/strict";
import { test } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { configFromEnv, runBetaAcceptance } from "../src/smoke/betaAcceptance.js";

test("beta smoke config requires base URL and both user tokens", () => {
  assert.throws(() => configFromEnv({}), /BETA_BASE_URL is required/);
  assert.throws(() => configFromEnv({ BETA_BASE_URL: "https://beta.example" }), /BETA_USER_A_TOKEN is required/);
  assert.throws(() => configFromEnv({
    BETA_BASE_URL: "https://beta.example",
    BETA_USER_A_TOKEN: "token-a"
  }), /BETA_USER_B_TOKEN is required/);

  assert.deepEqual(configFromEnv({
    BETA_BASE_URL: "https://beta.example",
    BETA_USER_A_TOKEN: "token-a",
    BETA_USER_B_TOKEN: "token-b",
    BETA_SMOKE_ALLOW_DELETE: "true",
    BETA_SMOKE_IMAGE_PATH: "/tmp/smoke.png"
  }), {
    baseUrl: "https://beta.example",
    userAToken: "token-a",
    userBToken: "token-b",
    allowDelete: true,
    imagePath: "/tmp/smoke.png"
  });
});

test("beta smoke validates auth, isolation, RAG boundary and keeps delete disabled by default", async () => {
  const app = buildApp({
    authMode: "external",
    authVerifier: async (authorization) => {
      if (authorization === "Bearer token-a") return "user-a";
      if (authorization === "Bearer token-b") return "user-b";
      throw new Error("unauthorized");
    }
  });
  const logs: string[] = [];

  const summary = await runBetaAcceptance({
    baseUrl: "https://beta.example",
    userAToken: "token-a",
    userBToken: "token-b"
  }, {
    fetchImpl: createInjectFetch(app),
    log: (line) => logs.push(line)
  });

  assert.ok(summary.passed >= 12);
  assert.equal(summary.results.some((result) => result.name === "account delete" && result.status === "skip"), true);
  assert.equal(logs.some((line) => line.includes("token-a") || line.includes("token-b")), false);
  assert.equal(logs.some((line) => line.includes("synthetic private beta validation note")), false);

  const userAExport = await app.inject({
    method: "GET",
    url: "/account/export",
    headers: { authorization: "Bearer token-a" }
  });
  const userBExport = await app.inject({
    method: "GET",
    url: "/account/export",
    headers: { authorization: "Bearer token-b" }
  });

  assert.equal(userAExport.json().ingestItems.length > 0, true);
  assert.equal(userBExport.json().ingestItems.length, 0);
});

test("beta smoke delete validation only runs when explicitly enabled", async () => {
  const app = buildApp({
    authMode: "external",
    authVerifier: async (authorization) => {
      if (authorization === "Bearer token-a") return "user-a";
      if (authorization === "Bearer token-b") return "user-b";
      throw new Error("unauthorized");
    }
  });

  const summary = await runBetaAcceptance({
    baseUrl: "https://beta.example",
    userAToken: "token-a",
    userBToken: "token-b",
    allowDelete: true
  }, {
    fetchImpl: createInjectFetch(app),
    log: () => {}
  });

  assert.equal(summary.results.some((result) => result.name === "account delete" && result.status === "pass"), true);

  const userAExport = await app.inject({
    method: "GET",
    url: "/account/export",
    headers: { authorization: "Bearer token-a" }
  });

  assert.equal(userAExport.json().ingestItems.length, 0);
});

function createInjectFetch(app: FastifyInstance) {
  return async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const response = await (app.inject as any)({
      method: init.method ?? "GET",
      url: `${url.pathname}${url.search}`,
      headers,
      payload: typeof init.body === "string" ? init.body : undefined
    });

    return new Response(response.body, {
      status: response.statusCode,
      headers: response.headers as HeadersInit
    });
  };
}
