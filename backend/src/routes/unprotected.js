const Router = require("@koa/router").Router || require("@koa/router");
const router = new Router();

// Public route test
router.get("/public", (ctx) => {
	ctx.body = { message: "This is a public endpoint" };
});

require("./unprotected-routes")(router);

module.exports = router;
