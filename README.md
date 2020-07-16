express-typescript
---
Express framework powered by TypeScript.

Note: I am not a professional programmer, just a hobbyist who likes to explore new ideas.

I made this because I was bored in quarantine, it's basically what the title says. An express application but powered by TypeScript.

You have a main file and a folder for controllers.

# ExpressApplication

Start with a main file:
```typescript
import { ExpressApplication } from "express-typescript"

// optionally specify the controllers path, full or relative.
@ExpressApplication({ port: 8080 })
export default class Application {
    // add whatever you want here, it'll be avaliable in the Controllers.
}
```
# Controllers
Then with a controller:
```typescript
import { Response } from "express";
import { Controller, GetMapping, HTTPResponse } from "express-typescript";

// @Controller decorator required to make it a controller, with a route as an argument.
@Controller("/")
export default class MainController {
    // Appends to the Controller route, making it "/" as a GET request.
    @GetMapping("")
    // Decorate "res" as a HTTPReponse, required so it can pass it from the express method.
    public index(@HTTPResponse res: Response) { 
        // And finally send a response.
        res.send("Hello world!")
    }
}
```

There's a bunch more stuff I added too.

- @PathVariable()
- @Parameter()
- @Middleware()
- @RequestBody

# @PathVariable()

Specifies an argument to be a path parameter.

```typescript
import { Response } from "express";
import { Controller, GetMapping, HTTPResponse, PathVariable } from "express-typescript";

@Controller("/")
export default class MainController {
    // Specify a route parameter.
    @GetMapping("/:name")
    // Decorate a argument as a path variable.
    public index(@PathVariable() name: string, @HTTPResponse res: Response) { 
        // Use name parameter without doing request.params.name.
        res.send(`Hello ${name}!`)
    }
}
``` 

If you were paying attention you might have noticed that it has optional parameters in the @PathVariable() decorator.
That if because express-typescript will pass the route parameters as specified by the @PathVariable().
You can override this by specifying the route parameter name as a string in @PathVariable() decorator.

# @Parameter()

Specifies a parameter function to be ran when a parameter is received.

```typescript
import { Response, Request } from "express";
import { Controller, GetMapping, HTTPResponse, PathVariable, Parameter } from "express-typescript";

@Controller("/")
export default class MainController {
    // Decorate the method with @Parameter(), optionally passing the route parameter name if it's not allowed by JavaScript, ie being numbers.
    @Parameter()
    // It'll pass the Request, Response and the value of the parameter.
    public name(req: Request, res: Response, name: string) {
        // Note: will probably be changed to next(), idk how express works that much tbh
        return name.slice(0, 1).toUpperCase() + name.slice(1, -1).toLowerCase();
    }

    @GetMapping("/:name")
    public index(@PathVariable() name: string, @HTTPResponse res: Response) { 
        res.send(`Hello ${name}!`); // Get request to /solaris will return "Hello Solaris!".
    }
}
``` 

# @Middleware()

Adds middleware to a route.

```typescript
import { Response, Request } from "express";
import { Controller, GetMapping, HTTPResponse, Middleware, Next } from "express-typescript";

// Define a function to be used as middleware.
function logTime(req: Request, res: Response, next: Next) {
    console.log(`Date: ${new Date().toDateString()}`);
    next();
}

@Controller("/")
export default class MainController {
    @GetMapping("/")
    // Pass the function to the @Middleware() decorator.
    @Middleware(logTime)
    public index(@HTTPResponse res: Response) { 
        res.send("Hello world!");
    }
}
``` 

# @RequestBody

Specifies an argument to be a request body.

```typescript
import { Response, Request } from "express";
import { Controller, GetMapping, HTTPResponse, RequestBody } from "express-typescript";

// Define a class to be used as a model.
class Body {
    public name: string;
}

@Controller("/")
export default class MainController {
    @GetMapping("/")
    // Decorate a argument with @RequestBody to use it as the request body.
    public index(@RequestBody body: Body, @HTTPResponse res: Response) { 
        res.send(`Hello ${body.name}!`);
    }
}
``` 

And that's all I have for it right now, some planned things are:
- Joi body validation using @Validate decorator
- @QueryParameter()
- Possible the use of Koa as someone who shut up about it
