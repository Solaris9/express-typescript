#!/usr/bin/env node
import path from "path";
import fs from "fs";

const arg = process.argv[2];

if (!arg) {
    console.log("Missing file argument.");
    process.exit();
}

const file = path.join(process.cwd(), arg)

if (!fs.existsSync(file)) {
    console.log("File provided does not exist.");
    process.exit();
}

let mod = require(file)

if (!mod.default) {
    console.log("File provided does not have a default export.");
    process.exit();
}

if (Reflect.getMetadata("expressClass", mod.default) !== true) {
    console.log("File provided is not annotated with ExpressApplication.");
    process.exit();
}

new mod.default(path.dirname(file))
