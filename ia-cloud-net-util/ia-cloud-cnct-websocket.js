/**
 * Copyright 2019 Hiro Hashimukai on the ia-cloud project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

const moment = require("moment");   // just for trace
const iaCError = require("./ia-cloud-error");
const iaCReqBodyMaker = require("./ia-cloud-request-body-maker");
const WebSocket = require('ws');
const crypto = require('crypto');
const TIMEOUT = 30 * 1000;
const MAXATTEMPTS = 5;

class iaCloudV2websocket {

    constructor(options) {

        this.options = options;
        this.messages = new Map();
    };

    _websocketPrepare = async (options) => {
        try {
            // instanciate websocket class
            await new Promise((resolve,reject) => {
                const socket =  new WebSocket(options.url);
                socket.on('open', () => {
                    this.wbs = socket;
                    resolve (this.wbs);
                });
                socket.on('error', (error) => {
                    reject (error);
                });
            });
            // when response message received
            this.wbs.on('message', (data) => {
                // parse JSON to get a response object
                const response = JSON.parse(data);
                // get message ID
                const id = response.id;
                delete response.id;
                // get a resolve function from the messages Map
                if (this.messages.has(id)) {
                    const resolver = this.messages.get(id);
                    this.messages.delete(id);
                    resolver(response);
                }
            });
        } catch (err) {
            throw (new iaCError.IaCloudLowerError(err));
        }
    }

    _websocketReconnect = async () => {
        const delay = (TIMEOUT - 1000) / MAXATTEMPTS;

        let wbsStatus = this.wbs.readyState;
        for (let attempt = 0; attempt < MAXATTEMPTS; attempt++) {
            if (wbsStatus === WebSocket.OPEN) {
                return;
            }
            if (wbsStatus === WebSocket.CLOSED) {
                try {
                    // remake a websocket
                    await this._websocketPrepare(this.options);
                    return
                } catch (error) {
                    throw (error);
                }
            }
            // waiting CONNECTING or CLOSING status over
            await new Promise (resolve => setTimeout(resolve, delay));
        }
        // Max reconnection attempts reached
        throw new iaCError.IaCloudLowerError("can't open websocket");
    }

    _sendStreamMessage = async (reqBody, objStream) => {
        return new Promise((resolve, reject) => {
            // add websocket message ID
            reqBody.id = crypto.randomUUID();
            // make a request message stream
            const reqBodyStream = iaCReqBodyMaker(reqBody, objStream);
            // sending a message stream
            reqBodyStream.on("data", (chunk) => {
                this.wbs.send(chunk);
            });
            // when a request message is sent
            reqBodyStream.on("end", () => {
                // set the timeout
                const timeoutId = setTimeout(() => {
                    this.messages.delete(reqBody.id);
                    reject(new iaCError.IaCloudTimeoutError());
                }, TIMEOUT);
                // store resolve function to the request maessage map
                this.messages.set(reqBody.id, (response) => {
                    clearTimeout(timeoutId);
                    resolve(response);
                });
            });
        })   
    }

    _closeConnection = () => {
        return new Promise((resolve) => {
            this.wbs.on('close', () => {
              resolve();
            });
            this.wbs.close();
        })
    }

    // a method for websocket requests
    iaCloudRequest = async (reqBody, objStream) => {

        try{
            // if websocket dose not exist, make it
            if (!this.wbs) await this._websocketPrepare(this.options);
            // check websocket connection 
            await this._websocketReconnect();
            const resBody = await this._sendStreamMessage(reqBody, objStream);
            return resBody;

        } catch (err) {
            if(err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT'
            || err.code === 'ENOTFOUND') {
                throw new iaCError.IaCloudLowerError(err);
            } else {
                throw err;
            }
        }
    }
    closeConnection = async () => {
        this._closeConnection();
    };
}
module.exports = iaCloudV2websocket;