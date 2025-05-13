/*
 * Copyright 2019 Hiro Hashimukai on the ia-cloud project

 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
The readme of the Got package V12 say
Warning: This package is native ESM and no longer provides a CommonJS export.
If your project uses CommonJS, you will have to convert to ESM. 
Please don't open issues for questions regarding CommonJS / ESM.

Got v11 is no longer maintained and we will not accept any backport requests. 
*/

// const got = require('got');
// Also could not use ESM 
// import got from 'got';
// see async _iaCloudRequest() with dynamic import of Got package
//     const { got } = await import('got');

"use strict";
const moment = require("moment");
const Stream = require("stream");
const fs = require("fs");


const rest = require("./ia-cloud-cnct-rest");
const wbs = require("./ia-cloud-cnct-websocket");
const iaCError = require("./ia-cloud-error");
const crypto = require('crypto');

class iaCloudConnection {

    constructor( fContext, cnctInfoName, auth) {
        this.fContext = fContext;
        this.cnctInfoName = cnctInfoName;
        this.cnctInfo = fContext.get(cnctInfoName);
        let cnctInfo = this.cnctInfo;

        // called with a connection info.
        if (cnctInfo.hasOwnProperty("FDSKey")) {
            this.options = {};
            if (cnctInfo.protocol === "REST1" || cnctInfo.protocol === "REST2") {
                // set http request options           
                this.options = {
                    url: cnctInfo.url,
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    username: auth.username,
                    password: auth.password,
                    maxRedirects: 21,
                    // timeout option have to be an object
                    timeout: {
                        request: cnctInfo.reqTimeout
                    },
                    responseType: "text"
                };
                this.cnct = new rest(this.options);
                // proxy configuration with the proxy agent
                if (cnctInfo.proxy) 
                    this.options.agent = {https: new HttpsProxyAgent(cnctInfo.proxy)}
            }
            else if (cnctInfo.protocol === "websocket") {
                let url = 
                this.options = {
                    url: cnctInfo.url+"?FDSKey="+encodeURIComponent(cnctInfo.FDSKey),
                    username: auth.username,
                    password: auth.password,
                    maxRedirects: 21,
                    proxy: cnctInfo.proxy,
                    timeout: cnctInfo.reqTimeout
                };
                // instanciate websocket class
                this.cnct = new wbs(this.options);
            }
        }
        this.fContext.set(cnctInfoName, cnctInfo);

    };

    #iaCloudRequest = async (reqBody, objStream) => {
        let res = null;
        let cnt = 0;
        let info = this.cnctInfo;
        let options =this.options;

