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
                this.options = {
                    url: cnctInfo.url,
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
            let res = await this.cnct.iaCloudRequest(reqBody);
            if (res.FDSKey === reqBody.FDSKey && res.FDSType === reqBody.FDSType 
               && ((res.userID === reqBody.userID && info.protocol === "REST1") || (info.protocol !== "REST1"))
            ) {
                // ここで、serviceIDをconfiguration nodeである自身の接続情報にセットする
                info.serviceID = res.serviceID;
                info.status = "Connected";
                info.cnctTs = moment().format();
                return res;
            } else {
                throw new iaCError.IaCloudAPIError();
            }
        } catch(error) {
            info.serviceID = "";
            info.status = "Disconnected";
            throw error;
        } finally {
            this.cnctInfo = info;
            this.fContext.set(this.cnctInfoName, info);
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
            let res = await this.cnct.iaCloudRequest(reqBody);

            if (res.serviceID === reqBody.serviceID 
                    && res.FDSKey === info.FDSKey ) {

                // ここで、serviceIDをconfiguration nodeである自身の接続情報にセットする
                info.serviceID = res.newServiceID;
                info.status = "Connected";
                info.lastReqTs = moment().format();
                return res;
            } else {
                throw new iaCError.IaCloudAPIError();
            }
        } catch(error) {
            info.serviceID = "";
            info.status = "Disconnected";
            throw error;
        } finally {
            this.cnctInfo = info;
            this.fContext.set(this.cnctInfoName, info);
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
            let res = await this.cnct.iaCloudRequest(reqBody, fileRs);
            if (res.serviceID === reqBody.serviceID && res.status.toLowerCase() === "ok" )  {

                // ここで、serviceIDをconfiguration nodeである自身の接続情報にセットする
                info.serviceID = res.newServiceID;
                info.status = "Connected";
                info.lastReqTs = moment().format();
                return res;
            } else {
                throw new iaCError.IaCloudAPIError();
            }
        } catch(error) {
            info.serviceID = "";
            info.status = "Disconnected";
            throw error;
        } finally {
            this.cnctInfo = info;
            this.fContext.set(this.cnctInfoName, info);
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
            let res = await this.cnct.iaCloudRequest(reqBody);

            if (res.serviceID === reqBody.serviceID && res.status.toLowerCase() === "ok" )  {

                // ここで、serviceIDをconfiguration nodeである自身の接続情報にセットする
                info.serviceID = res.newServiceID;
                info.status = "Connected";
                info.lastReqTs = moment().format();
                return res;
            } else {
                throw new iaCError.IaCloudAPIError();
            }
        } catch(error) {
            info.serviceID = "";
            info.status = "Disconnected";
            throw error;
        } finally {
            this.cnctInfo = info;
            this.fContext.set(this.cnctInfoName, info);
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
            let res = await this.cnct.iaCloudRequest(reqBody);

            if (res.serviceID === reqBody.serviceID && res.status.toLowerCase() === "ok" )  {

                // ここで、serviceIDをconfiguration nodeである自身の接続情報にセットする
                info.serviceID = res.newServiceID;
                info.status = "Connected";
                info.lastReqTs = moment().format();
                return res;
            } else {
                throw new iaCError.IaCloudAPIError();
            }
        } catch(error) {
            info.serviceID = "";
            info.status = "Disconnected";
            throw error;
        } finally {
            this.cnctInfo = info;
            this.fContext.set(this.cnctInfoName, info);
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
            let res = await this.cnct.iaCloudRequest(reqBody);

            if (res.userID === options.username &&
                res.FDSKey === info.FDSKey && 
                res.serviceID === reqBody.serviceID ) {

                // ここで、serviceIDをconfiguration nodeである自身の接続情報にセットする
                info.serviceID = "";
                info.status = "Disconnected";
            } else {
                throw new iaCError.IaCloudAPIError();
            }
        } catch(error) {
            throw error;
        } finally {
            this.cnctInfo = info;
            this.fContext.set(this.cnctInfoName, info);
        }
    };

    closeConnection = async () => {
        await this.cnct.closeConnection();
    };
}
module.exports = iaCloudConnection;