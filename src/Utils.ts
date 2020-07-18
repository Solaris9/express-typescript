import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { Application } from "./Application";

export function readDir(app: Application, type: string): { directory: string, files: string[] } {
    let directory: string;

    if (existsSync(app.options[type])) {
        directory = app.options[type];
    } else {
        directory = join(app.applicationDirectory, app.options[type] || type);
    }

    return { files: readdirSync(directory).filter(f => f.endsWith(".js")), directory }
}