import Controller from "./Controller";
import ErrorHandler from "./Error";
import express, { Express } from "express";
import bodyParser from "body-parser";
import "reflect-metadata";

export interface ExpressOptions {
    controllers?: string;
    errors?: string;
    port: number;
}

export interface Application {
    readonly options: ExpressOptions;
    readonly controllers: Controller;
    readonly errors: ErrorHandler;
    readonly applicationDirectory: string;
    readonly express: Express;
}

export function ExpressApplication(options?: ExpressOptions ) {
    return <T extends { new(...args: any[]): {} }>(constructor: T) => {
        Reflect.defineMetadata("expressClass", true, constructor);
        constructor.prototype.options = options;
        constructor.prototype.controllers = new Controller();
        constructor.prototype.errors = new ErrorHandler();
        constructor.prototype.express = express();
        constructor.prototype.express.use(bodyParser.json());

        interface ExpressApplication extends Application {}
        class ExpressApplication extends constructor {
            constructor(...args: any[]) {
                super(...args);
                constructor.prototype.applicationDirectory = args[0];
                this.controllers.init(this);
                this.errors.init(this);
                this.express.listen(this.options.port, () => {
                    console.log(`Listening on port ${this.options.port}`);
                });
            }
        }

        return ExpressApplication;
    }
}