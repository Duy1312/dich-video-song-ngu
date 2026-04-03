const fs=require("fs");
const chunks=[];
process.stdin.setEncoding("utf8");
process.stdin.on("data",d=>chunks.push(d));
process.stdin.on("end",()=>{
  const c=chunks.join("");
  fs.writeFileSync("C:/Users/duy/.claude/plans/hashed-crafting-bubble-agent-a45f82e89143963c3.md",c,"utf8");
  console.log("Written",c.length,"bytes");
});