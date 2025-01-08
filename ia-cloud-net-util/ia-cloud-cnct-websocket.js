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

const moment = require("moment");
const iaCError = require("./ia-cloud-error");
const WebSocket = require('ws');
const TIMEOUT = 5 * 1000;

class iaCloudV2websocket {

    constructor(options) {

        this.options = options;
    };

    _websocketPrepare = async (options) => {

        // instanciate websocket class
        const socket =  new WebSocket(options.url);
        await new Promise((resolve) => {
            socket.on('open', () => {
                this.wbs = socket;
                resolve (this.wbs);
            });
        });
    }

    _websocketReconnect = async () => {
        let wbsStatus = this.wbs.readyState;
        // Check websocket connection status
        if (wbsStatus === WebSocket.CLOSING || wbsStatus === WebSocket.CONNECTING)
            // waiting for the status settled
            setTimeout(this._websocketReconnect, 100);
        else if (wbsStatus === WebSocket.CLOSED)
            // remake a websocket
            await this._websocketPrepare(this.options);
    }

    _sendStreamMessage = async (stream, ws) => {
        await new Promise((resolve, reject) => {
            stream.on("data", (chunk) => {
                ws.send(chunk);
            });
            stream.on("end", () => {
                resolve;
            });
        })
    }

    // a innternal method for http requests
    iaCloudRequest = async (reqBodyStream) => {

        // if websocket dose not exist, make it
        if (!this.wbs) await this._websocketPrepare(this.options);
        // check websocket connection 
        await this._websocketReconnect();

        try {

            let resBody = "";
            await new Promise((resolve, reject) => {

                // recieving a response message from the CCS
                this.wbs.on("message", (data) => {
                    // when the response message has come
                    try {
                        // Convert the JSON body to the object
                        resBody = JSON.parse(data); 
                        resolve(resBody);
                    }
                    catch(err) {
                        reject(new iaCError.JsonParseError(err));
                    }
                });
                this.wbs.on("error", (err) => { 
                    reject(err);
                });
                // sending a request stream to the CCS
                this._sendStreamMessage(reqBodyStream, this.wbs);
                // set timeout timer
                this.timeoutId = setTimeout(() => {
                    reject(new iaCError.IaCloudTimeoutError());
                }, TIMEOUT);

            });
            // clear the timeout timer and return a response object
            if (this.timeoutId) clearTimeout(this.timeoutId);
            this.wbs.removeAllListeners();

            return (resBody);
        } 
        catch (err) {
console.log(err.code + " Websocket@ " + moment().format('DDTHH:mm:ss.SSS'));
            this.wbs.removeAllListeners();
            if(err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT'
                                        || err.code === 'ENOTFOUND') {
                throw new iaCError.IaCloudLowerError(err);
            } else if (err.code === "IACLOUD_TIMEDOUT_ERR") {
                throw err;
            }else {
                throw err;
            }
        }
    };
    closeConnection = async () => {
        if (!this.wbs) await this.wbs.close();
    };
}
module.exports = iaCloudV2websocket;