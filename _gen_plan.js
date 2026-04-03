const fs = require("fs");
const p = "C:/Users/duy/.claude/plans/hashed-crafting-bubble-agent-a45f82e89143963c3.md";
const c = fs.readFileSync("D:/work/personal/dich_moi_nen_tang/_plan_input.md", "utf8");
fs.writeFileSync(p, c, "utf8");
console.log("Written", c.length, "bytes");
