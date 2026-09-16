import { defineConfig, loadEnv } from "vite";
import chatHandler from "./api/chat.js";
import imageHandler from "./api/image.js";

function installApiMiddleware(server, path, handler) {
  server.middlewares.use(path, async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const url = `http://${request.headers.host || "localhost"}${request.url}`;
    const webRequest = new Request(url, {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : body
    });
    const webResponse = await handler(webRequest);
    response.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => response.setHeader(key, value));
    if (!webResponse.body) {
      response.end();
      return;
    }
    const reader = webResponse.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      response.write(Buffer.from(value));
    }
    response.end();
  });
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [
      {
        name: "astra-chat-api",
        configureServer(server) {
          installApiMiddleware(server, "/api/chat", chatHandler);
          installApiMiddleware(server, "/api/image", imageHandler);
        },
        configurePreviewServer(server) {
          installApiMiddleware(server, "/api/chat", chatHandler);
          installApiMiddleware(server, "/api/image", imageHandler);
        }
      }
    ]
  };
});
