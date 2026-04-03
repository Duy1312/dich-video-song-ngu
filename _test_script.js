const fs = require("fs");
const B = String.fromCharCode(96);
const T = B+B+B;
const p = [];
p.push("# Multi-Platform Subtitle Extraction -- Implementation Plan");
p.push("");
p.push("## Executive Summary");
fs.writeFileSync("D:/work/personal/dich_moi_nen_tang/_test_out.md", p.join("
"), "utf8");
console.log("ok", p.length);