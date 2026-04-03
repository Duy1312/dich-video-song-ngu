const fs = require("fs");
const p = "C:/Users/duy/.claude/plans/hashed-crafting-bubble-agent-adde078e5a6559418.md";
const c = require("fs").readFileSync("D:/work/personal/dich_moi_nen_tang/_plan.md", "utf8");
fs.writeFileSync(p, c);
console.log("done", c.length);
