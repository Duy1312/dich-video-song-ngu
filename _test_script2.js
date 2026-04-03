const fs = require("fs");
const B = String.fromCharCode(96);
const T = B+B+B;
const p = [
  "# Multi-Platform Subtitle Extraction -- Implementation Plan",
  "",
  "test line",
];
const out = p.join(String.fromCharCode(10));
fs.writeFileSync("D:/work/personal/dich_moi_nen_tang/_test_out.md", out, "utf8");
console.log("ok", out.length);