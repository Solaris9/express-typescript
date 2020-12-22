## express-typescript

Express framework powered by TypeScript.

Note: I am not a professional programmer, just a hobbyist who likes to explore new ideas.

I made this because I was bored in quarantine, it's basically what the title says. An express framework but powered by TypeScript.

# Start

There are two ways to start using express-typescript, one would be using the CLI without a main file and the other with a main file.

Both will use the CLI command `express-typescript` to start the express server

Flags for the CLI:

> These can be found with the `--help` flag.

-   main

> The main file to start, it will use the directory of this file to load the controllers and the error handlers \
> Type: string

-   port

> The port to start the server on. \
> Type: number \
> Default: 8080

-   controllers

> The directory for controllers handlers. \
> Type: string

-   errors

> The directory for error handlers. \
> Type: number

## CLI

If you do not want to have an empty main file you can use the CLI to start the server with a default main class.

This looks for a folder named `controllers` and `errors` to load those files, you can specify those as options.

```shell
express-typescript
```

## ExpressApplication

> NOTE: This _IGNORES_ command line options other than the `main` option.

You can start the server with a main file for some extra [options](#expressoptions):

```typescript
import { ExpressApplication } from 'express-typescript';

@ExpressApplication(/* options */)
export default class Application {
    // Add whatever you want here, it'll be available in the Controllers/ErrorsHandlers.
}
```

Then start it using the CLI command:

```shell
express-typescript ./main.js

express-typescript --main ./main.js
```

### ExpressOptions

-   controllers

> The directory for controllers. \
> Type: controllers

-   errors

> The directory for controllers. \
> Type: controllers

-   port

> The port to start the server on. \
> Type: number \
> Default: 8080

-   middleware

> The middlewares to use.

# Features

There's a bunch more stuff I added too.

-   [@Controller()](#controller)
-   [@RouteParameter()](#routeparameter)
-   [@Parameter()](#parameter)
-   [@Middleware()](#middleware)
-   [@Use()](#use)
-   [@RequestBody](#requestbody)
-   [@Validate](#requestbody)

# Controller

Decorate a class to be a controller in the controllers folder.

```typescript
import { Response } from 'express';
import { Controller, HTTPResponse } from 'express-typescript';

// @Controller decorator required to make it a controller, with a route as an argument.
@Controller('/')
export default class MainController {
    // Appends to the Controller route, making it "/" as a GET request.
    @Controller.Get('')
    // Decorate "res" as a HTTPResponse, required so it can pass it from the express method.
    public index(@HTTPResponse res: Response) {
        // And finally send a response.
        res.send('Hello world!');
    }
}
```

You can specify a class property to be its own controller.

```typescript
import { Response } from 'express';
import { Controller, HTTPResponse, RouteParameter } from 'express-typescript';

@Controller('/')
export default class MainController {
    // Specify class property to be a controller.
    @Controller('/nested')
    // Assign the controller to the property.
    public nested = new NestedController();
}

class NestedController {
    // Specify a route parameter, this will prefix the parent controller route to this.
    @Controller.Get('')
    public index(@HTTPResponse res: Response) {
        // And finally send a response.
        res.send('Hello world!'); // Get request to /nested will return "Hello world!".
    }
}
```

You can also give

# @RouteParameter()

Specifies an argument to be a path parameter.

```typescript
import { Response } from 'express';
import { Controller, HTTPResponse, RouteParameter } from 'express-typescript';

@Controller('/')
export default class MainController {
    // Specify a route parameter.
    @Controller.Get('/:name')
    // Decorate a argument as a path variable.
    public index(@RouteParameter() name: string, @HTTPResponse res: Response) {
        // Use name parameter without doing request.params.name.
        res.send(`Hello ${name}!`);
    }
}
```

If you were paying attention you might have noticed that it has optional parameters in the @RouteParameter() decorator.
That if because express-typescript will pass the route parameters as specified by the @RouteParameter() position.
You can override this by specifying the route parameter name as a string in @RouteParameter() decorator.

# @Parameter()

Specifies a parameter function to be ran for a parameter.

```typescript
import { Response, Request } from 'express';
import { Controller, HTTPResponse, RouteParameter, Parameter } from 'express-typescript';

@Controller('/')
export default class MainController {
    // Decorate the method with @Parameter(), optionally passing the route parameter name if it's not allowed by JavaScript.
    @Parameter()
    // It'll pass the Request, Response and the value of the parameter.
    public name(req: Request, res: Response, name: string) {
        // Throw an error to exit (basically same as not calling next()) and handle the error in a ErrorHandler.
        if (name === 'test') throw new Error('Forbidden name.');
        // Return the value (basically the same as next() but assigns the value to the RouteParameter).
        return User.find({ name });
    }

    @Controller.Get('/:name')
    public index(@RouteParameter() user: User, @HTTPResponse res: Response) {
        res.send(`Hello ${user.fullName}!`); // Get request to /solaris will return "Hello Solaris!".
    }
}
```

# @Middleware()

Adds middleware to the controller, this is specific to that controller only.

```typescript
import { Response, Request } from 'express';
import { Controller, HTTPResponse, Middleware } from 'express-typescript';

@Controller('/')
export default class MainController {
    // Define a method to be used as middleware.
    @Middleware
    public logTime(req: Request, res: Response) {
        console.log(`Date: ${new Date().toDateString()}`);
        // With/without return will act as next(), you can throw errors to be caught in your custom error handlers or be handled by express normally.
    }

    @Controller.Get('/')
    public index(@HTTPResponse res: Response) {
        res.send('Hello world!'); // Will log the current date.
    }
}
```

# @Use()

Uses middleware to the route, this is specific to that route only.

```typescript
import { Response, Request } from 'express';
import { Controller, HTTPResponse, Middleware } from 'express-typescript';

// Define a function to be used as middleware.
function logTime(req: Request, res: Response) {
    console.log(`Date: ${new Date().toDateString()}`);
    // With/without return will act as next(), you can throw errors to be caught in your custom error handlers or be handled by express normally.
}

@Controller('/')
export default class MainController {
    // Use the middleware on the route
    @Controller.Get('/')
    @Use(logTime)
    public index(@HTTPResponse res: Response) {
        res.send('Hello world!'); // Will log the current date.
    }
}
```

# @RequestBody

Specifies an argument to be a request body.

> Note: To use Joi data validation you must install `joiful` via npm and decorate the body with @Validate, this only works on @RequestBody.

```typescript
import { Response } from 'express';
import { Controller, HTTPResponse, RequestBody } from 'express-typescript';

// Define a class to be used as a model.
class Body {
    public name: string;
}

@Controller('/')
export default class MainController {
    @Controller.Get('/')
    // Decorate a argument with @RequestBody to use it as the request body.
    public index(@RequestBody body: Body, @HTTPResponse res: Response) {
        res.send(`Hello ${body.name}!`);
    }
}
```

# Error handling

Note: You do not need to handle errors if you do not want any custom error handling.

These must be present in the /errors folder in the application directory, or a custom one provided in the ExpressApplication decorator.

```typescript
import { Response, Request } from 'express';
import { ErrorHandler } from 'express-typescript';

export default class extends ErrorHandler {
    public supports(error: any): boolean {
        // Check whether the error is the right error, or return true if you want to match all errors.
        return error instanceof YourError;
    }

    public handle(req: Request, res: Response, error: Error) {
        // Handle the error in some way.
        res.send(error.message);
    }
}
```
