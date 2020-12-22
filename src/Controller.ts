import { RequestHandlerParams } from "express-serve-static-core"
import { Application } from "./Application";
import { Request, Response, Router } from "express";
import { readDir } from "./Utils";
import { join } from "path";
import { existsSync } from "fs";

export interface Controller {
    readonly app: Application;
    readonly parameters: Map<string, Function>;
}

function checkRoute(route: string) {
    if (typeof route === "undefined") throw new RangeError("Controller route must be present.")
    if (route.length !== 1 && !route.startsWith("/"))
        throw new RangeError("Controller route must start with a forward slash.");
    if (route.length !== 1 && !/[a-z]$/i.test(route))
        throw new RangeError("Controller route must end with A to Z.");
}

export interface ControllerOptions {
    route: string;
    middleware: Function[];
    mergeMiddleware: boolean;
}

const defaultControllerOptions: Partial<ControllerOptions> = {
    middleware: [],
    mergeMiddleware: false,
    route: ""
}

export function Controller(route: string): any
export function Controller(options: Partial<ControllerOptions>): any
export function Controller(route: string, options?: Partial<ControllerOptions>): any

export function Controller(routeOrOptions: string | Partial<ControllerOptions>, options: Partial<ControllerOptions> = {}): any {
    const controllerOptions = typeof options !== "undefined" ? { ...options, route: routeOrOptions as string } : 
        typeof routeOrOptions === "string" ? { route: routeOrOptions } : routeOrOptions
    
    checkRoute(controllerOptions.route);

    return function() {
        const [target, key] = arguments

        if (typeof key === "string") {
            let propertyControllers: string[] = Reflect.getMetadata("propertyControllers", target) || [];
            Reflect.defineMetadata("propertyControllers", propertyControllers.concat(key), target);

            const middleware = Reflect.getMetadata("controllerMiddleware", target) || [];
            Reflect.defineMetadata("controllerMiddleware", middleware.concat(options.middleware), target[key]);

            delete options.middleware
            Reflect.defineMetadata("controllerOptions", controllerOptions, target, key);
        } else {
            Reflect.defineMetadata("controllerMiddleware", options.middleware, target)
            Reflect.defineMetadata("expressController", true, target);

            delete options.middleware
            Reflect.defineMetadata("controllerOptions", controllerOptions, target);
            return target;
        }
    }
}

export interface RouteOptions {
    route: string;
    method?: string;
}

Controller.Route = (routeOrOptions: string | RouteOptions, method?: string) => {
    return (target, propertyKey: string, descriptor: PropertyDescriptor) => {
        let programList: string[] = Reflect.getMetadata("routeMethods", target) || [];
        programList.push(propertyKey);
        Reflect.defineMetadata("routeMethods", programList, target);

        let options: RouteOptions;

        if (typeof routeOrOptions === "string") {
            options = { route: routeOrOptions, method: method || "GET" };
        } else {
            options = { method: "GET", ...routeOrOptions };
        }

        Reflect.defineMetadata("routeOptions", options, target, propertyKey);
    }
};

Controller.Get = (route: string) => Controller.Route(route, "GET");
Controller.Put = (route: string) => Controller.Route(route, "PUT");
Controller.Patch = (route: string) => Controller.Route(route, "PATCH");
Controller.Post = (route: string) => Controller.Route(route, "POST");
Controller.Delete = (route: string) => Controller.Route(route, "DELETE");

type Types  = "validate" | "request" | "response" | "parameter" | "next" | "body";

function decorator(type: Types, target: any, propertyKey: string, parameterIndex: number, data?: any) {
    const meta: any[] = Reflect.getMetadata("routeArguments", target, propertyKey) || [];
    const existing = meta.find(d => d.index == parameterIndex);

    if (existing) {
        meta[parameterIndex + 1] = { ...existing, ...data }
    } else {
        meta.push({ index: parameterIndex, type, ...data });
    }

    Reflect.defineMetadata("routeArguments", meta, target, propertyKey);
}

export function HTTPRequest(target: any, propertyKey: string, parameterIndex: number) {
    decorator("request", target, propertyKey, parameterIndex);
}

export function HTTPResponse(target: any, propertyKey: string, parameterIndex: number) {
    decorator("response", target, propertyKey, parameterIndex);
}

export function RequestBody(target: any, propertyKey: string, parameterIndex: number) {
    decorator("body", target, propertyKey, parameterIndex);
}

