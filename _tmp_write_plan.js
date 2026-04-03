const fs=require("fs");
const c=fs.readFileSync("D:/work/personal/dich_moi_nen_tang/_tmp_plan_content.md","utf8");
fs.writeFileSync("C:/Users/duy/.claude/plans/hashed-crafting-bubble-agent-adde078e5a6559418.md",c,"utf8");
console.log("Written",c.length,"chars");
