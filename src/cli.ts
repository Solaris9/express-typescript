#!/usr/bin/env node
import * as yargs from "yargs";
import path from "path";
import fs from "fs";
import { ExpressApplication } from "./Application";

const args = yargs
    .help()
    .option("port", {
        description: "Sets the port to use for the express server.",
        default: 8080,
    })
    .option("controllers", {
        description: "The controllers directory."
    })
    .option("errors", {
        description: "The errors directory."
    })
    .option("main", {
        type: "string",
        description: "The main file to run. If not provided then defaults are used.",
    })
    .argv;

let server, dir = process.cwd();

if (args.main || args._[0]) {
    const file = path.join(process.cwd(), (args.main || args._[0]));

    if (!fs.existsSync(file)) {
        console.log("File provided does not exist.");
        process.exit();
    }

    let mod = require(file);

    if (!mod.default) {
        console.log("File provided does not have a default export.");
        process.exit();
    }

    if (Reflect.getMetadata("expressClass", mod.default) !== true) {
        console.log("File provided is not annotated with ExpressApplication.");
        process.exit();
    }

    server = mod.default;
    dir = path.dirname(file)
} else {
    @ExpressApplication({ ...args } as any)
    class DefaultExpressApplication {
    }

    server = DefaultExpressApplication
}

new server(dir);
