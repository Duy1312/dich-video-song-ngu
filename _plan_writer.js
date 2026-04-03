const fs=require("fs");
const p="C:/Users/duy/.claude/plans/hashed-crafting-bubble-agent-adde078e5a6559418.md";
const c=[];
process.stdin.setEncoding("utf8");
process.stdin.on("data",d=>c.push(d));
process.stdin.on("end",()=>{fs.writeFileSync(p,c.join(""),"utf8");console.log("ok",c.join("").length);});