        while(true) {
            try {
                //send a request to CCS
                res = await this.cnct.iaCloudRequest(reqBody, objStream);

                // check a response
                switch (reqBody.request) {
                    case "connect":
                        if (res.FDSKey !== reqBody.FDSKey || res.FDSType !== reqBody.FDSType) 
                            throw new iaCError.IaCloudAPIError();
                        info.serviceID = res.serviceID;
                        info.status = "Connected";
                        info.cnctTs = moment().format();
                        break;
                    case "getStatus":
                        if (res.serviceID !== reqBody.serviceID || res.FDSKey !== info.FDSKey)
                            throw new iaCError.IaCloudAPIError();
                        info.serviceID = res.newServiceID;
                        info.status = "Connected";
                        info.lastReqTs = moment().format();
                        break;
                    case "store":
                    case "retrieve":
                    case "retrieveArray":
                        if (res.serviceID !== reqBody.serviceID || res.status.toLowerCase() !== "ok")
                            throw new iaCError.IaCloudAPIError();
                        info.serviceID = res.newServiceID;
                        info.status = "Connected";
                        info.lastReqTs = moment().format();
                        break;
                    case "terminate":
                        if (res.userID !== options.username || res.FDSKey !== info.FDSKey 
                            || res.serviceID !== reqBody.serviceID)
                            throw new iaCError.IaCloudAPIError();
                        info.serviceID = "";
                        info.status = "Disconnected";
                        break;
                }
                // got the response
                break;
            } catch(error) {
                if (++cnt >= 3 || reqBody.request == "connect") {
                    info.serviceID = "";
                    info.status = "Disconnected";
                    // retry error
                    throw error;
                }
                //waiting retry request
                await new Promise (resolve => setTimeout(resolve, 1000));
            } 
        }
        // set back the connection info
        this.cnctInfo = info;
        this.fContext.set(this.cnctInfoName, info);
        return res;
    };

    // a external method for a ia-cloud connect request
    connect = async (auth) => {
        let info = this.cnctInfo;
        let options =this.options;

        // id and pass must be a string 
        if (typeof auth.username !== "string" || typeof auth.password !== "string") {
            throw new iaCError.IaCloudAPIError();
        };
        options.username = auth.username;
        options.password = auth.password;

        // connect リクエストのリクエストボディ
        let reqBody = {
            request: "connect",
            FDSKey: info.FDSKey,
            FDSType: "iaCloudFDS",
            timestamp: moment().format(),
            comment: info.comment
        }
        if (info.protocol === "REST1") reqBody.userID = options.username;
        if (info.protocol === "websocket") 
            reqBody.Authorization = "Basic " + Buffer.from(options.username + ":" + options.password).toString("base64");

        try {
            return await this.#iaCloudRequest(reqBody);

        } catch(error) {
            throw error;
        }
    };

    getStatus = async () => {
        let info = this.cnctInfo;

        // getStatus リクエストのリクエストボディ
        let reqBody = {
            request: "getStatus",
            serviceID: info.serviceID,
            timestamp: moment().format(),
            comment: info.comment
        }
        try {
            return await this.#iaCloudRequest(reqBody);
        } catch(error) {
            throw error;
        }

    };

    store = async (obj) => {
        let info = this.cnctInfo;
        let fileRs = null;
        // リクエストのリクエストボディ
        let reqBody = {
            request: "store",
            serviceID: info.serviceID,
            dataObject: obj
        }
        
        // file data contentType, make requestbody stream from file
        if ((obj.objectType === "iaCloudObject") && (obj.objectContent.contentType === "Filedata"))  {
            let contD = obj.objectContent.contentData;
            // find file path to read
            let ind = contD.findIndex(obj => {
                return obj.commonName === "file path";
            });
            if (ind === -1) throw new Error("no file path");
            let path = contD[ind].dataValue;
            // delete file path entry from contentData 
            contD.splice(ind, 1);
            // insert encoded data entry to contentData[]
            contD.push({
                commonName: "Encoded data", 
                dataValue: "__= file content__"
            });
                
            try {
                // encoded data stream from the file
                fileRs = fs.createReadStream(path);
            }
            catch (err) {
                reject (err);
            }
        }

        try {
            return await this.#iaCloudRequest(reqBody, fileRs);
        } catch(error) {
            throw error;
        }
    }

    retrieve = async (obj) => {

        let info = this.cnctInfo;

        // リクエストのリクエストボディ
        let reqBody = {
            request: "retrieve",
            serviceID: info.serviceID,
            retrieveObject: obj
        };

        try {
            return await this.#iaCloudRequest(reqBody);
        } catch(error) {
            throw error;
        }
    };
    
    retrieveArray = async (obj) => {

        let info = this.cnctInfo;

        // リクエストのリクエストボディ
        let reqBody = {
            request: "retrieveArray",
            serviceID: info.serviceID,
            retrieveObjects: obj
        };

        try {
            // make request body to the stream, and send
            return await this.cnct.iaCloudRequest(reqBody);
        } catch(error) {
            throw error;
        }
    };

    convey = async (obj) => {

        let info = this.cnctInfo;
    };

    terminate = async () => {
        let info = this.cnctInfo;
        let options =this.options;

        //terminateリクエストのリクエストボディ
        let reqBody = {
            request: "terminate",
            serviceID: info.serviceID,
        };

        try {
            return await this.cnct.iaCloudRequest(reqBody);
        } catch(error) {
            throw error;
        }
    };

    closeConnection = async () => {
        await this.cnct.closeConnection();
    };
}
module.exports = iaCloudConnection;