export function Validate(target: any, propertyKey: string, parameterIndex: number) {
    decorator("validate", target, propertyKey, parameterIndex, { validate: true });
}

export function RouteParameter(name?: string) {
    return (target: any, propertyKey: string, parameterIndex: number) => {
        decorator("parameter", target, propertyKey, parameterIndex,{ name });
    }
}

export function Middleware(target, propertyKey: string, descriptor: PropertyDescriptor) {
    let middleware: Function[] = Reflect.getMetadata("controllerMiddleware", target) || [];
    Reflect.defineMetadata("controllerMiddleware", middleware.concat(target[propertyKey]), target);
}

export function Use(...functions: ((request: Request, response: Response, next: Function) => void)[]) {
    if (!functions.length)
        throw new RangeError("@Use() decorator requires at least one middleware to be present.");

    return function (target, propertyKey: string, descriptor: PropertyDescriptor) {
        Reflect.defineMetadata("routeMiddlewares", functions, target, propertyKey);
    }
}

export function Parameter(parameter?: string) {
    return function (target, propertyKey: string, descriptor: PropertyDescriptor) {
        let programList: string[] = Reflect.getMetadata("routeParameters", target) || [];
        programList.push(propertyKey);
        Reflect.defineMetadata("routeParameters", programList, target);

        const name = parameter || propertyKey;
        Reflect.defineMetadata("routeParameter", name, target, propertyKey);
    }
}

function wrap(self, func) {
    if (Object.has)

    function wrapper(request, response, next) {
        try {
            func.bind(this)(request, response, next)
        } catch (error) {
            const success = this.app.errors.iterate(request, response, error);
            if (!success) throw error; else return;
        }
    }

    return wrapper.bind(self)
}

export default class {
    public app: Application;
    public files: string[];
    public directory: string;
    private controllers = new Map<string, Controller>();

    public loadAll() {
        const res = readDir(this.app, "controllers");
        this.files = res.files;
        this.directory = res.directory;

        for (const file of this.files) this.load(file);
    }

    public load(name: string) {
        const file = join(this.directory, name);

        if (!existsSync(file)) return console.log(`File ${name} in ${this.directory} does not exist.`);

        const mod = require(file);

        if (!mod.default) return console.error(`Controller located at ${name} has no default export.`);

        if (Reflect.getMetadata("expressController", mod.default) !== true)
            return console.error(`Controller located at ${name} is not decorated with @Controller.`);

        const controller = new mod.default();

        controller.file = file
        controller.app = this.app
        controller.parameters = new Map<string, Function>();

        this.controllers.set(name.slice(0, -3), controller);
        this.loadController(mod.default, controller)
    }

    private loadController(mod: any, controller: Controller) {
        const controllerOptions: ControllerOptions = { ...defaultControllerOptions, ...Reflect.getMetadata("controllerOptions", (mod || mod.__proto__)) };

        const controllerMiddleware: Function[] = Reflect.getMetadata("controllerMiddleware", controller) || [];
        Reflect.defineMetadata("controllerMiddleware", controllerMiddleware.map(func => wrap(controller, func)), controller)

        const propertyControllers = Reflect.getMetadata("propertyControllers", controller) || [];
        const routeMethods = Reflect.getMetadata("routeMethods", controller) || [];

        if (propertyControllers.length) {
            for (const key of propertyControllers) {
                const propertyControllerOptions: ControllerOptions = { ...defaultControllerOptions, ...Reflect.getMetadata("controllerOptions", controller, key) };
                propertyControllerOptions.route = controllerOptions.route + propertyControllerOptions.route;

                const nestedMod = controller[key];

                if (propertyControllerOptions.mergeMiddleware) {
                    const nestedControllerMiddleware: Function[] = Reflect.getMetadata("controllerMiddleware", nestedMod.__proto__) || [];
                    const middleware = nestedControllerMiddleware.map(func => wrap(nestedMod, func)).concat(controllerMiddleware);
                    Reflect.defineMetadata("controllerMiddleware", middleware, nestedMod.__proto__);
                }

                delete propertyControllerOptions.middleware

                Reflect.defineMetadata("controllerOptions", propertyControllerOptions, nestedMod.__proto__);

                nestedMod.app = this.app;
                nestedMod.parameters = new Map<string, Function>();

                this.loadController(nestedMod, nestedMod);
            }
        }

        if (routeMethods.length) {
            const routeParameters = Reflect.getMetadata("routeParameters", controller) || [];

            for (const key of routeParameters) {
                const parameter = Reflect.getMetadata("routeParameter", controller, key);
                if (!parameter) continue;
                // @ts-ignore
                controller.parameters.set(parameter, controller[key].bind(controller));
            }

            for (const key of routeMethods) this.loadRoute(mod, controller, key);
        }
    }

