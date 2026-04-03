const fs = require("fs");
const content = fs.readFileSync("D:/work/personal/dich_moi_nen_tang/_plan_content.md", "utf8");
fs.writeFileSync("C:/Users/duy/.claude/plans/hashed-crafting-bubble-agent-a45f82e89143963c3.md", content, "utf8");
console.log("Written", content.length, "bytes");