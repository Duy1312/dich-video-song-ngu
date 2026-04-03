const fs = require("fs");
const p = "C:/Users/duy/.claude/plans/hashed-crafting-bubble-agent-a45f82e89143963c3.md";
fs.mkdirSync(require("path").dirname(p), {recursive: true});
const lines = [];
process.stdin.setEncoding("utf8");
process.stdin.on("data", d => lines.push(d));
process.stdin.on("end", () => { const c = lines.join(""); fs.writeFileSync(p, c, "utf8"); console.log("Written " + c.length + " bytes"); });
