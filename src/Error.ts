import { Application } from "./Application";
import { Request, Response } from "express";
import { readDir } from "./Utils"
import { join } from "path";

export interface ErrorHandler {
    supports(error: any): boolean;
    handle(request: Request, response: Response, error: any): void;
}

export class ErrorHandler {}

export default class {
    public app: Application;
    public files: string[];
    public directory: string;
    private errors = new Map<string, ErrorHandler>();

    public loadAll() {
        const res = readDir(this.app, "errors")
        this.files = res.files;
        this.directory = res.directory;

        for (const file of this.files) this.load(file);
    }

    public load(name: string) {
        const file = join(this.directory, name);
        const mod = require(file);

        if (!(mod.default.prototype instanceof ErrorHandler))
            return console.log(`File ${name} does not extend from ErrorHandler.`);

        mod.default.prototype.file = file;

        const error = new mod.default() as ErrorHandler;
        this.errors.set(name.slice(0, -3), error);
    }

    public unload(name: string) {
        const error = this.errors.get(name);
        if (!error) return;

        this.errors.delete(name.slice(0, -3));
        // @ts-ignore
        delete require.cache[error.file]
    }

    public iterate(req, res, error: any): boolean {
        for (const handler of this.errors.values()) {
            if (handler.supports(error)) {
                handler.handle(req, res, error);
                return true;
            }
        }

        return false
    }

    public init(app: Application) {
        this.app = app;
        this.loadAll()
    }
}