import { Application } from "./Application";
import { Request, Response } from "express";
import { readDir } from "./Utils";
import { join } from "path";
import { existsSync } from "fs";

export interface Controller {
    readonly app: Application;
}

function checkRoute(route: string) {
    if (route.length !== 1 && !route.startsWith("/"))
        throw new RangeError("Controller route must start with a forward slash.");
    if (route.length !== 1 && !/[a-z]$/i.test(route))
        throw new RangeError("Controller route must end with A to Z.");
}

export function Controller(route: string) {
    return <T extends { new(...args: any[]): {} }>(constructor: T) => {
        checkRoute(route);

        Reflect.defineMetadata("expressController", true, constructor);
        constructor.prototype.route = route;
        return constructor;
    }
}

export function MethodController(route: string) {
    return (target: any, propertyKey: string) => {
        checkRoute(route);

        let programList: string[] = Reflect.getMetadata("propertyControllers", target) || [];
        programList.push(propertyKey);
        Reflect.defineMetadata("propertyControllers", programList, target);

        Reflect.defineMetadata("propertyControllerRoute", route, target, propertyKey);
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

export function Middleware(...functions: ((request: Request, response: Response) => void)[]) {
    if (!functions.length)
        throw new RangeError("@Middleware() decorator requires at least one middleware to be present.");

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

        mod.default.prototype.file = file;
        mod.default.prototype.app = this.app;
        mod.default.prototype.parameters = new Map<string, Function>();

        const controller = new mod.default();
        this.controllers.set(name.slice(0, -3), controller);

        this.loadController(mod.default, controller)
    }

    private loadController(mod: any, controller: Controller) {
        const propertyControllers = Reflect.getMetadata("propertyControllers", controller) || [];
        const routeMethods = Reflect.getMetadata("routeMethods", controller) || [];

        if (propertyControllers.length) {
            for (const key of propertyControllers) {
                const propertyControllerRoute =  Reflect.getMetadata("propertyControllerRoute", controller, key);
                // @ts-ignore
                const finalRoute = controller.route + propertyControllerRoute;

                const nestedMod = controller[key];

                nestedMod.app = this.app;
                nestedMod.parameters = new Map<string, Function>();
                nestedMod.route = finalRoute;

                this.loadController(nestedMod, nestedMod);
            }
        }

        if (routeMethods.length) {
            const routeParamters = Reflect.getMetadata("routeParameters", controller) || [];

            for (const key of routeParamters) {
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

        for (const key of routeMethods) {
            const routeOptions: RouteOptions = Reflect.getMetadata("routeOptions", controller, key);
            const routeMethod = routeOptions.method.toLowerCase();
            // @ts-ignore
            const routeName = (controller.route + routeOptions.route)
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
        // @ts-ignore
        const routeArgs: any[] = (Reflect.getMetadata("routeArguments", (mod.prototype || mod.__proto__), key) || []).reverse();
        // @ts-ignore
        const routeMiddlewares = Reflect.getMetadata("routeMiddlewares", (mod.prototype || mod.__proto__), key) || [];
        const routeMethod = routeOptions.method.toLowerCase();
        // @ts-ignore
        const routeName = (controller.route + routeOptions.route)
            .replace(/\/+/, "/")
            .replace(/\\+/, "/");

        if (!this.app.express[routeMethod])
            return console.log(new RangeError(`Express does not have a "${routeMethod}" HTTP method.`));

        this.app.express[routeMethod](routeName, (request, response) => {
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

            for (const middleware of routeMiddlewares) {
                try {
                    middleware(request, response);
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

    private makeBody(klazz, body, validate) {
        const klass = new klazz();
        for (const [key, value] of Object.entries(body)) klass[key] = value;

        if (validate) {
            const { validate } = require("joiful");
            const res = validate(klass);
            if (res.error) throw res.error;
        }

        return klass;
    }
}