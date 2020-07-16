import Controller from "./Controller"
import express, { Express } from "express"
import bodyParser from "body-parser"
import "reflect-metadata"

export interface ExpressOptions {
    controllers?: string;
    port: number;
}

export interface Application {
    options: ExpressOptions;
    controllerManager: Controller;
    applicationDirectory: string;
    express: Express;
}

export function ExpressApplication(options: ExpressOptions) {
    return <T extends { new(...args: any[]): {} }>(constructor: T) => {
        Reflect.defineMetadata("expressClass", true, constructor)
        constructor.prototype.options = options
        constructor.prototype.controllerManager = new Controller()
        constructor.prototype.express = express()
        constructor.prototype.express.use(bodyParser.json())

        interface ExpressApplication extends Application {}
        class ExpressApplication extends constructor {
            constructor(...args: any[]) {
                super(...args);
                constructor.prototype.applicationDirectory = args[0]
                this.controllerManager.init(this)
                this.express.listen(this.options.port, () => {
                    console.log(`Listening on port ${this.options.port}`)
                })
            }
        }

        return ExpressApplication
    }
}