"use strict";

const should = require('should');
const OkanjoApp = require('okanjo-app');
const cluster = require('cluster');
const OkanjoBroker = require('../OkanjoBroker');
const { describe, it } = require('mocha');

if (cluster.isMaster) {

    if (process.env.running_under_istanbul) {
        // use coverage for forked process
        // disabled reporting and output for child process
        // enable pid in child process coverage filename
        cluster.setupMaster({
            exec: './node_modules/.bin/istanbul',
            args: [
                'cover',  '--print', 'none',  '--include-pid',
                process.argv[1], '--'].concat(process.argv.slice(2))
        });
    }

    describe('Broker', function () {

        it('should spawn an OkanjoWorker', function (done) {

            this.timeout(5000);
            /*

             So where's what's going to happen.

             1. We'll start a broker, and wait to hear from it.
             2. When we get word it's alive, then we'll drain the workers.
             3. Once we confirmed the worker is dead, we'll call the test done.

             */

            const app = new OkanjoApp({}),
                broker = new OkanjoBroker(app, "okanjoWorker", {workerCount: 1});

            const state = {
                gotAcknowledgement: false,
                sentSuicide: false,
                workerEnded: false
            };

            broker.on('worker_message', function (msg, worker) {
                if (msg === "Reporting for duty") {
                    state.gotAcknowledgement.should.be.exactly(false);
                    state.gotAcknowledgement = true;

                    // Good to go, shut it down
                    state.sentSuicide.should.be.exactly(false);
                    state.sentSuicide = true;

                    worker.send('hey code coverage!');

                    setTimeout(broker.drainWorkers.bind(broker), 10);
                } else {
                    console.log('got message from worker', msg, worker);
                    throw new Error('Should not have received this message from worker');
                }
            });

            broker.on('worker_death', function (event) {
                event.should.be.an.Object();
                throw new Error('Worker should not have died unless we told it to.');
            });

            broker.on('worker_ended', function (event) {
                event.should.be.an.Object();
                state.gotAcknowledgement.should.be.exactly(true);
                state.sentSuicide.should.be.exactly(true);
                state.workerEnded.should.be.exactly(false);

                // We ran through all the states!
                setTimeout(function () {
                    done();
                }, 1000);
            });

            broker.should.be.an.Object();
            Object.keys(broker._workerIds).length.should.be.exactly(1);
            broker._workerIds.okanjoWorker.should.be.an.Array();
        });

        it('should spawn an OkanjoWorker with delay', function (done) {

            this.timeout(5000);
            /*

             So where's what's going to happen.

             1. We'll start a broker, and wait to hear from it.
             2. When we get word it's alive, then we'll drain the workers.
             3. Once we confirmed the worker is dead, we'll call the test done.

             */

            const app = new OkanjoApp({}),
                broker = new OkanjoBroker(app, "okanjoWorkerDelay", {workerCount: 1});

            const state = {
                gotAcknowledgement: false,
                sentSuicide: false,
                workerEnded: false
            };

            broker.on('worker_message', function (msg, worker) {
                if (msg === "Reporting for duty") {
                    state.gotAcknowledgement.should.be.exactly(false);
                    state.gotAcknowledgement = true;

                    // Good to go, shut it down
                    state.sentSuicide.should.be.exactly(false);
                    state.sentSuicide = true;

                    worker.send('hey code coverage!');

                    setTimeout(broker.drainWorkers.bind(broker), 10);
                } else {
                    console.log('got message from worker', msg, worker);
                    should(msg).equal('THIS SHOULD NOT HAVE HAPPENED');
                    throw new Error('Should not have received this message from worker');
                }
            });

            broker.on('worker_death', function (event) {
                event.should.be.an.Object();
                throw new Error('Worker should not have died unless we told it to.');
            });

            broker.on('worker_ended', function (event) {
                event.should.be.an.Object();
                state.gotAcknowledgement.should.be.exactly(true);
                state.sentSuicide.should.be.exactly(true);
                state.workerEnded.should.be.exactly(false);

                // We ran through all the states!
                setTimeout(function () {
                    done();
                }, 1000);
            });

            broker.should.be.an.Object();
            Object.keys(broker._workerIds).length.should.be.exactly(1);
            //broker._workerIds.okanjoWorker.should.be.an.Array();
        });

        it('should spawn an OkanjoWorker and die with SIGINT', function (done) {

            this.timeout(5000);
            /*

             So where's what's going to happen.

             1. We'll start a broker, and wait to hear from it.
             2. When we get word it's alive, then we'll drain the workers.
             3. Once we confirmed the worker is dead, we'll call the test done.

             */

            const app = new OkanjoApp({}),
                broker = new OkanjoBroker(app, "okanjoWorker", {workerCount: 1});

            const state = {
                gotAcknowledgement: false,
                sentSuicide: false,
                workerEnded: false
            };

            broker.on('worker_message', function (msg, worker) {
                if (msg === "Reporting for duty") {
                    state.gotAcknowledgement.should.be.exactly(false);
                    state.gotAcknowledgement = true;

                    // Good to go, shut it down
                    state.sentSuicide.should.be.exactly(false);
                    state.sentSuicide = true;

                    worker.send('hey code coverage!');

                    // Manually set the drain flag but don't do the draining
                    broker.drainOpen = true;

                    // Send a signal to the worker
                    worker.process.kill('SIGINT');

                } else {
                    console.log('got message from worker', msg, worker);
                    throw new Error('Should not have received this message from worker');
                }
            });

            broker.on('worker_death', function (event) {
                event.should.be.an.Object();
                throw new Error('Worker should not have died unless we told it to.');
            });

            broker.on('worker_ended', function (event) {
                event.should.be.an.Object();
                state.gotAcknowledgement.should.be.exactly(true);
                state.sentSuicide.should.be.exactly(true);
                state.workerEnded.should.be.exactly(false);

                // We ran through all the states!
                setTimeout(function () {
                    done();
                }, 1000);
            });

            broker.should.be.an.Object();
            Object.keys(broker._workerIds).length.should.be.exactly(1);
            broker._workerIds.okanjoWorker.should.be.an.Array();
        });

        it('should spawn an OkanjoWorker and die with SIGTERM', function (done) {

            this.timeout(5000);
            /*

             So where's what's going to happen.

             1. We'll start a broker, and wait to hear from it.
             2. When we get word it's alive, then we'll drain the workers.
             3. Once we confirmed the worker is dead, we'll call the test done.

             */

            const app = new OkanjoApp({}),
                broker = new OkanjoBroker(app, "okanjoWorker", {workerCount: 1});

            const state = {
                gotAcknowledgement: false,
                sentSuicide: false,
                workerEnded: false
            };

            broker.on('worker_message', function (msg, worker) {
                if (msg === "Reporting for duty") {
                    state.gotAcknowledgement.should.be.exactly(false);
                    state.gotAcknowledgement = true;

                    // Good to go, shut it down
                    state.sentSuicide.should.be.exactly(false);
                    state.sentSuicide = true;

                    worker.send('hey code coverage!');

                    // Manually set the drain flag but don't do the draining
                    broker.drainOpen = true;

                    // Send a signal to the worker
                    worker.process.kill('SIGTERM');

                } else {
                    console.log('got message from worker', msg, worker);
                    throw new Error('Should not have received this message from worker');
                }
            });

            broker.on('worker_death', function (event) {
                event.should.be.an.Object();
                throw new Error('Worker should not have died unless we told it to.');
            });

            broker.on('worker_ended', function (event) {
                event.should.be.an.Object();
                state.gotAcknowledgement.should.be.exactly(true);
                state.sentSuicide.should.be.exactly(true);
                state.workerEnded.should.be.exactly(false);

                // We ran through all the states!
                setTimeout(function () {
                    done();
                }, 1000);
            });

            broker.should.be.an.Object();
            Object.keys(broker._workerIds).length.should.be.exactly(1);
            broker._workerIds.okanjoWorker.should.be.an.Array();
        });

    });

} else {

    if (process.env.worker_type === 'okanjoWorker' || process.env.worker_type === 'okanjoWorkerDelay') {

        // Test the worker!
        describe('OkanjoWorker', function() {

            it('should have the basic process info', function() {
                // We should always have an env set, even if it's "default"
                process.env.env.should.be.ok();

                // We should always have a worker type
                process.env.worker_type.should.be.ok();
            });

            // Make a unit test worker class extension

            class UnitTestWorker extends OkanjoBroker.OkanjoWorker {
                constructor() {
                    if (process.env.worker_type === 'okanjoWorkerDelay') {
                        super({}, { skipInit: true });

                        // The idea is to delay the init (e.g. something else handled it)
                        setTimeout(() => {
                            this.init();
                        }, 25);
                    } else {
                        super();
                    }
                }

                // Make the init function hold open the process
                init() {
                    super.init();

                    // noinspection JSUnusedGlobalSymbols
                    this.interval = setInterval(function() {
                        console.error('tick');
                    }, 5000);

                    // Tell the unit test that we are alive
                    process.send('Reporting for duty');
                }
            }

            let worker;

            it('should instantiate', function() {
                worker = new UnitTestWorker();

                worker.should.be.an.Object();
                worker.should.be.instanceof(OkanjoBroker.OkanjoWorker);
                worker.should.be.instanceof(UnitTestWorker);
            });

            it('should exit when asked to do so', function(done) {

                this.timeout(10000);

                worker.shutdown = function() {
                    done();
                    OkanjoBroker.OkanjoWorker.prototype.shutdown.call(this);
                };

            });

        });

    }

}