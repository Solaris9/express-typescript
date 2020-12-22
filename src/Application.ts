import { RequestHandlerParams } from "express-serve-static-core"
import Controller from "./Controller";
import ErrorHandler from "./Error";
import express, { Express } from "express";
import "reflect-metadata";

const defaults: ExpressOptions = {
    port: 8080,
    middleware: []
}

function wrap(self, func) {
    function wrapper(request, response, next) {
        try {
            func.bind(self)(request, response, next)
        } catch (error) {
            const success = this.errors.iterate(request, response, error);
            if (!success) throw error; else return;
        }
    }

    return wrapper.bind(self)
}

export interface ExpressOptions {
    controllers?: string;
    errors?: string;
    port?: number;
    middleware?: RequestHandlerParams[]
}

export interface Application {
    readonly options: ExpressOptions;
    readonly controllers: Controller;
    readonly errors: ErrorHandler;
    readonly applicationDirectory: string;
    readonly express: Express;
}

export function ExpressApplication(options: ExpressOptions = {}) {
    options = { ...defaults, ...options }
    return <T extends { new(...args: any[]): {} }>(constructor: T) => {
        Reflect.defineMetadata("expressClass", true, constructor);
        constructor.prototype.options = options;
        constructor.prototype.controllers = new Controller();
        constructor.prototype.errors = new ErrorHandler();
        constructor.prototype.express = express();

        const middleware: Function[] = Reflect.getMetadata("controllerMiddleware", constructor.prototype) || [];

        interface ExpressApplication extends Application {}
        class ExpressApplication extends constructor {
            constructor(...args: any[]) {
                super(...args);
                constructor.prototype.applicationDirectory = args[0];
        
                if (options.middleware.length || middleware.length) {
                    this.express.use(...[...options.middleware, ...middleware].map(func => wrap(this, func)))
                }

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