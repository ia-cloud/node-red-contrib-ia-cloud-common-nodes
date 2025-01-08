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

// The readme of the Got package V12 says
/*
Warning: This package is native ESM and no longer provides a CommonJS export.
If your project uses CommonJS, you will have to convert to ESM. 
Please don't open issues for questions regarding CommonJS / ESM.

Got v11 is no longer maintained and we will not accept any backport requests. */

// const got = require('got');
// need 'hpagent' package for proxy connection on Got12
const { HttpsProxyAgent } = require('hpagent');
const iaCError = require("./ia-cloud-error");

class iaCloudCnctRest {

    constructor(opts) {

        this.options = {};
        Object.assign(this.options, opts);

        // other options for Got package
        this.options.responseType = "text";
    };

    // a external method for http requests
    iaCloudRequest = async (reqBodyStream) => {

        let options = this.options;

        let resBodyStream;
        let resbody = "";

        try {
            // if request object dose not exist, make it
            if (!this.got){
                try {
                const { got } = await import ('got');
                this.got = got;
                }
                catch (err) {
                    console.log(err);    
                }
            }
            // promisify streaming from POST request 
            await new Promise((resolve, reject) => {                

                // send POST request and create readable stream of the response
                resBodyStream = reqBodyStream.pipe(this.got.stream(options));
                // POST response recieved
                resBodyStream.on ("response", async response => {
                    if (response.statusCode !== 200) {
                        // response status code not 200 ok
                        reject(new iaCError.IaCloudLowerError());
                    }
                });
                resBodyStream.on("data", (chunk) => {
                    resbody += chunk;
                });
                resBodyStream.on("end", () => {
                    resolve(resbody);
                });
                resBodyStream.on("error", (err) => {
                    reject(err);
                });
            });
            resBodyStream.destroy();
            // Convert the JSON body to the object, and return
            try {
                return JSON.parse(resbody);
            } catch (err) {
                throw new iaCError.JsonParseError(err);
            }
        }
        catch(err) {
console.log(err.code + " REST@ " + moment().format('DDTHH:mm:ss.SSS'));
            resBodyStream.destroy();
            if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT'
                    || err.code === 'ENOTFOUND') {     
                throw new iaCError.IaCloudLowerError(err);
            } else {
                throw err;
            }
            
        }
    };
    closeConnection = async () => {
        resBodyStream.destroy();
    };
}
module.exports = iaCloudCnctRest;