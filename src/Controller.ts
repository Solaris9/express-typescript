import { Application } from "./Application";
import path from "path";
import util from "util";
import fs from "fs";

export function Controller(route: string) {
    return <T extends { new(...args: any[]): {} }>(constructor: T) => {
        if (route.length !== 1 && !route.startsWith("/")) throw new RangeError("Controller route must start with a forward slash.")
        if (route.length !== 1 && !/[a-z]$/i.test(route)) throw new RangeError("Controller route must end with A to Z.")

        Reflect.defineMetadata("expressController", true, constructor);
        constructor.prototype.route = route;
        return constructor;
    }
}

type Types  = "request" | "response" | "variable" | "next" | "body";

function decorator(type: Types, target: any, propertyKey: string, parameterIndex: number, name?: string) {
    const meta = Reflect.getMetadata("routeArguments", target, propertyKey) || [];
    meta.push({ index: parameterIndex, type, name });
    Reflect.defineMetadata("routeArguments", meta, target, propertyKey);
}

export function RequestBody(target: any, propertyKey: string, parameterIndex: number) {
    decorator("body", target, propertyKey, parameterIndex)
}

export function HTTPRequest(target: any, propertyKey: string, parameterIndex: number) {
    decorator("request", target, propertyKey, parameterIndex)
}

export function HTTPResponse(target: any, propertyKey: string, parameterIndex: number) {
    decorator("response", target, propertyKey, parameterIndex)
}

export function Next(target: any, propertyKey: string, parameterIndex: number) {
    decorator("next", target, propertyKey, parameterIndex)
}

export function PathVariable(variable?: string) {
    return (target: any, propertyKey: string, parameterIndex: number) => {
        decorator("variable", target, propertyKey, parameterIndex, variable)
    }
}

export type Methods = "ALL" | "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD" | string

export interface RequestOptions {
    route: string;
    method?: Methods;
}

export function GetMapping(route: string) {
    return RequestMapping(route, "GET")
}

export function PutMapping(route: string) {
    return RequestMapping(route, "PUT")
}

export function PatchMapping(route: string) {
    return RequestMapping(route, "PATCH")
}

export function PostMapping(route: string) {
    return RequestMapping(route, "POST")
}

export function DeleteMapping(route: string) {
    return RequestMapping(route, "DELETE")
}

export function RequestMapping(options: RequestOptions);
export function RequestMapping(route: string, method?: Methods);
export function RequestMapping(routeOrOptions: string | RequestOptions, method?: Methods) {
    return function (target, propertyKey: string, descriptor: PropertyDescriptor) {
        let programList: string[] = Reflect.getMetadata("routeMethods", target) || [];
        programList.push(propertyKey);
        Reflect.defineMetadata("routeMethods", programList, target);

        let options: RequestOptions;

        if (typeof routeOrOptions === "string") {
            options = { route: routeOrOptions, method: method || "GET" };
        } else {
            options = { method: "GET", ...routeOrOptions };
        }

        Reflect.defineMetadata("routeOptions", options, target, propertyKey);
    }
}

export function Middleware(...functions: ((request: Request, response: Response, next: () => void) => void)[]) {
    if (!functions.length) throw new RangeError("@Middleware() annotation requires at least one middleware to be present.");

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
    public fullDirectory: string;
    public parameters = new Map<string, Function>();
    public init(app: Application) {
        if (fs.existsSync(app.options.controllers)) {
            this.fullDirectory = app.options.controllers;
        } else {
            this.fullDirectory = path.join(app.applicationDirectory, app.options.controllers || "controllers");
        }

        const directory = fs.readdirSync(this.fullDirectory).filter(f => f.endsWith(".js"));

        controllers:
        for (const file of directory) {
            const mod = require(path.join(this.fullDirectory, file));

            if (!mod.default) {
                console.error(`Controller located at ${file} has no default export.`);
                continue;
            }

            if (Reflect.getMetadata("expressController", mod.default) !== true) {
                console.error(`Controller located at ${file} is not annotated with @Controller.`);
                continue;
            }

            const controller = new mod.default();
            const routeMethods = Reflect.getMetadata("routeMethods", controller) || [];

            if (!routeMethods.length) {
                console.log(`Controller ${file} does not have any routes.`);
                continue controllers;
            }

            const routeParamters = Reflect.getMetadata("routeParameters", controller) || [];

            parameters:
            for (const key of routeParamters) {
                const parameter = Reflect.getMetadata("routeParameter", controller, key);
                if (!parameter) continue parameters;
                this.parameters.set(parameter, controller[key].bind(controller));
            }

            routes:
            for (const key of routeMethods) {
                const routeOptions: RequestOptions = Reflect.getMetadata("routeOptions", controller, key);
                const routeTypes = Reflect.getMetadata("design:paramtypes", controller, key);
                const routeArgs = Reflect.getMetadata("routeArguments", mod.default.prototype, key).reverse();
                const routeMiddlewares = Reflect.getMetadata("routeMiddlewares", mod.default.prototype, key) || [];
                const routeMethod = routeOptions.method.toLowerCase();
                const routeName = (controller.route + routeOptions.route)
                    .replace(/\/+/, "/")
                    .replace(/\\+/, "/");

                if (!app.express[routeMethod]) {
                    console.log(new RangeError(`Express does not have a "${routeMethod}" HTTP method.`));
                    continue routes;
                }

                app.express[routeMethod](routeName, routeMiddlewares, (request, response, next) => {
                    const routeParams = Object.entries(request.params);
                    let routeParam = 0;

                    if (routeArgs.filter(r => r.type === "variable").length > routeParams.length)
                        throw new Error(`Route ${routeName} has path variables not specified in route annotation.`)

                    innerParameters:
                    for (const index in routeParams) {
                        const func = this.parameters.get(routeParams[index][0]);
                        if (!func) continue innerParameters;
                        routeParams[index][1] = func(request, response, routeParams[index][1]);
                    }

                    const args = routeArgs.map(arg => {
                        if (arg.type === "variable" && arg.name) {
                            return routeParams.find(p => p[0] === arg.name)[1]
                        }

                        switch (arg.type) {
                            case "request": return request;
                            case "body": return this.makeBody(routeTypes[arg.index], request.body);
                            case "response": return response;
                            case "next": return next;
                            case "variable": return routeParams[routeParam++][1];
                        }
                    });

                    controller[key](...args);
                })
            }
        }
    }

    makeBody(clazz, body) {
        clazz = new clazz();
        for (const [key, value] of Object.entries(body)) clazz[key] = value;
        return clazz;
    }
}