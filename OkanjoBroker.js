"use strict";

const Cluster = require('cluster');
const EventEmitter = require('events').EventEmitter;

/**
 * Class to manage workers of the given type
 */
class OkanjoBroker extends EventEmitter {

    /**
     * Constructor
     * @param {OkanjoApp} app – Current application context
     * @param {string} type - Worker type
     * @param {{workerCount:number, recycleRate: number}} options – OkanjoBroker options
     */
    constructor(app, type, options) {
        super();

        // Verify we have an active application context
        if (Object.getPrototypeOf(app || {}).constructor.name !== "OkanjoApp") {
            throw new Error(`You need to provide the current app context when making a broker. Got: ${Object.getPrototypeOf(app || {}).constructor.name}`);
        } else {
            this.app = app;
        }

        if (!options) {
            options = {};
        }

        // State flag to determine whether to start workers or let them fall off
        this.drainOpen = false;

        this.type = type;
        this.workerCount = options.workerCount === undefined ? 1 : options.workerCount;
        this.recycleRate = options.recycleRate || 0;
        this.debug = options.debug !== undefined ? options.debug : false;

        this._workerIds = {};

        this._init();
    }

    /**
     * Drop a debugging message to the console if configured to do so
     */
    _log() {
        if (this.debug) {
            console.error.apply(null, Array.prototype.splice(null, arguments)); // eslint-disable-line no-console
        }
    }

    /**
     * Initializes and starts the broker
     */
    _init() {

        // Initialize the container to hold onto worker id numbers
        this._workerIds[this.type] = [];

        // Notify this broker is starting up
        this._log(this.type + ': broker started');

        // Spawn workforce
        for (let i = 0; i < this.workerCount; i++) {
            this._spawnWorker();
        }

        // Activate recycling program to keep things tidy (e.g. whack memory, etc)
        if (this.recycleRate && this.recycleRate > 0) {
            setInterval(() => this.recycleWorkers(), this.recycleRate);
        }
    }

    /**
     * Spawns a new worker instance
     */
    _spawnWorker() {
        const worker = Cluster.fork({worker_type: this.type, env: this.app.currentEnvironment});

        this._workerIds[this.type].push(worker.id+"");

        this._log(this.type+': started worker id='+worker.id);

        // noinspection JSUnusedGlobalSymbols
        worker.on('exit', (code, signal) => {

            // Is this our worker?
            const id = worker.id + "";

            // Remove the reference to the worker id
            this._workerIds[this.type].splice(this._workerIds[this.type].indexOf(id), 1);

            if (!this.app.gracefulShutdown && !this.drainOpen) {

                if (worker.exitedAfterDisconnect === true) {
                    // Death was intentional, so don't spawn again
                    this.emit('worker_ended', { id, code, signal, worker });
                } else {
                    this.app.report(new Error(this.type + ' worker id='+ worker.id +' died!'), { broker: this.type, worker_id: id, code: code, signal: signal });
                    this.emit('worker_death', { id, code, signal, worker });
                }

                // Replace this worker in the workforce
                this._spawnWorker();

            } else {
                this.emit('worker_ended', { id, code, signal, worker });
                this._log(this.type +': shutting down, will not respawn workers');
            }

        });

        // noinspection JSUnusedGlobalSymbols
        /* istanbul ignore next */
        worker.on('error', (err) => {
            this.app.report(this.type + ': Worker error!', err);
        });

        // noinspection JSUnusedGlobalSymbols
        worker.on('disconnect', () => {
            if (worker._disconnectTimer) {
                this._log(this.type + ': cleared worker id='+worker.id+' disconnect timeout');
                clearTimeout(worker._disconnectTimer);
            } else {
                this._log(this.type + ': Worker id=' + worker.id+' disconnected - No timeout to clear. Did it crash?');
            }

            // noinspection JSUnusedGlobalSymbols
            setTimeout(() => {
                if (!worker.isDead()) {
                    // Worker is still hanging around. Kick it's butt!
                    worker.kill();
                    this._log(this.type + ': followup on worker id='+worker.id+': was still alive so we killed it');
                }
            }, 1000);

        });

        // noinspection JSUnusedGlobalSymbols
        worker.on('message', (msg) => {
            if (typeof msg === "object" && msg.type === "ops") {
                // TODO – Handle worker metrics by sending to Redis for aggregation (worker.id, msg.data)
                this.emit('worker_ops', msg, worker);
            } else {
                // If anyone cares, pass the event on to the broker's handlers
                this.emit('worker_message', msg, worker);
            }
        });
    }

    /**
     * Attempts to gracefully kill a worker before hard killing it
     * @param id - Worker id
     * @private
     */
    _bounceWorker(id) {
        try {

            // Tell the worker to seppuku
            const worker = Cluster.workers[id];
            const workerId = Cluster.workers[id].id;

            worker.send('suicide');

            // Give it 2 seconds to clean up before we pull life support
            // noinspection JSUnusedGlobalSymbols
            worker._disconnectTimer = setTimeout(() => {
                /* istanbul ignore else */
                // Only kill it if it's still around - it might have cleared out by the time this gets called
                if (worker) {
                    this._log(this.type + ': Worker disconnect timeout expired, killing id=' + id);
                    worker.kill();
                }
            }, 2000);

            worker.disconnect();

            this._log(this.type + ': worker id=' + workerId);

        } catch(e) {
            /* istanbul ignore next: out of scope - got this to occur when bouncing a server and killing it at the same time, the log line died */
            this.app.report('Could not bounce worker gracefully, probably a race?', e);
        }
    }

    /**
     * Recycles all worker instances gracefully
     */
    recycleWorkers() {
        // Iterate over the cluster workers but only bounce the ones that belong to this broker
        for (let id in Cluster.workers) {
            if (Cluster.workers.hasOwnProperty(id) && this._workerIds[this.type].indexOf(id) >= 0) {
                this._bounceWorker(id);
            } else {
                this._log(this.type + ': recycle worker with id='+ id +' not found');
            }
        }
    }

    /**
     * Prevents new workers from starting and kills off existing workers gracefully
     */
    drainWorkers() {
        this.drainOpen = true;
        this.recycleWorkers();
    }

    /**
     * Allows new workers to start and refills the workforce if needed
     */
    resumeWorkers() {
        this.drainOpen = false;

        // Spawn workforce
        for (let i = this._workerIds[this.type].length; i < this.workerCount; i++) {
            this._spawnWorker();
        }
    }
}

// Export the worker helper class for use
/**
 * Okanjo worker base class
 * @type {OkanjoWorker}
 */
OkanjoBroker.OkanjoWorker = require('./OkanjoWorker');

module.exports = OkanjoBroker;