    public unload(name: string) {
        const controller = this.controllers.get(name);
        if (!controller) return;

        const routeMethods = Reflect.getMetadata("routeMethods", controller) || [];
        const controllerOptions: ControllerOptions = Reflect.getMetadata("controllerOptions", controller) || {};

        for (const key of routeMethods) {
            const routeOptions: RouteOptions = Reflect.getMetadata("routeOptions", controller, key);
            const routeName = (controllerOptions.route + routeOptions.route)
                .replace(/\/+/, "/")
                .replace(/\\+/, "/");

            this.removeRoute(routeName);
        }

        this.controllers.delete(name);
        // @ts-ignore
        delete require.cache[controller.file];
    }

    private loadRoute(mod, controller: Controller, key: string) {
        const routeOptions: RouteOptions = Reflect.getMetadata("routeOptions", controller, key);
        const routeTypes = Reflect.getMetadata("design:paramtypes", controller, key);
        const routeArgs: any[] = (Reflect.getMetadata("routeArguments", (mod.prototype || mod.__proto__), key) || []).reverse();
        const controllerOptions: ControllerOptions = { ...defaultControllerOptions, ...Reflect.getMetadata("controllerOptions", (mod || mod.__proto__)) };
        const routeMiddlewares: Function[] = Reflect.getMetadata("routeMiddlewares", (mod || mod.__proto__), key) || [];
        const middleware = controllerOptions.middleware.concat(...routeMiddlewares.map(func => wrap(controller, func)));

        const routeMethod = routeOptions.method.toLowerCase();
        const routeName = (controllerOptions.route + routeOptions.route)
            .replace(/\/+/, "/")
            .replace(/\\+/, "/");

        if (!this.app.express[routeMethod])
            return console.log(new RangeError(`Express does not have a "${routeMethod}" HTTP method.`));
        
        console.log(`Registered ${routeMethod.toUpperCase()} route ${routeName}`)

        this.app.express[routeMethod](routeName, middleware, (request, response) => {
            const routeParams = Object.entries(request.params);
            let routeParam = 0;

            if (routeArgs.filter(r => r.type === "variable").length > routeParams.length)
                throw new Error(`Route ${routeName} has path variables not specified in route decorator.`);

            for (const index in routeParams) {
                // @ts-ignore
                const func = controller.parameters.get(routeParams[index][0]);
                if (!func) continue;

                try {
                    const val = func(request, response, routeParams[index][1]);
                    if (val) {
                        request.params[routeParams[index][0]] = val;
                        routeParams[index][1] = val;
                    }
                } catch (error) {
                    const success = this.app.errors.iterate(request, response, error);
                    if (!success) throw error; else return;
                }
            }

            try {
                const args = routeArgs.map(arg => {
                    if (arg.type === "parameter" && arg.name) return routeParams.find(p => p[0] === arg.name)[1];

                    switch (arg.type) {
                        case "request": return request;
                        case "body": return this.makeBody(routeTypes[arg.index], request.body, arg.validate)
                        case "response": return response;
                        case "parameter": return routeParams[routeParam++][1];
                    }
                });

                controller[key](...args);
            } catch (error) {
                const success = this.app.errors.iterate(request, response, error);
                if (!success) throw error;
            }
        })
    }

    public removeRoute(route: string) {
        const stack: any[] = this.app.express._router.stack;
        const index = stack.findIndex(s => (s.route || {}).path === route);
        stack.splice(index, 1);
    }

    public init(app: Application) {
        this.app = app;
        this.loadAll();
    }

    private makeBody(Model, body: Record<string, unknown>, validate = false) {
        const model = new Model();
        for (const [key, value] of Object.entries(body)) model[key] = value;

        if (validate) {
            let joi = null;

            try {
                joi = require("joiful");
            } catch {
                throw new Error("Cannot use Joi validation when module \"joiful\" is not installed.");
            }

            const res = joi.validate(model);
            if (res.error) throw res.error;
        }

        return model;
    }
}