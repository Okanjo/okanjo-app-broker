"use strict";

const why = require('why-is-node-running'); // should be your first require
const should = require('should');
const OkanjoApp = require('okanjo-app');
const cluster = require('cluster');
const { describe, it, after } = require('mocha');


const debugEnabled = !!process.env.VERBOSE;
const logEnabled = !!process.env.WHY
function debug() {
    if (debugEnabled) {
        console.error(Array.from(arguments));
    }
}

function log() {
    if (logEnabled) {
        why();
    }
}


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

    describe('Broker', function() {

        after(() => {
            log(); // logs out active handles that are keeping node running
        });

        const OkanjoBroker = require('../OkanjoBroker');

        it('should explode if you forget an app', function() {
            try {
                new OkanjoBroker(undefined, "basic", undefined);
            } catch (e) {
                e.should.be.an.instanceof(Error);
                e.message.indexOf('context').should.be.greaterThanOrEqual(0);
            }
        });

        it('should handle basic usage scenario', function(done) {

            /*

             So where's what's going to happen.

             1. We'll start a broker, and wait to hear from it.
             2. When we get word it's alive, then we'll drain the workers.
             3. Once we confirmed the worker is dead, we'll call the test done.

             */

            const app = new OkanjoApp({}),
                broker = new OkanjoBroker(app, "basic", {
                    workerCount: 1,
                    debug: true
                });

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
                    setTimeout(broker.drainWorkers.bind(broker), 10);
                } else {
                    debug('got message from worker', msg, worker);
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
                done();
            });

            broker.should.be.an.Object();
            Object.keys(broker._workerIds).length.should.be.exactly(1);
            broker._workerIds.basic.should.be.an.Array();
        });

        it('should handle basic usage with default options', function(done) {

            /*

             So where's what's going to happen.

             1. We'll start a broker, and wait to hear from it.
             2. When we get word it's alive, then we'll drain the workers.
             3. Once we confirmed the worker is dead, we'll call the test done.

             */

            const app = new OkanjoApp({}),
                broker = new OkanjoBroker(app, "basic");

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
                    setTimeout(broker.drainWorkers.bind(broker), 10);
                } else {
                    debug('got message from worker', msg, worker);
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
                done();
            });

            broker.should.be.an.Object();
            Object.keys(broker._workerIds).length.should.be.exactly(1);
            broker._workerIds.basic.should.be.an.Array();
        });

        it('should recycle workers when told to do so', function(done) {

            /*

             So where's what's going to happen.

             1. We'll start a broker, and wait to hear from it.
             2. When we get word it's alive, then we'll recycle the workers.
             3. Once the new worker starts to replace the one we killed, we'll drain the pool.
             4. Once we confirmed the worker is dead, we'll call the test done.

             */

            const app = new OkanjoApp({}),
                broker = new OkanjoBroker(app, "recycle", {});

            const state = {
                firstWorkerId: null,
                firstWorkerGotAcknowledgement: false,
                sentRecycle: false,
                firstWorkerEnded: false,

                secondWorkerId: null,
                secondWorkerGotAcknowledgement: false,
                sentSuicide: false,
                secondWorkerEnded: false
            };

            broker.on('worker_message', function(msg, worker) {
                if (msg === "Reporting for duty") {

                    if (state.firstWorkerId === null) {
                        should(state.secondWorkerId).be.equal(null);
                        state.firstWorkerId = worker.id;

                        state.firstWorkerGotAcknowledgement.should.be.exactly(false);
                        state.firstWorkerGotAcknowledgement = true;

                        // Good to go, recycle it
                        state.sentRecycle.should.be.exactly(false);
                        state.sentRecycle = true;

                        setTimeout(broker.recycleWorkers.bind(broker), 10);

                    } else if (state.secondWorkerId === null) {
                        state.secondWorkerId = worker.id;

                        state.secondWorkerGotAcknowledgement.should.be.exactly(false);
                        state.secondWorkerGotAcknowledgement = true;

                        // Good to go, drain it
                        state.sentSuicide.should.be.exactly(false);
                        state.sentSuicide = true;
                        setTimeout(broker.drainWorkers.bind(broker), 10);

                    } else {
                        throw new Error('Too many worker acks!');
                    }

                } else {
                    debug('got message from worker', msg, worker);
                    throw new Error('Should not have received this message from worker');
                }
            });

            broker.on('worker_death', function(event) {
                event.should.be.an.Object();
                throw new Error('Worker should not have died unless we told it to.');
            });

            broker.on('worker_ended', function(event) {
                event.should.be.an.Object();
                event.id.should.be.ok();

                if (event.id === state.firstWorkerId+"") {

                    state.firstWorkerGotAcknowledgement.should.be.exactly(true);
                    state.sentRecycle.should.be.exactly(true);
                    state.firstWorkerEnded.should.be.exactly(false);
                    state.firstWorkerEnded = true;

                } else if (event.id === state.secondWorkerId+"") {

                    state.firstWorkerEnded.should.be.exactly(true);
                    state.secondWorkerGotAcknowledgement.should.be.exactly(true);
                    state.sentSuicide.should.be.exactly(true);
                    state.secondWorkerEnded.should.be.exactly(false);
                    state.secondWorkerEnded = true;

                    // We ran through all the states!
                    done();

                } else {
                    debug(typeof event.id, typeof state.firstWorkerId, state, event);
                    throw new Error('Worker ended that we could not identify!');
                }
            });

            broker.should.be.an.Object();
            Object.keys(broker._workerIds).length.should.be.exactly(1);
            broker._workerIds.recycle.should.be.an.Array();

        });

        it('should restart worker after crash', function(done) {

            /*

             So where's what's going to happen.

             1. We'll start a worker, and wait to hear from it.
             2. When we get word it's alive, then we'll tell it to crash
             3. We'll confirm the worker crash event happened, and wait for the replacement
             4. Once replaced, we'll drain the pool.
             5. Once we confirmed the worker is dead, we'll call the test done.

             */

            const app = new OkanjoApp({}),
                broker = new OkanjoBroker(app, "recycle", {});

            const state = {
                firstWorkerId: null,
                firstWorkerGotAcknowledgement: false,
                firstWorkerSentCrash: false,
                firstWorkerCrashed: false,
                firstWorkerEnded: false,

                secondWorkerId: null,
                secondWorkerGotAcknowledgement: false,
                sentSuicide: false,
                secondWorkerEnded: false
            };

            broker.on('worker_message', function(msg, worker) {
                if (msg === "Reporting for duty") {

                    if (state.firstWorkerId === null) {
                        should(state.secondWorkerId).be.equal(null);
                        state.firstWorkerId = worker.id;

                        state.firstWorkerGotAcknowledgement.should.be.exactly(false);
                        state.firstWorkerGotAcknowledgement = true;

                        // Good to go, recycle it
                        state.firstWorkerSentCrash.should.be.exactly(false);
                        state.firstWorkerSentCrash = true;

                        setTimeout(() => worker.send('crash'), 10);
                        //worker.send('crash');

                    } else if (state.secondWorkerId === null) {
                        state.secondWorkerId = worker.id;


                        state.firstWorkerCrashed.should.be.exactly(true);

                        state.secondWorkerGotAcknowledgement.should.be.exactly(false);
                        state.secondWorkerGotAcknowledgement = true;

                        // Good to go, drain it
                        state.sentSuicide.should.be.exactly(false);
                        state.sentSuicide = true;
                        setTimeout(broker.drainWorkers.bind(broker), 10);

                    } else {
                        throw new Error('Too many worker acks!');
                    }

                } else {
                    debug('got message from worker', msg, worker);
                    throw new Error('Should not have received this message from worker');
                }
            });

            broker.on('worker_death', function(event) {
                event.should.be.an.Object();

                if (event.id === state.firstWorkerId+"") {

                    state.firstWorkerCrashed.should.be.exactly(false);
                    state.firstWorkerCrashed = true;

                    state.firstWorkerEnded.should.be.exactly(false);
                    state.firstWorkerEnded = true;
                } else {
                    throw new Error('Worker should not have died unless we told it to.');
                }

            });

            broker.on('worker_ended', function(event) {
                event.should.be.an.Object();
                event.id.should.be.ok();

                if (event.id === state.firstWorkerId+"") {

                    state.firstWorkerGotAcknowledgement.should.be.exactly(true);
                    state.sentRecycle.should.be.exactly(true);
                    state.firstWorkerEnded.should.be.exactly(false);
                    state.firstWorkerEnded = true;

                } else if (event.id === state.secondWorkerId+"") {

                    state.firstWorkerEnded.should.be.exactly(true);
                    state.secondWorkerGotAcknowledgement.should.be.exactly(true);
                    state.sentSuicide.should.be.exactly(true);
                    state.secondWorkerEnded.should.be.exactly(false);
                    state.secondWorkerEnded = true;

                    // We ran through all the states!
                    done();

                } else {
                    debug(typeof event.id, typeof state.firstWorkerId, state, event);
                    throw new Error('Worker ended that we could not identify!');
                }
            });

            broker.should.be.an.Object();
            Object.keys(broker._workerIds).length.should.be.exactly(1);
            broker._workerIds.recycle.should.be.an.Array();

        });

        it('will force kill a hung worker', function(done) {
            /*

             So where's what's going to happen.

             1. We'll start a broker, and wait to hear from it.
             2. When we get word it's alive, then we'll drain the workers.
             3. Once we confirmed the worker is dead, we'll call the test done.

             */

            const app = new OkanjoApp({}),
                broker = new OkanjoBroker(app, "ignoredeath", {workerCount: 1});

            const state = {
                gotAcknowledgement: false,
                sentSuicide: false,
                workerEnded: false
            };

            broker.on('worker_message', function(msg, worker) {
                if (msg === "Reporting for duty") {
                    state.gotAcknowledgement.should.be.exactly(false);
                    state.gotAcknowledgement = true;

                    // Good to go, shut it down
                    state.sentSuicide.should.be.exactly(false);
                    state.sentSuicide = true;
                    setTimeout(() => {
                        debug('draining workers meow');
                        broker.drainWorkers();
                    }, 200);
                } else {
                    debug('got message from worker', msg, worker);
                    throw new Error('Should not have received this message from worker');
                }
            });

            broker.on('worker_death', function(event) {
                event.should.be.an.Object();
                throw new Error('Worker should not have died unless we told it to.');
            });

            broker.on('worker_ended', function(event) {
                debug('broker: worker_ended');
                event.should.be.an.Object();
                state.gotAcknowledgement.should.be.exactly(true);
                state.sentSuicide.should.be.exactly(true);
                state.workerEnded.should.be.exactly(false);

                // We ran through all the states!
                done();
            });

            broker.should.be.an.Object();
            Object.keys(broker._workerIds).length.should.be.exactly(1);
            broker._workerIds.ignoredeath.should.be.an.Array();


        });

        it('will force kill a worker whos doing network stuff', function(done) {
            /*

             So where's what's going to happen.

             1. We'll start a broker, and wait to hear from it.
             2. When we get word it's alive, then we'll drain the workers.
             3. Once we confirmed the worker is dead, we'll call the test done.

             */

            const app = new OkanjoApp({}),
                broker = new OkanjoBroker(app, "ignoredeath_server", {workerCount: 1});

            const state = {
                gotAcknowledgement: false,
                sentSuicide: false,
                workerEnded: false
            };

            broker.on('worker_message', function(msg, worker) {
                if (msg === "Reporting for duty") {
                    state.gotAcknowledgement.should.be.exactly(false);
                    state.gotAcknowledgement = true;

                    // Good to go, shut it down
                    state.sentSuicide.should.be.exactly(false);
                    state.sentSuicide = true;
                    process.nextTick(() => {
                        setTimeout(broker.drainWorkers.bind(broker), 10);
                    });

                } else {
                    debug('got message from worker', msg, worker);
                    throw new Error('Should not have received this message from worker');
                }
            });

            broker.on('worker_death', function(event) {
                event.should.be.an.Object();
                throw new Error('Worker should not have died unless we told it to.');
            });

            broker.on('worker_ended', function(event) {
                event.should.be.an.Object();
                state.gotAcknowledgement.should.be.exactly(true);
                state.sentSuicide.should.be.exactly(true);
                state.workerEnded.should.be.exactly(false);

                // We ran through all the states!
                done();
            });

            broker.should.be.an.Object();
            Object.keys(broker._workerIds).length.should.be.exactly(1);
            broker._workerIds.ignoredeath_server.should.be.an.Array();


        });

        it('should receive ops messages', function(done) {

            /*

             So where's what's going to happen.

             1. We'll start a broker, and wait to hear from it.
             2. When we get word it's alive, and we have an ops message, then we'll drain the workers.
             3. Once we confirmed the worker is dead, we'll call the test done.

             */

            const app = new OkanjoApp({}),
                broker = new OkanjoBroker(app, "ops", {workerCount: 1});

            const state = {
                gotAcknowledgement: false,
                gotOpsMessage: false,
                sentSuicide: false,
                workerEnded: false
            };

            broker.on('worker_message', function (msg, worker) {
                msg.should.be.ok();
                worker.should.be.instanceof(cluster.Worker);

                if (msg === "Reporting for duty") {

                    // Should have already gotten the ops message
                    state.gotOpsMessage.should.be.exactly(true);

                    state.gotAcknowledgement.should.be.exactly(false);
                    state.gotAcknowledgement = true;
                } else {
                    debug('got message from worker', msg, worker);
                    throw new Error('Should not have received this message from worker');
                }
            });

            broker.on('worker_ops', function(msg, worker) {

                debug('received ops!');

                msg.should.be.an.Object();
                msg.type.should.be.exactly('ops');
                msg.data.should.be.an.Object();
                worker.should.be.instanceof(cluster.Worker);

                state.gotAcknowledgement.should.be.exactly(false);

                state.gotOpsMessage.should.be.exactly(false);
                state.gotOpsMessage = true;

                // Good to go, shut it down
                state.sentSuicide.should.be.exactly(false);
                state.sentSuicide = true;
                debug('drain in progress.');
                setTimeout(broker.drainWorkers.bind(broker), 10);
            });

            broker.on('worker_death', function(event) {
                event.should.be.an.Object();
                throw new Error('Worker should not have died unless we told it to.');
            });

            broker.on('worker_ended', function(event) {
                event.should.be.an.Object();
                state.gotAcknowledgement.should.be.exactly(true);
                state.sentSuicide.should.be.exactly(true);
                state.workerEnded.should.be.exactly(false);

                // We ran through all the states!
                done();
            });

            broker.should.be.an.Object();
            Object.keys(broker._workerIds).length.should.be.exactly(1);
            broker._workerIds.ops.should.be.an.Array();

        });

        it('should handle multiple brokers simultaneously', function(done) {

            const app = new OkanjoApp({}),
                broker1 = new OkanjoBroker(app, "basic", {workerCount: 1}),
                broker2 = new OkanjoBroker(app, "basic2", {workerCount: 1});

            const state = {
                broker1: {
                    gotAcknowledgement: false,
                    sentSuicide: false,
                    workerEnded: false
                },
                broker2: {
                    gotAcknowledgement: false,
                    sentSuicide: false,
                    workerEnded: false
                }
            };

            broker1.on('worker_message', function(msg, worker) {
                if (msg === "Reporting for duty") {
                    state.broker1.gotAcknowledgement.should.be.exactly(false);
                    state.broker1.gotAcknowledgement = true;

                    // Good to go, shut it down
                    state.broker1.sentSuicide.should.be.exactly(false);
                    state.broker1.sentSuicide = true;
                    setTimeout(broker1.drainWorkers.bind(broker1), 10);
                } else {
                    debug('got message from worker', msg, worker);
                    throw new Error('Should not have received this message from worker');
                }
            });

            broker2.on('worker_message', function(msg, worker) {
                if (msg === "Reporting for duty") {
                    state.broker2.gotAcknowledgement.should.be.exactly(false);
                    state.broker2.gotAcknowledgement = true;

                    // Good to go, shut it down
                    state.broker2.sentSuicide.should.be.exactly(false);
                    state.broker2.sentSuicide = true;
                    setTimeout(broker2.drainWorkers.bind(broker2), 10);
                } else {
                    debug('got message from worker', msg, worker);
                    throw new Error('Should not have received this message from worker');
                }
            });

            broker1.on('worker_death', function(event) {
                event.should.be.an.Object();
                throw new Error('Worker should not have died unless we told it to.');
            });

            broker2.on('worker_death', function(event) {
                event.should.be.an.Object();
                throw new Error('Worker should not have died unless we told it to.');
            });

            broker1.on('worker_ended', function(event) {
                event.should.be.an.Object();
                state.broker1.gotAcknowledgement.should.be.exactly(true);
                state.broker1.sentSuicide.should.be.exactly(true);
                state.broker1.workerEnded.should.be.exactly(false);
                state.broker1.workerEnded = true;

                // We ran through all the states!
                if (state.broker1.workerEnded && state.broker2.workerEnded) {
                    done();
                }
            });

            broker2.on('worker_ended', function(event) {
                event.should.be.an.Object();
                state.broker2.gotAcknowledgement.should.be.exactly(true);
                state.broker2.sentSuicide.should.be.exactly(true);
                state.broker2.workerEnded.should.be.exactly(false);
                state.broker2.workerEnded = true;

                // We ran through all the states!
                if (state.broker1.workerEnded && state.broker2.workerEnded) {
                    done();
                }
            });

            broker1.should.be.an.Object();
            Object.keys(broker1._workerIds).length.should.be.exactly(1);
            broker1._workerIds.basic.should.be.an.Array();

            broker2.should.be.an.Object();
            Object.keys(broker2._workerIds).length.should.be.exactly(1);
            broker2._workerIds.basic2.should.be.an.Array();

        });

        it('should recycle workers on specified interval', function(done) {
            const app = new OkanjoApp({}),
                broker = new OkanjoBroker(app, "recycle", {
                    recycleRate: 2100
                });

            const state = {
                firstWorkerId: null,
                firstWorkerGotAcknowledgement: false,
                firstWorkerEnded: false,

                secondWorkerId: null,
                secondWorkerGotAcknowledgement: false,
                sentSuicide: false,
                secondWorkerEnded: false
            };

            broker.on('worker_message', function(msg, worker) {
                if (msg === "Reporting for duty") {

                    if (state.firstWorkerId === null) {
                        should(state.secondWorkerId).be.equal(null);
                        state.firstWorkerId = worker.id;

                        state.firstWorkerGotAcknowledgement.should.be.exactly(false);
                        state.firstWorkerGotAcknowledgement = true;

                        // This is where we wait for the recycler to dump the worker for a new one

                    } else if (state.secondWorkerId === null) {
                        state.secondWorkerId = worker.id;

                        state.firstWorkerEnded.should.be.exactly(true);

                        state.secondWorkerGotAcknowledgement.should.be.exactly(false);
                        state.secondWorkerGotAcknowledgement = true;

                        // Good to go, drain it
                        state.sentSuicide.should.be.exactly(false);
                        state.sentSuicide = true;
                        setTimeout(broker.drainWorkers.bind(broker), 10);

                    } else {
                        throw new Error('Too many worker acks!');
                    }

                } else {
                    debug('got message from worker', msg, worker);
                    throw new Error('Should not have received this message from worker');
                }
            });

            broker.on('worker_death', function(event) {
                event.should.be.an.Object();
                throw new Error('Worker should not have died unless we told it to.');
            });

            broker.on('worker_ended', function(event) {
                event.should.be.an.Object();
                event.id.should.be.ok();

                if (event.id === state.firstWorkerId+"") {

                    state.firstWorkerGotAcknowledgement.should.be.exactly(true);
                    state.firstWorkerEnded.should.be.exactly(false);
                    state.firstWorkerEnded = true;

                } else if (event.id === state.secondWorkerId+"") {

                    state.firstWorkerEnded.should.be.exactly(true);
                    state.secondWorkerGotAcknowledgement.should.be.exactly(true);
                    state.sentSuicide.should.be.exactly(true);
                    state.secondWorkerEnded.should.be.exactly(false);
                    state.secondWorkerEnded = true;

                    // We ran through all the states!
                    done();

                } else {
                    debug(typeof event.id, typeof state.firstWorkerId, state, event);
                    throw new Error('Worker ended that we could not identify!');
                }
            });

            broker.should.be.an.Object();
            Object.keys(broker._workerIds).length.should.be.exactly(1);
            broker._workerIds.recycle.should.be.an.Array();

        });

        it('should be able to resume working after draining', function(done) {

            const app = new OkanjoApp({}),
                broker = new OkanjoBroker(app, "recycle", {});

            const state = {
                firstWorkerId: null,
                firstWorkerGotAcknowledgement: false,
                openedDrain: false,
                firstWorkerEnded: false,

                closedDrain: false,
                secondWorkerId: null,
                secondWorkerGotAcknowledgement: false,

                sentSuicide: false,
                secondWorkerEnded: false
            };

            broker.on('worker_message', function(msg, worker) {
                if (msg === "Reporting for duty") {

                    if (state.firstWorkerId === null) {
                        should(state.secondWorkerId).be.equal(null);
                        state.firstWorkerId = worker.id;

                        state.firstWorkerGotAcknowledgement.should.be.exactly(false);
                        state.firstWorkerGotAcknowledgement = true;

                        // Good to go, recycle it
                        state.openedDrain.should.be.exactly(false);
                        state.openedDrain = true;

                        setTimeout(broker.drainWorkers.bind(broker), 10);

                    } else if (state.secondWorkerId === null) {
                        state.secondWorkerId = worker.id;

                        state.secondWorkerGotAcknowledgement.should.be.exactly(false);
                        state.secondWorkerGotAcknowledgement = true;

                        // Good to go, drain it
                        state.sentSuicide.should.be.exactly(false);
                        state.sentSuicide = true;
                        setTimeout(broker.drainWorkers.bind(broker), 10);

                    } else {
                        throw new Error('Too many worker acks!');
                    }

                } else {
                    debug('got message from worker', msg, worker);
                    throw new Error('Should not have received this message from worker');
                }
            });

            broker.on('worker_death', function(event) {
                event.should.be.an.Object();
                throw new Error('Worker should not have died unless we told it to.');
            });

            broker.on('worker_ended', function(event) {
                event.should.be.an.Object();
                event.id.should.be.ok();

                if (event.id === state.firstWorkerId+"") {

                    state.firstWorkerGotAcknowledgement.should.be.exactly(true);
                    state.openedDrain.should.be.exactly(true);
                    state.firstWorkerEnded.should.be.exactly(false);
                    state.firstWorkerEnded = true;
                    state.openedDrain.should.be.exactly(true);

                    // Close the drain and a new worker should spawn
                    broker.resumeWorkers();

                } else if (event.id === state.secondWorkerId+"") {

                    state.firstWorkerEnded.should.be.exactly(true);
                    state.secondWorkerGotAcknowledgement.should.be.exactly(true);
                    state.sentSuicide.should.be.exactly(true);
                    state.secondWorkerEnded.should.be.exactly(false);
                    state.secondWorkerEnded = true;

                    // We ran through all the states!
                    done();

                } else {
                    debug(typeof event.id, typeof state.firstWorkerId, state, event);
                    throw new Error('Worker ended that we could not identify!');
                }
            });

            broker.should.be.an.Object();
            Object.keys(broker._workerIds).length.should.be.exactly(1);
            broker._workerIds.recycle.should.be.an.Array();

        });

    });

} else {

    // ============================================================================================================

    if (process.env.worker_type !== 'okanjoWorker' && process.env.worker_type !== 'okanjoWorkerDelay') {

        describe('Worker ' + cluster.worker.id, function () {

            after(() => {
                log(); // logs out active handles that are keeping node running
            });

            let shutdown;
            const ack = function () {
                // Tell the broker we're alive
                debug('Worker started', cluster.worker.id, process.env.worker_type);
                process.nextTick(function () {
                    process.send('Reporting for duty');
                });
            };

            // Handle messages from the broker
            process.on('message', function (msg) {
                // Suicide!
                if (msg === "suicide") {
                    if (process.env.worker_type.indexOf('ignoredeath') !== 0) {
                        if (shutdown) {
                            debug('got shutdown, attempting shutdown...');
                            shutdown();
                        } else {
                            throw new Error('Told to shutdown but shutdown is not bound yet! WTF?');
                        }
                    } else {
                        debug('ignoring shutdown request cuz we are rebellious');
                    }

                } else if (msg === 'crash') {
                    // Simulate kaboom!
                    debug('crashing this worker id=' + cluster.worker.id);
                    process.exit(1337);
                } else {
                    debug('Got message', msg);
                    throw new Error('Dunno what this message is or why i received it');
                }
            });

            it('should have the basic process info', function () {
                // We should always have an env set, even if it's "default"
                process.env.env.should.be.ok();

                // We should always have a worker type
                process.env.worker_type.should.be.ok();
            });

            it('should end when told to do so', function (done) {
                shutdown = done;
            });

            switch (process.env.worker_type) {
                case 'ops':
                    process.nextTick(function () {
                        process.send({
                            type: 'ops',
                            data: {}
                        });
                        debug('sent ops');
                    });

                    ack();
                    break;

                case 'ignoredeath':

                    ack();
                    break;

                case 'ignoredeath_server':
                    process.nextTick(function () {

                        //noinspection JSUnusedLocalSymbols
                        const net = require('net'),
                            server = net.createServer(function (/*socket*/) {
                                // connections never end
                                debug('got local faux server client connection');
                            });

                        debug('starting faux worker server');

                        server.listen(function () {

                            debug('started server, hopefully', server.address());
                            debug('connecting..');
                            const client = net.createConnection({port: server.address().port}, () => {
                                debug('connected to local faux server');
                                ack(); // dont kill us until we got an open socket
                            });

                            client.on('error', (err) => {
                                debug('got client err', err);
                            });

                            // done();
                        });

                        server.on('error', (err) => {
                            debug('got server err', err);
                        });

                        debug('did listen');
                    });

                    break;

                case 'basic':

                    ack();
                    break;

                case 'recycle':

                    ack();
                    break;

                default:

                    ack();
                    break;
            }

        });
    }

}