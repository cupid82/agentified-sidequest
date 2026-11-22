// A scripted, OpenAI-compatible router for Campus Sidequest's browser end-to-end check.
// It plays the Sidequest hub and Makers Studio agents deterministically, and records which
// agent asked, the tools offered, the model, and whether the expected key was sent.
import http from "node:http";
import { once } from "node:events";

export class ScriptedRouter {
  static MODELS = ["gpt-4.1-mini", "gpt-4.1-nano"];

  constructor(key) {
    this.key = key;
    this.records = [];
    this.calls = 0;
    this.server = null;
  }

  static role(system) {
    if (system.includes("You are the Campus Sidequest agent")) {
      return "sidequest";
    }
    if (system.includes("You are the Makers Studio guide")) {
      return "maker_front";
    }
    return "other";
  }

  static receipt(content) {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  static text(content) {
    const parsed = ScriptedRouter.receipt(content);
    return parsed && typeof parsed.text === "string" ? parsed.text : String(content);
  }

  decide(role, messages, tools = []) {
    const results = messages.filter((message) => message.role === "tool").map((message) => String(message.content));
    const lastUser = [...messages].reverse().find((message) => message.role === "user")?.content || "";
    if (role === "sidequest" && /zine/.test(lastUser)) {
      // Plays the hub agent: set the planner from the message, build, then report.
      if (results.length === 0) {
        return { tool: "website_set_sidequest_choices", args: { mood: "make", timeMinutes: 30, budget: 0, activityRequest: "zine" } };
      }
      if (results.length === 1) {
        return { tool: "website_build_sidequest", args: {} };
      }
      const built = ScriptedRouter.receipt(results[1])?.result;
      const top = built?.options?.[0];
      return { text: `SIDEQUEST_PLAN: ok=${built?.ok}; options=${built?.options?.length ?? 0}; top=${top ? top.stops.map((stop) => `${stop.title} (${stop.source})`).join(" + ") : built?.reason}` };
    }
    if (role === "sidequest" && /Makers Studio offer/.test(lastUser)) {
      if (results.length === 0) {
        const partner = tools.find((name) => name.includes("maker_studio"));
        return partner
          ? { tool: partner, args: { request: "Summarize your public demo activity list with names, times and costs." } }
          : { text: `SIDEQUEST_PARTNER: no maker_studio tool in ${tools.join(",")}` };
      }
      return { text: `SIDEQUEST_PARTNER: ${ScriptedRouter.text(results[results.length - 1])}` };
    }
    if (role === "maker_front") {
      if (results.length === 0) {
        return { tool: "website_get_activities", args: {} };
      }
      const list = ScriptedRouter.receipt(results[0])?.result?.activities || [];
      return { text: `MAKER_FRONT: ${list.length} activities, first ${list[0]?.title || "none"}; asked "${lastUser.slice(0, 80)}"` };
    }
    return { text: "UNSCRIPTED" };
  }

  stream(model, reply) {
    let delta;
    if (reply.tool) {
      this.calls += 1;
      delta = { role: "assistant", tool_calls: [{ index: 0, id: `call_scripted_${this.calls}`, type: "function", function: { name: reply.tool, arguments: JSON.stringify(reply.args) } }] };
    } else {
      delta = { role: "assistant", content: reply.text };
    }
    const chunk = { id: "chatcmpl-scripted", object: "chat.completion.chunk", model, choices: [{ index: 0, delta, finish_reason: reply.tool ? "tool_calls" : "stop" }] };
    const usage = { id: "chatcmpl-scripted", object: "chat.completion.chunk", model, choices: [], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
    return `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(usage)}\n\ndata: [DONE]\n\n`;
  }

  respond(method, path, headers, body) {
    const authorization = typeof headers.authorization === "string" ? headers.authorization : null;
    const record = { method, path, origin: headers.origin || null, authorization: authorization !== null, keyOk: authorization === `Bearer ${this.key}` };
    this.records.push(record);
    if (method === "OPTIONS") {
      return { status: 204, type: "text/plain", body: "" };
    }
    if (method === "GET" && path === "/v1/models") {
      return { status: 200, type: "application/json", body: JSON.stringify({ object: "list", data: ScriptedRouter.MODELS.map((id) => ({ id, object: "model" })) }) };
    }
    if (method === "POST" && path === "/v1/chat/completions") {
      const parsed = JSON.parse(body);
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      const system = typeof messages[0]?.content === "string" ? messages[0].content : "";
      record.kind = "chat";
      record.model = parsed.model;
      record.role = ScriptedRouter.role(system);
      record.tools = (parsed.tools || []).map((tool) => tool.function?.name);
      record.body = body;
      record.reply = this.decide(record.role, messages, record.tools);
      return { status: 200, type: "text/event-stream", body: this.stream(parsed.model, record.reply) };
    }
    return { status: 404, type: "text/plain", body: "Not found" };
  }

  async handle(request, response) {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    let answer;
    try {
      answer = this.respond(request.method, new URL(request.url, "http://127.0.0.1").pathname, request.headers, Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
      answer = { status: 500, type: "text/plain", body: String(error.message || error) };
    }
    response.writeHead(answer.status, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type, anthropic-dangerous-direct-browser-access",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Cache-Control": "no-store",
      "Content-Type": answer.type,
    });
    response.end(answer.body);
  }

  async listen(port) {
    this.server = http.createServer(this.handle.bind(this));
    this.server.listen(port, "127.0.0.1");
    await once(this.server, "listening");
    return port;
  }

  async close() {
    if (this.server) {
      this.server.close();
      this.server.closeAllConnections();
    }
  }

  chats(role) {
    return this.records.filter((record) => record.kind === "chat" && (!role || record.role === role));
  }
}
