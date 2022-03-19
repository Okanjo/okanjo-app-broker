# Okanjo Service Broker

[![Node.js CI](https://github.com/Okanjo/okanjo-app-broker/actions/workflows/node.js.yml/badge.svg)](https://github.com/Okanjo/okanjo-app-broker/actions/workflows/node.js.yml) [![Coverage Status](https://coveralls.io/repos/github/Okanjo/okanjo-app-broker/badge.svg?branch=master)](https://coveralls.io/github/Okanjo/okanjo-app-broker?branch=master)

Scalable and reliable worker management, that:

* can recover from crashes (e.g. if a fatal error happens, the broker will add new worker to replace it)
* can be reloaded (e.g. use it for hot reloading on file changes)
* can be stopped and started (e.g. use it for part-time services)
* can manage multiple different types of workers in a single app
* is extendable!

## Installing

Add to your project like so: 

```sh
npm install okanjo-app-broker
```

Note: requires the [`okanjo-app`](https://github.com/okanjo/okanjo-app) module.

## Breaking Changes
 * v3.0.0
   * Updated okanjo-app version requirement (v3.0.0+)
 * v2.0.0
   * Updated base OkanjoWorker methods `init` and `prepareForShutdown` to be async functions

## Example Usage

Here's a super basic, single file demonstration. 

```js
const Cluster = require('cluster');
const OkanjoApp = require('okanjo-app');
const OkanjoBroker = require('okanjo-app-broker');
const OkanjoWorker = require('okanjo-app-broker/OkanjoWorker');

const config = {
    apiBroker: {
        workerCount: 1,
        recycleRate: 0
    }
}
const app = new OkanjoApp(config);

// Check if we're a fork or not
if (Cluster.isMaster) {
    // If we are the master process, then start the worker broker
    const apiBroker = new OkanjoBroker(app, 'api', app.config.apiBroker);
} else {
    // If we are a worker process, then start the appropriate type of worker
    const workerType = process.env.worker_type;
    if (workerType === 'api') {
        
        // Since OkanjoWorker is just a base class, let's fake a server worker
        class MyWorker extends OkanjoWorker {
            constructor(app) {
                super(app, {});
            }
            
            init() {
                console.log('Start the server here...');
            }
            
            prepareForShutdown() {
                console.log('Stop the server here...');
                this.shutdown();
            }
        }
        
        // create the worker instance, which starts automatically
        const worker = new MyWorker(app);
        
    } else {
        app.report('Unknown worker started', { workerType });
        process.exit(1);
    }
}
```

You can make this much more elaborate by launching multiple brokers, separating workers to their own modules, and so on.

# OkanjoBroker

Service broker class. Must be instantiated to be used.

## Properties

* `broker.app` – The OkanjoApp instance provided when constructed
* `broker.drainOpen` – (read-only)  Whether the workers are being drained (`true`) or not (`false`)
* `broker.type` – (read-only) The string name given to the broker, indicating worker type.
* `broker.workerCount` - (read-only) How many workers the broker should maintain.
* `broker.recycleRate` – (read-only) How often the broker should bounce workers for new ones, in milliseconds. `0` is disabled.
* `broker.debug` – Whether verbose broker messages should be logged to stderr.

## Methods

### `new OkanjoBroker(app, type, [options])`
Creates a new service broker instance. Workers will be started automatically.
* `app` – The OkanjoApp instance to bind to
* `type` – (string) The type of workers the broker will spawn.
* `options` – (optional) The configuration object
  * `options.workerCount` – The number of workers the broker should keep active. Default is `1`.
  * `options.recycleRate` – How often the broker should replace workers, in milliseconds. Default is `0` (disabled)
  * `options.debug` – Whether to show verbose broker messages in stderr.

### `broker.recycleWorkers()`
Replaces all active workers with new ones. Useful for hot-reloading services after changes.
 
### `broker.drainWorkers()`
Stops all active workers and prevents new ones from starting.

### `broker.resumeWorkers()`
Allows workers to start after having been drained, and starts the workers again.


## Events

### `broker.on('worker_ended', (data) => {...})`
Fired when a worker exited normally.
* `data.id` - Worker's id
* `data.code` – Worker's exit code
* `data.signal` – Worker's exit signal
* `data.worker` – Cluster worker instance

### `broker.on('worker_death', (data) => {...})`
Fired when a worker exited abnormally (e.g. crashed).
* `data.id` - Worker's id
* `data.code` – Worker's exit code
* `data.signal` – Worker's exit signal
* `data.worker` – Cluster worker instance

### `broker.on('worker_message', (msg, worker) => {...})`
Fired when a worker provides operational data, if implemented.
* `msg` – Message payload sent by the worker
* `worker` – Cluster worker that sent the message

### `broker.on('worker_ops', (msg, worker) => {...})`
Fired when a worker provides operational data, if implemented.
* `msg` – Message payload
* `worker` – Cluster worker that sent the report 


# OkanjoWorker 

Base class for application workers. You need to extend this class to make it do anything.

## Properties

* `worker.app` – The OkanjoApp instance provided when constructed

## Methods

* `new OkanjoWorker(app, [options])`
Constructs a new instance of a worker.
* `app` – The OkanjoApp instance to bind to
* `options` – (optional) Configuration object
  * `options.skipInit` – Don't start the worker when constructed. If truthy, then you must call `worker.init()` to start the worker.

### `async worker.init()`
Hook point to initialize your worker. Must be overridden to be useful! For example, launch your server here.

### `async worker.prepareForShutdown()`
Hook to start shutting down your worker. Useful for shutting down servers gracefully.

Note: When overriding this function, you should call `this.shutdown()` when you have finished with your shutdown procedures. 

### `worker.shutdown()`
Hook to really exit the process. Generally, you need not override this function.

### `process.send(payload)`
You can send messages to the broker from the worker.

For example, in the worker:
```js
process.send({ here: 'is some information' });
```

And on the broker, you can receive the message:
```js
broker.on('worker_message', (msg, worker) => {
    console.log(msg.here); // prints: is some information
});
```

See: [#broker.on('worker_message', (msg, worker) => {...})](`broker.on('worker_message')`)



## Extending and Contributing 

Our goal is quality-driven development. Please ensure that 100% of the code is covered with testing.

Before contributing pull requests, please ensure that changes are covered with unit tests, and that all are passing. 

### Testing

To run unit tests and code coverage:
```sh
npm run report
```

This will perform:
* Unit tests
* Code coverage report
* Code linting

Sometimes, that's overkill to quickly test a quick change. To run just the unit tests:

```sh
npm test
```

If you need to get into the weeds, you can enable verbose logging and why-is-node-running logs
```sh
VERBOSE=1 WHY=1 npm test
```

or if you have mocha installed globally, you may run `mocha test` instead.
