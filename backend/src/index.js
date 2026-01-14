const Koa = require("koa");
const cors = require("@koa/cors");
const { koaBody } = require("koa-body");
const config = require("./config");

const app = new Koa();

// Logger middleware to log incoming requests
app.use(async (ctx, next) => {
	console.log(`[${new Date().toISOString()}] Incoming: ${ctx.method} ${ctx.url}`);
	await next();
});

// Global error handling middleware
app.use(async (ctx, next) => {
	try {
		await next();
	} catch (err) {
		const status = err.status || 500;
		const isDev = config.env === "development";

		console.error(`[Error] ${ctx.method} ${ctx.url} - Status: ${status}`);
		console.error(err);

		ctx.status = status;
		ctx.body = {
			error: err.message || "Internal Server Error",
			...(isDev && { stack: err.stack }),
		};

		// Emit error for centralized logging
		ctx.app.emit("error", err, ctx);
	}
});

app.use(cors());
app.use(koaBody());

// Import routes
const unprotectedRoutes = require("./routes/unprotected");
const proxyRoutes = require("./routes/proxy");

// Register routes
app.use(unprotectedRoutes.routes());
app.use(unprotectedRoutes.allowedMethods());

app.use(proxyRoutes.routes());
app.use(proxyRoutes.allowedMethods());

const port = config.port;

app.listen(port, () => {
	console.log(`Smart Agent Backend running on port ${port}`);
	console.log(`Environment: ${config.env}`);
	// Log registered routes for debugging
	console.log(
		"Registered Routes:",
		unprotectedRoutes.stack.map((i) => i.path)
	);

	// log proxy routes
	console.log(
		"Proxy Routes:",
		proxyRoutes.stack.map((i) => i.path)
	);

	// Run cleanup on startup
	const ConversationRepository = require("./repositories/conversation.repository");
	ConversationRepository.cleanup(30);
});

// Process-level error handling to prevent crashes from async code outside Koa flow
process.on("uncaughtException", (err) => {
	console.error("[CRITICAL] Uncaught Exception:", err);
	// In a production environment, you might want to perform a graceful shutdown here
	// and let a process manager like PM2 restart the server.
});

process.on("unhandledRejection", (reason, promise) => {
	console.error("[CRITICAL] Unhandled Rejection at:", promise, "reason:", reason);
});
