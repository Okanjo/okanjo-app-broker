"use strict";

/**
 * Worker base class - Must be extended to be useful
 */
class OkanjoWorker {

    /**
     * Constructor
     * @param {OkanjoApp} [app] - Okanjo app instance, if needed
     * @param {*} [options]
     */
    constructor(app, options) {
        this.app = app;
        options = options || {};

        // Set the process title to the name of this worker - Not 100% sure this will do anything
        process.title = `node-${process.env.worker_type}-${process.env.env}`;

        // Automatically initialize unless opted out
        if (!options.skipInit) {
            this.init();
        }

        // Handle notifications from master to shutdown
        process.on('message', async (message) => {
            if (message === "suicide") {
                await this.prepareForShutdown();
            }
        });

        // Handle process termination signals
        this._bindProcessSignals();
    }

    /**
     * Initialize the worker
     */
    async init() {
        // This method is intended to be overridden
    }

    /**
     * Monitors for process events and intercepts signals to try to graceful shutdown (hook point)
     */
    _bindProcessSignals() {
        this._signalHandlers = {
            SIGINT: () => {
                this.prepareForShutdown(false);
            },
            SIGTERM: () => { // ubuntu shutdown / restart
                this.prepareForShutdown(false);
            }
        };
        process.on('SIGINT', this._signalHandlers.SIGINT);
        process.on('SIGTERM', this._signalHandlers.SIGTERM);
    }

    /**
     * Removes the process event handlers, which could allow a worker to hold open the process
     */
    unbindProcessSignals() {
        process.removeListener('SIGINT', this._signalHandlers.SIGINT);
        process.removeListener('SIGTERM', this._signalHandlers.SIGTERM);
    }

    //noinspection JSUnusedLocalSymbols
    /**
     * Starts the internal shutdown process (hook point)
     */
    async prepareForShutdown() {

        // This is where you add graceful shutdown handling
        // e.g. this.web.stop(this.shutdown.bind(this));
        //      ^ might stop HAPI and then when dead, call shutdown to end the process

        this.unbindProcessSignals();
        this.shutdown();
    }

    //noinspection JSMethodCanBeStatic
    /**
     * Shuts down the worker right now (hook point)
     */
    shutdown() {
        process.exit(0);
    }
}

module.exports = OkanjoWorker;