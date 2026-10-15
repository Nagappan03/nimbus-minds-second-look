// Shows masking before and after on a few invented sample strings.
// Run: node scripts/mask-demo.js
import { maskText } from "../lib/pipeline/mask.js";

const samples = [
  "Sir, your OTP is 482913. Share it with me to unblock your account.",
  "Please send Rs 25,000 to account 50100234567891 IFSC TEST0001234 today.",
  "My card 4111 1111 1111 1111 was charged twice, call me on +91 98765 43210.",
  "Email the receipt to riya.sharma@example.com or pay to riya.s@okexample.",
  "Hubungi saya di +62 812-3456-7890, kode verifikasi: 7731.",
  "Rent for October is 18,500 as usual, transfer by the 5th. Flat 302.",
];

for (const s of samples) {
  const { text, counts } = maskText(s);
  console.log("before:", s);
  console.log("after: ", text);
  console.log("masked:", JSON.stringify(counts), "\n");
}
