import { generateApiKey, hashApiKey } from "../src/lib/crypto";

const { key, prefix } = generateApiKey();
const hash = await hashApiKey(key);

console.log("Generated API Key:");
console.log(`  Key:    ${key}`);
console.log(`  Prefix: ${prefix}`);
console.log(`  Hash:   ${hash}`);
console.log("");
console.log("Store the key securely — it cannot be recovered from the hash.");
