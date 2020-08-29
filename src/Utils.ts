import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { Application } from "./Application";

export function readDir(app: Application, type: string): { directory: string, files: string[] } {
    let directory: string = null, fallback = join(app.applicationDirectory, app.options[type] || type);

    if (app.options[type] && exists(app.options[type])) {
        directory = app.options[type];
    } else if (exists(fallback)) {
        directory = fallback;
    }

    return { files: readFiles(directory), directory };
}

function exists(directory: string): boolean {
    try {
        existsSync(directory);
        return true;
    } catch {
        return false;
    }
}

function readFiles(directory: string): string[] {
    try {
        return readdirSync(directory).filter(f => f.endsWith(".js"))
    } catch {
        return [];
    }
}