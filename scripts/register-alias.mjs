/** ลงทะเบียน hooks ใน scripts/alias-hooks.mjs — ต้องแยกไฟล์เพราะ hooks รันคนละ thread */
import { register } from "node:module";

register("./alias-hooks.mjs", import.meta.url);
